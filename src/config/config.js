import { mkdirSync } from 'node:fs';
import 'dotenv/config';
import './envPlaceholders.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import settings from './settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const str = (k, d = '') => (process.env[k] ?? d).toString().trim();
const bool = (k, d = false) => {
  const v = str(k, String(d)).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
};
const num = (k, d, min = 0) => {
  const n = Number(str(k, String(d)));
  return Number.isFinite(n) && n >= min ? n : d;
};
const dir = (k, d) => path.resolve(root, str(k, d) || d);
const digits = (v) => v.replace(/\D/g, '');

// Tab: memory limit of this container (cgroup v2/v1) in MB, or the machine's RAM. Small panel servers (KataBump: 308 MB)
// get smaller defaults so a 1080p video re-encode (ffmpeg ~124 MB) plus the bot (~200 MB) does not exceed the limit.
function containerMemoryMB() {
  let m = 0; try { m = os.totalmem() || 0; } catch { /* ignore */ }
  for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) { try { const n = Number(fs.readFileSync(p, 'utf8').trim()); if (n > 0 && (!m || n < m)) m = n; } catch { /* not limited */ } }
  return m ? Math.floor(m / 1048576) : Infinity;
}

function findBin(name, envKey, extra = []) {
  const explicit = str(envKey);
  if (explicit) return explicit;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const local = path.join(root, 'bin', exe);
  if (fs.existsSync(local)) return local;
  return extra.find((p) => p && fs.existsSync(p)) || name;
}

async function ffmpegFromPackage() {
  try {
    const mod = await import('ffmpeg-static');
    return mod.default || null;
  } catch {
    return null;
  }
}

const config = {
  root,
  botName: settings.bot.name || str('BOT_NAME', 'Tab'),
  prefix: str('PREFIX', '.') || '.',
  ecosystem: settings.ecosystem,
  ownerNumber: settings.owner.number || digits(str('OWNER_NUMBER')),
  pairingNumber: digits(str('PAIRING_NUMBER')),
  autoStatusView: settings.bot.autoStatusView ?? bool('AUTO_STATUS_VIEW', false),
  allowGroups: settings.bot.allowGroups ?? bool('ALLOW_GROUPS', true),
  ownerOnly: settings.bot.ownerOnly ?? bool('OWNER_ONLY', false),
  paths: {
    downloads: dir('DOWNLOAD_FOLDER', './downloads'),
    temp: dir('TEMP_FOLDER', './temp'),
    auth: dir('AUTH_FOLDER', './auth'),
    data: dir('DATA_FOLDER', './data'),
  },
  logLevel: str('LOG_LEVEL', 'info').toLowerCase(),
  limits: {
    maxFileBytes: num('MAX_FILE_SIZE_MB', 100, 1) * 1024 * 1024,
    maxDownloadSeconds: num('MAX_DOWNLOAD_TIME', 300, 10),
    maxInlineVideoBytes: num('MAX_INLINE_VIDEO_MB', 64, 1) * 1024 * 1024,
    maxVideoHeight: num('MAX_VIDEO_HEIGHT', containerMemoryMB() < 512 ? 720 : 1080, 144), // Tab: 1080p re-encode peaks ~124 MB in ffmpeg, 720p ~90 MB
    concurrent: Math.max(1, Math.floor(num('MAX_CONCURRENT_DOWNLOADS', 1, 1))),
    maxQueue: Math.floor(num('MAX_QUEUE_LENGTH', 10, 1)),
    maxJobsPerUser: Math.floor(num('MAX_JOBS_PER_USER', 2, 1)),
    minFreeDiskBytes: num('MIN_FREE_DISK_MB', 150, 0) * 1024 * 1024,
    cooldownMs: num('COMMAND_COOLDOWN', 2, 0) * 1000,
    tempMaxAgeMs: num('TEMP_MAX_AGE_MINUTES', 30, 1) * 60 * 1000,
  },
  tools: {
    ytdlp: findBin('yt-dlp', 'YTDLP_PATH'),
    ffmpeg: str('FFMPEG_PATH') || (await ffmpegFromPackage()) || 'ffmpeg',
    cookies: str('YTDLP_COOKIES'),
  },
};

// A prefix saved with /setprefix wins over PREFIX in .env, so it survives restarts.
try {
  const saved = JSON.parse(fs.readFileSync(path.join(config.paths.data, 'prefix.json'), 'utf8')).prefix;
  if (typeof saved === 'string' && saved && saved.length <= 12) config.prefix = saved;
} catch { /* no saved prefix */ }

// Send/encrypt/convert helpers write scratch files to os.tmpdir(). Point it at the bot's own temp folder
// (cleaned on a timer) so a small or full system /tmp cannot cause ENOSPC mid-send.
try { fsMkTmp(config.paths.temp); process.env.TMPDIR = config.paths.temp; } catch { /* keep system tmp */ }
function fsMkTmp(d) { mkdirSync(d, { recursive: true }); }
export default config;
