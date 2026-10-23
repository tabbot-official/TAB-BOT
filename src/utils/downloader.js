import { operatorNumbers } from '../permissions/operators.js';
import {getPerformanceProfile,mediaDelay} from './performanceMode.js';
import {safeRead} from '../recovery/index.js';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import config from '../config/config.js';
import logger from './logger.js';
import { safeFileName } from './fileManager.js';
import { featOn } from '../config/features.js';

/** Error with a message that is safe to show to a WhatsApp user. */
export class DownloadError extends Error {
  constructor(userMessage, { code = 'FAILED', cause } = {}) {
    super(userMessage);
    this.name = 'DownloadError';
    this.userMessage = userMessage;
    this.code = code;
    this.cause = cause;
  }
}

/* ------------------------------ queue ------------------------------ */

const numOf = (j = '') => String(j).split('@')[0].split(':')[0];
const isOwnerUser = (userId) => { const o = numOf(config.ownerNumber || ''); const u = numOf(userId); return !!u && (u === o || operatorNumbers().includes(u)); };
// RAM gate for the owner "never refuse" mode: start new downloads only while RSS is
// under the gate, so unlimited queueing can never crash the 909MB box.
const RAM_GATE_MB = Number(process.env.JARVIS_DL_RAM_GATE_MB) || 600;
const ramOk = () => process.memoryUsage().rss / 1048576 < RAM_GATE_MB;

export class DownloadQueue {
  constructor({ concurrency, maxQueue, maxPerUser, profile }) {
    this.concurrency = concurrency;
    this.profile = profile;
    this.maxQueue = maxQueue;
    this.maxPerUser = maxPerUser;
    this.running = 0;
    this.waiting = [];
    this.perUser = new Map();
  }

  get stats() {
    return { running: this.running, waiting: this.waiting.length };
  }

  /** What one user can see: their own job count and where their first waiting job sits. */
  userStatus(userId) {
    const idx = this.waiting.findIndex((j) => j.userId === userId);
    return { mine: this.perUser.get(userId) || 0, position: idx < 0 ? 0 : idx + 1, ...this.stats };
  }

  /** Adds a job. `onQueued(position)` fires if the job has to wait. */
  add(userId, task, onQueued) {
    const owner = isOwnerUser(userId) && featOn('dlqueue');
    const mine = this.perUser.get(userId) || 0;
    if (!owner && mine >= this.maxPerUser) {
      throw new DownloadError(`⏳ You already have ${mine} download(s) in progress. Please wait for them to finish.`, { code: 'USER_LIMIT' });
    }
    if (this.waiting.length >= (owner ? 25 : this.maxQueue)) {
      throw new DownloadError('⏳ The download queue is full right now. Please try again in a few minutes.', { code: 'QUEUE_FULL' });
    }
    this.perUser.set(userId, mine + 1);
    return new Promise((resolve, reject) => {
      const job = { task, resolve, reject, userId };
      if (this.waiting.length || this.running >= (this.profile?.().concurrency || this.concurrency) || !ramOk()) {
        this.waiting.push(job);
        onQueued?.(this.waiting.length);
        this.#retrySoon();
      } else {
        this.#start(job);
      }
    });
  }

  #start(job) {
    this.running++;
    Promise.resolve()
      .then(async()=>{if(this.profile)await mediaDelay();return job.task();})
      .then(job.resolve, job.reject)
      .finally(() => {
        this.running--;
        const left = (this.perUser.get(job.userId) || 1) - 1;
        if (left <= 0) this.perUser.delete(job.userId);
        else this.perUser.set(job.userId, left);
        while(this.waiting.length && this.running < (this.profile?.().concurrency || this.concurrency) && ramOk()) this.#start(this.waiting.shift());
        if (this.waiting.length) this.#retrySoon();
      });
  }

  #retrySoon() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      while(this.waiting.length && this.running < (this.profile?.().concurrency || this.concurrency) && ramOk()) this.#start(this.waiting.shift());
      if (this.waiting.length) this.#retrySoon();
    }, 10_000);
    this.retryTimer.unref?.();
  }
}

export const downloadQueue = new DownloadQueue({
  concurrency: config.limits.concurrent,
  profile: getPerformanceProfile,
  maxQueue: config.limits.maxQueue,
  maxPerUser: config.limits.maxJobsPerUser,
});

/* ------------------------------ yt-dlp ------------------------------ */

/**
 * Runs yt-dlp with an argument ARRAY (never through a shell), so user input
 * cannot be interpreted as shell commands.
 */
export function runYtDlp(args, { cwd, timeoutMs = config.limits.maxDownloadSeconds * 1000, useCookies = true, defaultClients = false } = {}) {
  return new Promise((resolve, reject) => {
    const base = ['--no-warnings', '--no-playlist', '--no-config', '--ignore-config', '--no-cache-dir', '--js-runtimes', 'node', '--retries', '3', '--fragment-retries', '3', '--socket-timeout', '25'];
    if (useCookies && config.tools.cookies) base.push('--cookies', config.tools.cookies);
    if (!defaultClients) base.push('--extractor-args', 'youtube:player_client=' + (process.env.YTDLP_CLIENTS || 'tv,android,ios,web_safari,mweb'));
    const child = spawn(config.tools.ytdlp, [...base, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${path.dirname(config.tools.ffmpeg)}${path.delimiter}${process.env.PATH}` },
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (stdout.length < 2_000_000) stdout += d;
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < 200_000) stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new DownloadError('❌ The download tool is not available on this server.', { code: 'NO_TOOL', cause: err }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return reject(new DownloadError('⏱️ The download took too long and was cancelled.', { code: 'TIMEOUT' }));
      if (code !== 0) return reject(new DownloadError('❌ Unable to download this.', { code: classifyYtDlpError(stderr), cause: new Error(stderr.slice(-500)) }));
      resolve({ stdout, stderr });
    });
  });
}

export function classifyYtDlpError(stderr = '') {
  const s = stderr.toLowerCase();
  if (s.includes('private video') || s.includes('sign in to confirm your age') || s.includes('members-only') || s.includes('login required')) return 'PRIVATE';
  if (s.includes('video unavailable') || s.includes('is unavailable') || s.includes('has been removed') || s.includes('does not exist') || s.includes('account associated') || s.includes('terminated')) return 'UNAVAILABLE';
  if (s.includes('not available in your country') || s.includes('blocked it in your country') || s.includes('geo')) return 'REGION';
  if (s.includes('confirm you') && s.includes('not a bot')) return 'BOT_CHECK';
  if (s.includes('http error 429') || s.includes('too many requests') || s.includes('rate-limit') || s.includes('rate limit')) return 'RATE_LIMIT';
  if (s.includes('is live') || s.includes('live event') || s.includes('premieres in') || s.includes('this live stream')) return 'LIVE';
  if (s.includes('requested format is not available') || s.includes('no video formats found')) return 'FORMAT';
  if (s.includes('drm') || s.includes('copyright')) return 'DRM';
  if (s.includes('larger than max-filesize') || s.includes('max-filesize')) return 'TOO_LARGE';
  if (s.includes('unsupported url')) return 'UNSUPPORTED';
  if (s.includes('unable to download') || s.includes('timed out') || s.includes('connection') || s.includes('network') || s.includes('getaddrinfo')) return 'NETWORK';
  return 'FAILED';
}

const CODE_MESSAGES = {
  PRIVATE: '🔒 This video is private, age-restricted or members-only, so I cannot download it.',
  UNAVAILABLE: '❌ This video is unavailable. It may have been deleted or the link is wrong.',
  REGION: '🌍 This content is not available in the region where the bot runs.',
  BOT_CHECK: '🤖 YouTube is blocking automated downloads from this server right now. Please try again later.',
  TOO_LARGE: null, // filled by caller with limits
  UNSUPPORTED: '❌ That link is not supported.',
  RATE_LIMIT: '⏳ The site is limiting requests from this server right now. Please try again in a few minutes.',
  LIVE: '🔴 This is a live stream or an upcoming premiere. Try again after it has ended.',
  FORMAT: '❌ This video has no downloadable format available right now. Try another link.',
  DRM: '🔒 This content is copy-protected, so I cannot download it.',
  NETWORK: '📡 Network problem while downloading. Please try again in a moment.',
  FAILED: '❌ Unable to download this.\n\nThe link may be invalid, unavailable, private, or unsupported.',
};

export function friendlyYtDlpError(err, maxMb) {
  if (err instanceof DownloadError && err.code in CODE_MESSAGES) {
    if (err.code === 'TOO_LARGE') return `📦 This file is larger than the ${maxMb} MB limit.`;
    if (err.code === 'FAILED') return CODE_MESSAGES.FAILED;
    return CODE_MESSAGES[err.code];
  }
  return err instanceof DownloadError ? err.userMessage : CODE_MESSAGES.FAILED;
}

/* ------------------------------ plain HTTP ------------------------------ */

/**
 * Downloads a media file over HTTPS from an allow-listed host only,
 * with a hard size cap and timeout. Returns { path, size, contentType }.
 */
export async function httpDownload(url, destDir, { allowedHosts, baseName = 'media', allowedTypes = [/^image\//, /^video\//], maxBytes = config.limits.maxFileBytes } = {}) {
  const u = new URL(url);
  const hostOk = allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  if (u.protocol !== 'https:' || !hostOk) throw new DownloadError('❌ That media source is not allowed.', { code: 'BLOCKED_HOST' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.limits.maxDownloadSeconds * 1000);
  try {
    const res = await safeRead(() => fetch(u, { signal: ctrl.signal, redirect: 'error', headers: { 'user-agent': 'Mozilla/5.0 (compatible; WhatsAppBot/1.0)' } }),{attempts:2});
    if (!res.ok || !res.body) throw new DownloadError('❌ The media could not be fetched.', { code: 'NETWORK' });
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!allowedTypes.some((re) => re.test(contentType))) throw new DownloadError('❌ That link does not contain supported media.', { code: 'BAD_TYPE' });
    const declared = Number(res.headers.get('content-length'));
    if (declared && declared > maxBytes) throw new DownloadError('TOO_LARGE', { code: 'TOO_LARGE' });

    const ext = extFromType(contentType) || path.extname(u.pathname).slice(0, 6) || '.bin';
    const dest = path.join(destDir, `${safeFileName(baseName)}${ext.startsWith('.') ? ext : `.${ext}`}`);
    let received = 0;
    const limiter = new (await import('node:stream')).Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        if (received > maxBytes) return cb(new DownloadError('TOO_LARGE', { code: 'TOO_LARGE' }));
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), limiter, createWriteStream(dest, { flags: 'wx' }));
    return { path: dest, size: received, contentType };
  } catch (err) {
    if (err instanceof DownloadError) throw err;
    if (err.name === 'AbortError') throw new DownloadError('⏱️ The download took too long and was cancelled.', { code: 'TIMEOUT', cause: err });
    throw new DownloadError('📡 Network problem while downloading. Please try again in a moment.', { code: 'NETWORK', cause: err });
  } finally {
    clearTimeout(timer);
  }
}

function extFromType(t) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm' }[t];
}

export async function fileSize(p) {
  return (await fs.stat(p)).size;
}

export { logger };
