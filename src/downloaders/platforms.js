// Table-driven public-media downloaders for many social platforms. Public content only: no cookies, logins, DRM or paywall bypass.
// Each platform is isolated: a failure in one never affects another. Chain per request:
//   1) yt-dlp (if the platform has an extractor)  2) retry once  3) page metadata (og:video / og:audio / og:image, oEmbed)  4) clear failure message.
import { requestPublic, fetchPublic } from '../utilities/validation.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileTypeFromFile } from 'file-type';
import config from '../config/config.js';
import { DownloadError, runYtDlp, friendlyYtDlpError } from '../utils/downloader.js';
import { safeFileName } from '../utils/fileManager.js';

// name = command name. hosts = accepted hostnames (and subdomains). yt = has a yt-dlp extractor. og = page metadata fallback allowed. oembed = oEmbed endpoint.
export const PLATFORMS = [
  { name: 'xvideos', label: 'XVideos', hosts: ['xvideos.com', 'xvideos2.com', 'xvideos.es'], yt: true, og: true },
  { name: 'moj', label: 'Moj', hosts: ['mojapp.in'], yt: false, og: true },
  { name: 'minds', label: 'Minds', hosts: ['minds.com'], yt: true, og: true },
  { name: 'gab', label: 'Gab', hosts: ['gab.com'], yt: true, og: true },
  { name: 'bluesky', label: 'Bluesky', hosts: ['bsky.app'], yt: true, og: true },
  { name: 'mixcloud', label: 'Mixcloud', hosts: ['mixcloud.com'], yt: true, og: false, audio: true },
  { name: 'audiomack', label: 'Audiomack', hosts: ['audiomack.com'], yt: true, og: false, audio: true },
  { name: 'soundcloud', label: 'SoundCloud', hosts: ['soundcloud.com', 'on.soundcloud.com'], yt: true, og: false, audio: true }, // Tab
  { name: 'bandlab', label: 'BandLab', hosts: ['bandlab.com'], yt: true, og: true, audio: true },
  { name: 'weibo', label: 'Weibo', hosts: ['weibo.com', 'weibo.cn'], yt: true, og: true },
  { name: 'douyin', label: 'Douyin', hosts: ['douyin.com', 'iesdouyin.com'], yt: true, og: true },
  { name: 'xiaohongshu', label: 'Xiaohongshu', hosts: ['xiaohongshu.com', 'xhslink.com'], yt: true, og: true },
  { name: 'bilibili', label: 'Bilibili', hosts: ['bilibili.com', 'b23.tv'], yt: true, og: true },
  { name: 'zhihu', label: 'Zhihu', hosts: ['zhihu.com'], yt: true, og: true },
  { name: 'niconico', label: 'Niconico', hosts: ['nicovideo.jp', 'nico.ms'], yt: true, og: true },
  { name: 'flickr', label: 'Flickr', hosts: ['flickr.com', 'flic.kr'], yt: true, og: true },
  { name: 'steam', label: 'Steam', hosts: ['steamcommunity.com', 'store.steampowered.com'], yt: true, og: true },
  { name: 'xbox', label: 'Xbox', hosts: ['xboxclips.com', 'gamerdvr.com', 'xbox.com'], yt: true, og: true },
  { name: 'kickcom', label: 'Kick', hosts: ['kick.com'], yt: true, og: false },
  { name: 'gamejolt', label: 'GameJolt', hosts: ['gamejolt.com'], yt: true, og: true },
  { name: 'lemon8', label: 'Lemon8', hosts: ['lemon8-app.com'], yt: false, og: true },
  { name: 'plurk', label: 'Plurk', hosts: ['plurk.com'], yt: false, og: true },
  { name: 'ello', label: 'Ello', hosts: ['ello.co'], yt: false, og: true },
  { name: 'behance', label: 'Behance', hosts: ['behance.net'], yt: false, og: true },
  { name: 'dribbble', label: 'Dribbble', hosts: ['dribbble.com'], yt: false, og: true },
  { name: 'deviantart', label: 'DeviantArt', hosts: ['deviantart.com', 'fav.me'], yt: false, og: true, oembed: 'https://backend.deviantart.com/oembed?url=' },
  { name: 'artstation', label: 'ArtStation', hosts: ['artstation.com'], yt: false, og: true },
  { name: 'vsco', label: 'VSCO', hosts: ['vsco.co'], yt: false, og: true },
  { name: 'five00px', label: '500px', hosts: ['500px.com'], yt: false, og: true },
  { name: 'sharechat', label: 'ShareChat', hosts: ['sharechat.com'], yt: false, og: true },
  { name: 'smule', label: 'Smule', hosts: ['smule.com'], yt: false, og: true, audio: true },
  { name: 'boomplay', label: 'Boomplay', hosts: ['boomplay.com'], yt: false, og: true, audio: true },
  { name: 'podbean', label: 'Podbean', hosts: ['podbean.com'], yt: false, og: true, audio: true },
  { name: 'starmaker', label: 'StarMaker', hosts: ['starmakerstudios.com', 'starmaker.co'], yt: false, og: true, audio: true },
  { name: 'kuaishou', label: 'Kuaishou', hosts: ['kuaishou.com', 'kwai.com'], yt: false, og: true },
  { name: 'douban', label: 'Douban', hosts: ['douban.com'], yt: false, og: true },
  { name: 'clapper', label: 'Clapper', hosts: ['clapperapp.com'], yt: false, og: true },
  { name: 'spoutible', label: 'Spoutible', hosts: ['spoutible.com'], yt: false, og: true },
  { name: 'mewe', label: 'MeWe', hosts: ['mewe.com'], yt: false, og: true },
  { name: 'guilded', label: 'Guilded', hosts: ['guilded.gg'], yt: false, og: true },
  { name: 'itchio', label: 'ItchIO', hosts: ['itch.io'], yt: false, og: true },
  { name: 'wtsocial', label: 'WTSocial', hosts: ['wt.social'], yt: false, og: true },
  { name: 'public', label: 'Public', hosts: ['public.app'], yt: false, og: true },
  { name: 'cara', label: 'Cara', hosts: ['cara.app'], yt: false, og: true },
];

const UAS = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'facebookexternalhit/1.1', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'];
const DIR = path.resolve('data');
const DISABLED_FILE = path.join(DIR, 'platform-disabled.json');
const HEALTH_FILE = path.join(DIR, 'platform-health.json');
export const health = new Map(); // name -> { ytOk, ytFail, ogOk, ogFail, lastOk, lastFail, lastError, failures, ytLast, ogLast }
const cache = new Map();
const CACHE_MS = 300_000;

const rec = (n) => { if (!health.has(n)) health.set(n, { ytOk: 0, ytFail: 0, ogOk: 0, ogFail: 0, lastOk: null, lastFail: null, lastError: null, failures: 0, ytLast: null, ogLast: null }); return health.get(n); };
function loadHealth() { try { const j = JSON.parse(fsSync.readFileSync(HEALTH_FILE, 'utf8')); for (const [k, v] of Object.entries(j)) health.set(k, v); } catch { /* none yet */ } }
let saveTimer = null;
function saveHealth() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { fsSync.mkdirSync(DIR, { recursive: true }); fsSync.writeFileSync(HEALTH_FILE, JSON.stringify(Object.fromEntries(health))); } catch { /* best effort */ } }, 2000); saveTimer.unref?.(); }
loadHealth();
export function noteResult(name, provider, ok, err) {
  const h = rec(name); const k = provider === 'yt' ? 'yt' : 'og';
  if (ok) { h[k + 'Ok']++; h[k + 'Last'] = 'ok'; h.lastOk = Date.now(); }
  else { h[k + 'Fail']++; h[k + 'Last'] = 'fail'; h.lastError = String(err?.message || err).slice(0, 120); }
  saveHealth();
}
export function noteFinal(name, ok, err) { const h = rec(name); if (ok) { h.lastOk = Date.now(); h.failures = 0; } else { h.failures++; h.lastFail = Date.now(); h.lastError = String(err?.message || err).slice(0, 120); } saveHealth(); }

// ---- disable switch (rollback step 1) ----
let disabled = new Set(); try { disabled = new Set(JSON.parse(fsSync.readFileSync(DISABLED_FILE, 'utf8'))); } catch { /* none */ }
export const isDisabled = (n) => disabled.has(n);
export function setDisabled(n, on) { on ? disabled.add(n) : disabled.delete(n); try { fsSync.mkdirSync(DIR, { recursive: true }); fsSync.writeFileSync(DISABLED_FILE, JSON.stringify([...disabled])); } catch { /* best effort */ } return [...disabled]; }

export const hostMatch = (url, p) => url.protocol === 'https:' && !url.username && !url.password && !url.port && p.hosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// SSRF guard: media/page hosts must be public https hosts.
export async function assertPublicHost(u) {
  if (u.protocol !== 'https:') throw new DownloadError('Only https links are supported.', { code: 'INVALID' });
  const h = u.hostname;
  if (net.isIP(h) || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) throw new DownloadError('That address is not allowed.', { code: 'BLOCKED_HOST' });
  let addrs; try { addrs = await dns.lookup(h, { all: true }); } catch { throw new DownloadError('That host could not be found.', { code: 'NETWORK' }); }
  for (const a of addrs) if (isPrivateIp(a.address)) throw new DownloadError('That address is not allowed.', { code: 'BLOCKED_HOST' });
}
export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || (l.startsWith('::ffff:') && isPrivateIp(l.slice(7))); }
  const p = ip.split('.').map(Number); if (p.length !== 4) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}

// oEmbed helper fetches now go through the shared guard: DNS validated + pinned, redirect hops
// revalidated, body capped. The base hosts are code constants, but a constant host alone is not
// destination validation - a raw fetch follows redirects and trusts DNS without pinning.
async function timedFetch(u, init = {}, ms = 15000) {
  try {
    const r = await fetchPublic(u, { maxBytes: 256 * 1024, timeoutMs: ms, headers: init.headers || {} });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(r.body.toString('utf8')) };
  } catch (e) { throw new Error(/timed out/i.test(e.message) ? 'timeout' : e.message); }
}

export function parseMeta(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0]; const k = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase(); const v = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (k && v != null && !(k in out)) out[k] = decode(v);
  }
  return out;
}

// Fetch the public page and return {title, desc, video, audio, image}. Redirects are followed manually and each hop is checked.
async function readCapped(stream, max) {
  const chunks = []; let n = 0;
  for await (const c of stream) { chunks.push(c); n += c.length; if (n >= max) { stream.destroy(); break; } }
  return Buffer.concat(chunks).subarray(0, max).toString('utf8');
}
export async function pageMeta(url, { fetchImpl, requestImpl = requestPublic } = {}) {
  const hit = cache.get(url); if (hit && Date.now() - hit.at < CACHE_MS) return hit.meta;
  let last = 'no data';
  for (const ua of UAS) {
    try {
      let cur = new URL(url);
      for (let hop = 0; hop < 4; hop++) {
        const r0 = fetchImpl ? null : await requestImpl(cur.href ?? cur, { follow: false, headers: { 'user-agent': ua, accept: 'text/html,*/*' } }).catch((e) => { throw Object.assign(new Error(e.message), { code: e.code || 'NETWORK' }); });
        const r = fetchImpl ? await fetchImpl(cur, { redirect: 'manual', headers: { 'user-agent': ua, accept: 'text/html,*/*' } }) : { ok: r0.status >= 200 && r0.status < 300, status: r0.status, headers: { get: (k) => r0.headers[k.toLowerCase()] ?? null }, text: async () => (r0.stream ? readCapped(r0.stream, 1_500_000) : '') };
        if (r0 && r0.stream && !r.ok) r0.stream.resume();
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = new URL(r.headers.get('location'), cur); continue; }
        if (r.status === 404 || r.status === 410) throw Object.assign(new Error('content not found or deleted'), { final: true });
        if (r.status === 401 || r.status === 403) { last = 'login or access required'; break; }
        if (r.status === 429) throw Object.assign(new Error('rate limited'), { final: true });
        if (!r.ok) { last = 'HTTP ' + r.status; break; }
        const html = (await r.text()).slice(0, 1_500_000); const m = parseMeta(html);
        const meta = { title: m['og:title'] || m['twitter:title'] || /<title[^>]*>([^<]{1,200})/i.exec(html)?.[1] || '', desc: m['og:description'] || m.description || '', video: m['og:video:secure_url'] || m['og:video'] || m['og:video:url'] || m['twitter:player:stream'] || '', audio: m['og:audio:secure_url'] || m['og:audio'] || '', image: m['og:image:secure_url'] || m['og:image'] || m['twitter:image'] || m['twitter:image:src'] || '' };
        meta.title = decode(meta.title).trim();
        if (meta.video || meta.audio || meta.image) { cache.set(url, { at: Date.now(), meta }); if (cache.size > 200) cache.clear(); return meta; }
        last = 'page has no public media'; break;
      }
    } catch (e) { if (e.final) throw e; if (e instanceof DownloadError) throw e; last = e.message; }
  }
  throw new Error(last);
}

export async function oembedMeta(base, url) {
  const r = await timedFetch(base + encodeURIComponent(url), { headers: { 'user-agent': UAS[0], accept: 'application/json' } }, 12000);
  if (!r.ok) throw new Error('oembed HTTP ' + r.status);
  const j = await r.json(); const img = j.url && /^image|photo/.test(j.type || 'photo') ? j.url : j.thumbnail_url;
  if (!img) throw new Error('oembed had no media');
  return { title: j.title || '', image: img, video: '', audio: '' };
}

async function fetchToFile(mediaUrl, dir, base, maxBytes) {
  let cur = new URL(mediaUrl);
  for (let hop = 0; hop < 4; hop++) {
    let r0;
    try {
      r0 = await requestPublic(cur.href, { follow: false, timeoutMs: 60000, headers: { 'user-agent': UAS[0] } });
    } catch (e) { throw new DownloadError('The media could not be fetched. ' + (e.message || ''), { code: 'NETWORK' }); }
    {
      const r = { status: r0.status, headers: { get: (k) => r0.headers[k.toLowerCase()] ?? null } };
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { r0.stream?.resume?.(); cur = new URL(r.headers.get('location'), cur); continue; }
      if (!(r.status >= 200 && r.status < 300) || !r0.stream) throw new DownloadError('The media could not be fetched.', { code: 'NETWORK' });
      const declared = Number(r.headers.get('content-length')); if (declared && declared > maxBytes) { r0.stream.resume(); throw new DownloadError('TOO_LARGE', { code: 'TOO_LARGE' }); }
      const dest = path.join(dir, base + '.bin'); let got = 0;
      const { Transform } = await import('node:stream');
      await pipeline(r0.stream, new Transform({ transform(c, _e, cb) { got += c.length; got > maxBytes ? cb(new DownloadError('TOO_LARGE', { code: 'TOO_LARGE' })) : cb(null, c); } }), fsSync.createWriteStream(dest));
      if (declared && got < declared) throw new DownloadError('The download was incomplete.', { code: 'FAILED' });
      return { dest, size: got };
    }
  }
  throw new DownloadError('Too many redirects.', { code: 'FAILED' });
}

async function finishFile(dest, dir, base, wantAudio = false) {
  const type = await fileTypeFromFile(dest); const st = await fs.stat(dest);
  if (!st.size || !type || !['image/', 'video/', 'audio/'].some((p) => type.mime.startsWith(p))) throw new DownloadError('Returned file is empty or not supported media.', { code: 'FAILED' });
  const final = path.join(dir, `${base}.${type.ext}`); await fs.rename(dest, final);
  // Tab: an audio-only download in an mp4/webm container is detected as video/*; send it as audio.
  if (wantAudio && type.mime.startsWith('video/')) return { path: final, type: 'audio', mimetype: type.mime === 'video/mp4' ? 'audio/mp4' : type.mime.replace('video/', 'audio/'), size: st.size, ext: type.ext === 'mp4' ? 'm4a' : type.ext };
  return { path: final, type: type.mime.split('/')[0], mimetype: type.mime, size: st.size, ext: type.ext };
}

async function ytChain(p, clean, dir, kind) {
  const opts = { timeoutMs: 90000, useCookies: false };
  const { stdout } = await runYtDlp(['--skip-download', '--dump-single-json', '--no-playlist', '--socket-timeout', '15', clean], opts);
  const meta = JSON.parse(stdout);
  if (meta._type === 'playlist' || meta.entries) throw new DownloadError('Playlists and collections are not supported. Send one item link.', { code: 'UNSUPPORTED' });
  if (meta.is_live || meta.live_status === 'is_live') throw new DownloadError('Live streams are not supported.', { code: 'UNSUPPORTED' });
  if (meta.availability && meta.availability !== 'public') throw new DownloadError('Only public content is supported. No login or private access.', { code: 'PRIVATE' });
  if (meta.duration > 1800) throw new DownloadError('This item exceeds the 30-minute limit.', { code: 'TOO_LARGE' });
  // Tab: yt-dlp reports audio-only items with vcodec "none" (a truthy string), which sent SoundCloud/Mixcloud down the video path.
  const wantAudio = kind === 'audio' || (p.audio && !meta.height && (!meta.vcodec || meta.vcodec === 'none'));
  const fmt = wantAudio ? 'bestaudio/best' : `bv*[height<=?${config.limits.maxVideoHeight}][ext=mp4]+ba[ext=m4a]/b[height<=?${config.limits.maxVideoHeight}][ext=mp4]/b[height<=?${config.limits.maxVideoHeight}]/b`;
  await runYtDlp(['-f', fmt, ...(wantAudio ? [] : ['--merge-output-format', 'mp4']), '--max-filesize', String(config.limits.maxFileBytes), '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1', '--no-playlist', '-o', path.join(dir, 'media.%(ext)s'), clean], { cwd: dir, useCookies: false });
  const names = (await fs.readdir(dir)).filter((n) => /^media\.\w+$/.test(n));
  if (names.length !== 1) throw new DownloadError('The site did not return a supported file.', { code: 'FAILED' });
  const f = await finishFile(path.join(dir, names[0]), dir, 'out', wantAudio);
  if (f.size > config.limits.maxFileBytes) throw new DownloadError('TOO_LARGE', { code: 'TOO_LARGE' });
  return { title: safeFileName(meta.title, p.name), files: [{ path: f.path, type: f.type, mimetype: f.mimetype, fileName: safeFileName(meta.title, p.name) + '.' + f.ext, size: f.size }] };
}

async function ogChain(p, clean, dir, kind, deps = {}) {
  let meta; const errs = [];
  try { meta = await pageMeta(clean, deps); } catch (e) { errs.push(e); if (e.final) throw e; }
  if (!meta && p.oembed) { try { meta = await oembedMeta(p.oembed, clean); } catch (e) { errs.push(e); } }
  if (!meta) throw errs.at(-1) || new Error('no data');
  const order = kind === 'audio' ? [['audio', meta.audio]] : [['video', meta.video], ['audio', meta.audio], ['image', meta.image]];
  let lastErr;
  for (const [t, u] of order) {
    if (!u) continue;
    try {
      const g = await fetchToFile(new URL(u, clean).href, dir, 'og', config.limits.maxFileBytes); const f = await finishFile(g.dest, dir, 'og');
      if (t === 'image' && f.size < 10000) throw new DownloadError('Only a tiny placeholder image was available.', { code: 'FAILED' });
      const title = safeFileName(meta.title, p.name) + (t === 'image' ? ' (preview image only)' : '');
      return { title, files: [{ path: f.path, type: f.type, mimetype: f.mimetype, fileName: safeFileName(meta.title, p.name) + '.' + f.ext, size: f.size }] };
    } catch (e) { lastErr = e; if (e.code === 'TOO_LARGE') throw e; }
  }
  throw lastErr || new Error('page has no public media');
}

export function makePlatform(p, deps = {}) {
  return {
    name: p.name, label: p.label,
    matches: (url) => hostMatch(url, p) && !isDisabled(p.name),
    async download(url, { dir, kind }) {
      if (isDisabled(p.name)) throw new DownloadError(`${p.label} downloads are switched off right now.`, { code: 'DISABLED' });
      if (url.pathname.replace(/\/+$/, '').length < 2) throw new DownloadError(`Send a link to one ${p.label} post, not the home page.`, { code: 'INVALID' });
      const clean = new URL(url); clean.hash = ''; const href = clean.href; const maxMb = Math.round(config.limits.maxFileBytes / 1048576);
      const final = [];
      try {
        if (p.yt) {
          for (let i = 0; i < 2; i++) {
            try { const r = await (deps.yt || ytChain)(p, href, dir, kind); noteResult(p.name, 'yt', true); noteFinal(p.name, true); return r; }
            catch (e) { noteResult(p.name, 'yt', false, e); final.push(e); if (e instanceof DownloadError && ['PRIVATE', 'UNSUPPORTED', 'TOO_LARGE', 'DISABLED'].includes(e.code)) throw e; if (['PRIVATE', 'UNAVAILABLE', 'REGION', 'TOO_LARGE'].includes(e.code)) break; await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); await fs.mkdir(dir, { recursive: true }); }
          }
        }
        if (p.og || p.oembed) {
          try { const r = await (deps.og || ogChain)(p, href, dir, kind, deps); noteResult(p.name, 'og', true); noteFinal(p.name, true); return r; }
          catch (e) { noteResult(p.name, 'og', false, e); final.push(e); if (e instanceof DownloadError && e.code === 'TOO_LARGE') throw e; }
        }
        const last = final.at(-1); const cause = final.find((e) => e.code && e.code !== 'FAILED') || last;
        const msg = cause && cause.final ? `${p.label}: ${cause.message}.` : cause instanceof DownloadError && cause.userMessage && cause.code !== 'FAILED' ? cause.userMessage : `Could not download that ${p.label} link. It may be private, deleted, not a video/photo/audio post, or ${p.label} is blocking the server. Try again later.`;
        throw new DownloadError(msg, { code: cause?.code || 'FAILED', cause: last });
      } catch (e) { noteFinal(p.name, false, e); if (e instanceof DownloadError) throw e; throw new DownloadError(friendlyYtDlpError(e, maxMb).replace('YouTube', p.label), { code: e.code, cause: e }); }
    },
  };
}
export const platformDownloaders = PLATFORMS.map((p) => makePlatform(p));

// Second method for Instagram / Facebook posts when yt-dlp fails: public page metadata, then public oEmbed (thumbnail). Public content only.
export async function socialFallback(platform, clean, dir, kind = 'video', deps = {}) {
  const p = { name: platform, label: platform === 'instagram' ? 'Instagram' : 'Facebook', oembed: platform === 'instagram' ? 'https://www.instagram.com/api/v1/oembed/?url=' : null };
  const errs = [];
  try { const r = await ogChain({ ...p, oembed: null }, clean, dir, kind, deps); noteResult(platform, 'og', true); return r; } catch (e) { errs.push(e); if (e.code === 'TOO_LARGE') throw e; }
  if (p.oembed) {
    try {
      const meta = await (deps.oembed || oembedMeta)(p.oembed, clean);
      const g = await fetchToFile(new URL(meta.image).href, dir, 'oe', config.limits.maxFileBytes); const f = await finishFile(g.dest, dir, 'oe');
      noteResult(platform, 'og', true); return { title: safeFileName(meta.title || 'post', platform) + ' (preview image only)', files: [{ path: f.path, type: f.type, mimetype: f.mimetype, fileName: safeFileName(meta.title || 'post', platform) + '.' + f.ext, size: f.size }], preview: true };
    } catch (e) { errs.push(e); }
  }
  noteResult(platform, 'og', false, errs.at(-1));
  throw errs.at(-1);
}
