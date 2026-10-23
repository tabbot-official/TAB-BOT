// .xvideos: one 18+ command for XVideos, XNXX, Pornhub and xHamster.
//   .xvideos <words>   search all four sites at once, one numbered list
//   .xvideos <number>  download a result from your last search
//   .xvideos <link>    download a video from any of the four sites
// Private chats: anyone can use it. Groups: OFF by default; a group admin (or the bot owner)
// turns it on for that group with ".xvideos on" and off with ".xvideos off" (stored per group,
// key "xvideos" in the group settings store). ".platformdisable xvideos" is the owner's global off switch.
// Search and link extraction: src/vendor/zenbot-nsfw (AxelDev09, MIT). Fallback: the bot's yt-dlp.
// Low-memory: every video is streamed to a temp job folder on disk and removed afterwards.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import axios from 'axios';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { downloadQueue, runYtDlp, DownloadError } from '../utils/downloader.js';
import { createJobDir, removeJobDir, freeDiskBytes, safeFileName } from '../utils/fileManager.js';
import { isDisabled } from '../downloaders/platforms.js';
import { store as groupStore, settings as groupSettings } from '../groups/store.js';
import { permitted } from '../permissions/index.js';
import { xvideosSearch } from '../vendor/zenbot-nsfw/xvideossearch.js';
import { xvideosDownload } from '../vendor/zenbot-nsfw/xvideosdl.js';
import { xnxxSearch } from '../vendor/zenbot-nsfw/xnxxsearch.js';
import { xnxxDownload } from '../vendor/zenbot-nsfw/xnxxdl.js';
import { phSearch } from '../vendor/zenbot-nsfw/phsearch.js';
import { phDownload } from '../vendor/zenbot-nsfw/phdl.js';
import { xhamsterSearch } from '../vendor/zenbot-nsfw/xhamstersearch.js';
import { xhamsterDownload } from '../vendor/zenbot-nsfw/xhammerdl.js';

const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const MB = 1024 * 1024;
export const LIMITS = {
  searchMs: 15_000,
  perSite: 4,
  videoBytes: 16 * MB,                         // WhatsApp inline video
  docBytes: Math.min(100 * MB, config.limits.maxFileBytes || 100 * MB), // WhatsApp document
  downloadMs: Math.max(60_000, (config.limits.maxDownloadSeconds || 300) * 1000),
};

export const SITES = [
  { key: 'xvideos', label: 'XVideos', hosts: ['xvideos.com', 'xvideos2.com', 'xvideos.es', 'xvideos3.com'], referer: 'https://www.xvideos.com/', search: xvideosSearch, info: xvideosDownload },
  { key: 'xnxx', label: 'XNXX', hosts: ['xnxx.com', 'xnxx.es', 'xnxx.tv'], referer: 'https://www.xnxx.com/', search: xnxxSearch, info: xnxxDownload },
  { key: 'pornhub', label: 'Pornhub', hosts: ['pornhub.com', 'pornhub.org'], referer: 'https://www.pornhub.com/', search: phSearch, info: phDownload, ytdlpFirst: true }, // its HLS links answer 410 without the page's cookies; yt-dlp handles them
  { key: 'xhamster', label: 'xHamster', hosts: ['xhamster.com', 'xhamster2.com', 'xhamster3.com', 'xhamster.desi', 'xhamster19.com'], referer: 'https://xhamster.com/', search: xhamsterSearch, info: xhamsterDownload },
];

export function siteFor(raw) {
  let u; try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  const site = SITES.find((s) => s.hosts.some((x) => h === x || h.endsWith('.' + x)));
  return site ? { site, url: u.href } : null;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms).unref?.())]);
const clean = (s, n = 70) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const fmtMb = (b) => (b / MB).toFixed(1) + ' MB';
const isoDur = (d) => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d || '')); if (!m) return String(d || ''); const h = +m[1] || 0, mi = +m[2] || 0, s = +m[3] || 0; return h ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`; };
export const toSeconds = (d) => { const s = isoDur(d); if (/^\d+min$/.test(s)) return +s.replace('min', '') * 60; const p = s.split(':').map(Number); if (!p.length || p.some(Number.isNaN)) return 0; return p.reduce((a, x) => a * 60 + x, 0); };

// ---------- last search per user (for ".xvideos 3") ----------
const lastSearch = new Map();
const keyOf = (ctx) => String(ctx.sender || ctx.jid || 'owner');
function remember(ctx, items) { lastSearch.set(keyOf(ctx), { items, at: Date.now() }); if (lastSearch.size > 300) lastSearch.delete(lastSearch.keys().next().value); }
function recall(ctx, n) { const e = lastSearch.get(keyOf(ctx)); if (!e || Date.now() - e.at > 6 * 3600_000) return null; return e.items[n - 1] || null; }

// ---------- search ----------
export async function searchAll(query, { perSite = LIMITS.perSite, timeoutMs = LIMITS.searchMs } = {}) {
  const settled = await Promise.allSettled(SITES.map((s) => withTimeout(s.search(query, perSite + 2), timeoutMs)));
  const groups = [];
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) { logger.warn(`xvideos search: ${SITES[i].label} skipped (${r.reason?.message || 'bad result'})`); return; }
    const items = r.value.filter((x) => x && x.title && x.url && siteFor(x.url)).slice(0, perSite).map((x) => ({ site: SITES[i].key, label: SITES[i].label, title: clean(x.title), duration: isoDur(x.duration), url: x.url }));
    if (items.length) groups.push({ site: SITES[i], items });
  });
  return groups;
}

export function formatResults(query, groups, prefix = '.') {
  const flat = []; const lines = [`🔞 Results for "${clean(query, 40)}"`];
  for (const g of groups) {
    lines.push('', `*${g.site.label}*`);
    for (const it of g.items) { flat.push(it); lines.push(`${flat.length}. ${it.title}${it.duration ? ` (${it.duration})` : ''}`, it.url); }
  }
  lines.push('', `Download: ${prefix}xvideos <number> or ${prefix}xvideos <link>`);
  return { text: lines.join('\n'), flat };
}

// ---------- download helpers (all to disk) ----------
async function remoteSize(url, referer) {
  try {
    const r = await axios.head(url, { headers: { 'User-Agent': UA, Referer: referer }, timeout: 10_000, maxRedirects: 5, validateStatus: (s) => s < 400 });
    const n = Number(r.headers['content-length']); return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

export async function streamToFile(url, out, { referer, maxBytes = LIMITS.docBytes, timeoutMs = LIMITS.downloadMs } = {}) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await axios.get(url, { responseType: 'stream', signal: ctrl.signal, headers: { 'User-Agent': UA, Referer: referer }, timeout: 20_000, maxRedirects: 5 });
    let seen = 0;
    const guard = new Transform({ transform(chunk, _e, cb) { seen += chunk.length; if (seen > maxBytes) { cb(new DownloadError('too big', { code: 'TOO_LARGE' })); ctrl.abort(); } else cb(null, chunk); } });
    await pipeline(res.data, guard, fs.createWriteStream(out));
    return seen;
  } finally { clearTimeout(timer); }
}

export function remuxHls(url, out, { referer, maxBytes = LIMITS.docBytes, timeoutMs = LIMITS.downloadMs } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-user_agent', UA, '-headers', `Referer: ${referer}\r\n`, '-i', url, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-fs', String(maxBytes), '-movflags', '+faststart', '-f', 'mp4', out];
    const child = spawn(config.tools.ffmpeg || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; let killed = false;
    const t = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => { clearTimeout(t); if (killed) return reject(new Error('ffmpeg timeout')); if (code !== 0) return reject(new Error('ffmpeg: ' + err.slice(-300))); resolve(); });
  });
}

const kbpsFromUrl = (u) => { const m = /_(\d{3,5})K_/i.exec(u); return m ? +m[1] : null; };

/** Vendored route: returns { path, title } or { link, title } (too big) and throws on failure. */
async function vendoredDownload(site, url, dir, cap = LIMITS.docBytes) {
  const info = await withTimeout(site.info(url), 20_000);
  const title = clean(info.title || 'video', 90);
  const secs = toSeconds(info.duration);
  const out = path.join(dir, 'video.mp4');
  const mp4s = [];
  if (info.download?.high?.url) mp4s.push(info.download.high.url);
  if (info.download?.low?.url) mp4s.push(info.download.low.url);
  if (info.direct) Object.values(info.direct).sort((a, b) => parseInt(b.quality) - parseInt(a.quality)).filter((d) => parseInt(d.quality) <= 480).forEach((d) => mp4s.push(d.url));
  for (const u of mp4s) {
    const size = await remoteSize(u, site.referer);
    if (size && size > cap) continue;
    await streamToFile(u, out, { referer: site.referer, maxBytes: cap });
    return { path: out, title, direct: u };
  }
  // HLS (Pornhub, xHamster): pick the best quality that should fit, skip AV1 (does not play on many phones)
  const hls = Object.values(info.hls || info.download || {}).filter((d) => d && d.url && /m3u8/.test(d.url) && !/\.av1\./.test(d.url) && parseInt(d.quality) <= 720).sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
  if (hls.length) {
    const est = (d) => { const k = kbpsFromUrl(d.url); return k && secs ? (k + 128) * 125 * secs : null; };
    const pick = hls.find((d) => { const e = est(d); return e !== null && e <= cap * 0.9; }) || (est(hls[hls.length - 1]) === null ? hls.find((d) => parseInt(d.quality) <= 480) || hls[hls.length - 1] : null);
    if (!pick) return { link: url, title, reason: 'too big' };
    await remuxHls(pick.url, out, { referer: site.referer, maxBytes: cap });
    const got = (await fsp.stat(out)).size; if (got >= cap * 0.98) throw new Error('stream hit the size cap');
    return { path: out, title };
  }
  if (mp4s.length) return { link: mp4s[mp4s.length - 1], title, reason: 'too big' };
  throw new Error('no playable stream');
}

/** yt-dlp fallback, h264 mp4 up to 480p and under the document limit. */
async function ytdlpDownload(url, dir, cap = LIMITS.docBytes) {
  const fmt = 'b[ext=mp4][vcodec^=avc][height<=480]/bv*[vcodec^=avc][height<=480]+ba[ext=m4a]/b[ext=mp4][height<=480]/b[height<=480]/b';
  const { stdout } = await runYtDlp([url, '-f', fmt, '--max-filesize', String(cap), '--merge-output-format', 'mp4', '-o', path.join(dir, 'yt.%(ext)s'), '--print', 'after_move:%(title)s'], { cwd: dir, useCookies: false, defaultClients: true, timeoutMs: LIMITS.downloadMs });
  const f = (await fsp.readdir(dir)).find((x) => x.startsWith('yt.') && !x.endsWith('.part'));
  if (!f) throw new Error('yt-dlp produced no file (maybe over the size limit)');
  return { path: path.join(dir, f), title: clean(stdout.trim().split('\n').pop() || 'video', 90) };
}

export async function downloadVideo(site, url, dir, cap = LIMITS.docBytes) {
  let firstErr = null; let link = null;
  if (site.ytdlpFirst) {
    try { return { ...(await ytdlpDownload(url, dir, cap)), via: 'yt-dlp' }; }
    catch (e) { firstErr = e; logger.warn(`xvideos: yt-dlp failed for ${site.label} (${e.message}), trying the scraper`); }
    for (const f of await fsp.readdir(dir).catch(() => [])) await fsp.rm(path.join(dir, f), { force: true });
    const r = await vendoredDownload(site, url, dir, cap);
    return r.path ? { ...r, via: 'vendored' } : r;
  }
  try { const r = await vendoredDownload(site, url, dir, cap); if (r.path) return { ...r, via: 'vendored' }; link = r; }
  catch (e) { firstErr = e; logger.warn(`xvideos: ${site.label} scraper failed (${e.message}), trying yt-dlp`); }
  for (const f of await fsp.readdir(dir).catch(() => [])) await fsp.rm(path.join(dir, f), { force: true });
  if (link) return link;
  try { return { ...(await ytdlpDownload(url, dir, cap)), via: 'yt-dlp' }; }
  catch (e) { logger.warn(`xvideos: yt-dlp failed for ${site.label} (${e.message})`); throw firstErr || e; }
}

/** <=16 MB as a playable video, <=100 MB as a document, else the link. */
export async function sendVideo(ctx, file, title, pageUrl) {
  const size = (await fsp.stat(file)).size;
  if (!size) throw new Error('empty file');
  const caption = `🔞 ${title}\n${fmtMb(size)}`;
  if (size <= LIMITS.videoBytes) return { kind: 'video', size, res: await ctx.sock.sendMessage(ctx.jid, { video: { url: file }, mimetype: 'video/mp4', caption }, { quoted: ctx.msg }) };
  if (size <= LIMITS.docBytes) return { kind: 'document', size, res: await ctx.sock.sendMessage(ctx.jid, { document: { url: file }, mimetype: 'video/mp4', fileName: safeFileName(title, 'video').slice(0, 80) + '.mp4', caption: caption + ' (sent as a file: over WhatsApp\'s 16 MB video limit)' }, { quoted: ctx.msg }) };
  await ctx.reply(`📦 ${title} is ${fmtMb(size)}, too big for WhatsApp (100 MB). Watch it here:\n${pageUrl}`);
  return { kind: 'link', size };
}

async function runDownload(ctx, site, url) {
  // Free hosting has a small disk: never let one video take more than the free space minus a safety margin.
  const free = await freeDiskBytes().catch(() => Infinity);
  const cap = Math.min(LIMITS.docBytes, free - 50 * MB);
  if (!(cap >= 15 * MB)) return ctx.reply('💾 Not enough free disk on the server for a video right now.');
  try { return await downloadQueue.add(ctx.sender, async () => {
    let dir = null;
    try {
      dir = await createJobDir();
      await ctx.reply(`⏳ Downloading from ${site.label}...`);
      const r = await downloadVideo(site, url, dir, cap);
      if (r.link) return ctx.reply(`📦 ${r.title}: too big to send on WhatsApp from this server. Direct link:\n${r.link}`);
      const sent = await sendVideo(ctx, r.path, r.title, url);
      logger.info(`xvideos: sent ${site.label} via ${r.via} as ${sent.kind}`);
      return sent;
    } catch (e) {
      logger.warn(`xvideos download failed: ${e.message}`);
      return ctx.reply(`❌ Could not download that ${site.label} video right now. Try another one, or open it here:\n${url}`);
    } finally { await removeJobDir(dir); }
  }, (pos) => ctx.reply(`🕒 In queue (#${pos})`).catch(() => {})); }
  catch (e) { return ctx.reply(e?.userMessage || e?.message || 'Download queue error.'); }
}

export const groupEnabled = (gid) => groupSettings(gid).xvideos === true;

async function toggle(ctx, on, p) {
  if (!ctx.isGroup) return ctx.reply(`🔞 ${p}xvideos on/off is for groups. In a private chat it already works: ${p}xvideos <words>`);
  if (!await permitted(ctx, { requiredLevel: 'admin' })) return ctx.reply(`Only a group admin can turn ${p}xvideos ${on ? 'on' : 'off'} here.`);
  const st = groupStore();
  if (!st) return ctx.reply('Group storage is not ready yet. Try again in a moment.');
  st.setSetting(ctx.jid, 'xvideos', on);
  return ctx.reply(on
    ? `🔞 ${p}xvideos is now ON in this group. Any member can use it. An admin can turn it off with ${p}xvideos off.`
    : `${p}xvideos is now OFF in this group.`);
}

export default {
  name: 'xvideos',
  aliases: ['xv'],
  category: 'Downloaders',
  description: '18+: search XVideos, XNXX, Pornhub and xHamster at once, or download a video. Anyone in private chat; in groups only after an admin sends .xvideos on',
  usage: 'xvideos <words | number | link> | xvideos on|off (group admins)',
  platform: 'xvideos',
  async run(ctx) {
    const p = config.prefix || '.';
    const arg = (ctx.args || []).join(' ').trim();
    const sw = arg.toLowerCase();
    if (sw === 'on' || sw === 'off') return toggle(ctx, sw === 'on', p);
    if (isDisabled('xvideos')) return ctx.reply(`🔞 ${p}xvideos is switched off by the bot owner.${ctx.isOwner ? ` Use ${p}platformenable xvideos to turn it back on.` : ''}`);
    if (ctx.isGroup && !groupEnabled(ctx.jid)) return ctx.reply(`🔞 ${p}xvideos is off in this group. A group admin can enable it with ${p}xvideos on`);
    if (!arg) return ctx.reply(`🔞 Usage:\n${p}xvideos <words> - search XVideos, XNXX, Pornhub, xHamster\n${p}xvideos <number> - download from your last search\n${p}xvideos <link> - download a video${ctx.isGroup ? `\n${p}xvideos off - admins: turn it off in this group` : ''}`);
    if (/^\d{1,2}$/.test(arg)) {
      const it = recall(ctx, Number(arg));
      if (!it) return ctx.reply(`No result #${arg}. Search first: ${p}xvideos <words>`);
      return runDownload(ctx, SITES.find((s) => s.key === it.site), it.url);
    }
    if (/^https?:\/\//i.test(arg)) {
      const hit = siteFor(arg.split(/\s+/)[0]);
      if (!hit) return ctx.reply('That link is not from XVideos, XNXX, Pornhub or xHamster.');
      return runDownload(ctx, hit.site, hit.url);
    }
    if (arg.length > 100) return ctx.reply('Search words are too long (100 characters max).');
    await ctx.reply(`🔎 Searching 4 sites for "${clean(arg, 40)}"...`);
    const groups = await searchAll(arg);
    if (!groups.length) return ctx.reply(`No results for "${clean(arg, 40)}" (or the sites did not answer). Try other words.`);
    const { text, flat } = formatResults(arg, groups, p);
    remember(ctx, flat);
    return ctx.reply(text);
  },
};
