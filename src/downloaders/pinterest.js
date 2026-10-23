import { fetchPublic, requestPublic } from '../utilities/validation.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import { DownloadError, httpDownload } from '../utils/downloader.js';
import logger from '../utils/logger.js';
import { safeFileName } from '../utils/fileManager.js';

export const name = 'pinterest';

const PIN_HOST = /(^|\.)pinterest\.[a-z.]+$/i;
const MEDIA_HOSTS = ['pinimg.com', 'pinterest.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function matches(url) {
  return PIN_HOST.test(url.hostname) || url.hostname === 'pin.it';
}

/** Follows short-link redirects manually, staying on Pinterest hosts only. pin.it first hops to api.pinterest.com, then to the pin page. */
async function resolveShort(url) {
  let current = url;
  for (let i = 0; i < 5 && !pinId(current); i++) {
    const res = await requestPublic(current, { follow: false, headers: { 'user-agent': UA } });
    if (res.status < 300 || res.status >= 400) break;
    const loc = res.headers.location;
    if (!loc) break;
    const next = new URL(loc, current);
    if (next.protocol !== 'https:' || !(PIN_HOST.test(next.hostname) || next.hostname === 'pin.it')) {
      throw new DownloadError('❌ That link does not point to a Pinterest pin.', { code: 'INVALID' });
    }
    current = next;
  }
  return current;
}

function pinId(url) {
  const m = url.pathname.match(/\/pin\/(?:[^/]*--)?(\d{5,25})/);
  return m ? m[1] : null;
}

async function fetchPin(id) {
  const data = JSON.stringify({ options: { id, field_set_key: 'detailed' }, context: {} });
  const api = new URL('https://www.pinterest.com/resource/PinResource/get/');
  api.searchParams.set('data', data);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetchPublic(api, { headers: { 'user-agent': UA, accept: 'application/json', 'x-pinterest-pws-handler': 'www/pin/[id].js' } });
    if (res.status === 404) throw new DownloadError('❌ This pin was not found. It may have been deleted.', { code: 'UNAVAILABLE' });
    if (!(res.status >= 200 && res.status < 300)) throw new DownloadError('❌ Pinterest did not return this pin.\n\nIt may be private or unavailable.', { code: 'FAILED' });
    const json = JSON.parse(res.body.toString('utf8'));
    const pin = json?.resource_response?.data;
    if (!pin || json.resource_response.status !== 'success') throw new DownloadError('❌ This pin was not found or is private.', { code: 'UNAVAILABLE' });
    return pin;
  } catch (err) {
    if (err instanceof DownloadError) throw err;
    throw new DownloadError('📡 Network problem while contacting Pinterest. Please try again.', { code: 'NETWORK', cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/** Collects every video_list the pin payload carries (standard pins and story-pin pages/blocks). */
function videoLists(pin) {
  const lists = [];
  if (pin?.videos?.video_list) lists.push(pin.videos.video_list);
  for (const page of pin?.story_pin_data?.pages || []) {
    if (page?.video?.video_list) lists.push(page.video.video_list);
    for (const b of page?.blocks || []) if (b?.video?.video_list) lists.push(b.video.video_list);
  }
  return lists;
}

/** Picks the best media URL from the pin payload. Many pins only offer HLS (.m3u8); those come back flagged so the downloader can convert them. */
export function pickMedia(pin) {
  for (const list of videoLists(pin)) {
    const mp4 = Object.values(list)
      .filter((v) => v?.url && /\.mp4(\?|$)/i.test(v.url))
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    const fit = mp4[0];
    if (fit) return { kind: 'video', url: fit.url };
  }
  for (const list of videoLists(pin)) {
    const hls = Object.values(list)
      .filter((v) => v?.url && /\.m3u8(\?|$)/i.test(v.url))
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    const fit = hls[0];
    if (fit) return { kind: 'video', url: fit.url, hls: true, hlsVariants: hls.map((v) => v.url) };
  }
  const img = pin?.images?.orig?.url || pin?.images?.['736x']?.url || pin?.images?.['564x']?.url;
  if (img) return { kind: 'image', url: img };
  return null;
}

export async function download(url, { dir }) {
  const isShort = url.hostname === 'pin.it';
  const full = await resolveShort(url).catch((e) => {
    if (e instanceof DownloadError) throw e;
    throw new DownloadError('📡 Network problem while opening the link.', { code: 'NETWORK', cause: e });
  });
  const id = pinId(full);
  if (!id && isShort) throw new DownloadError('❌ This pin was not found. It may have been deleted or shared from a private board.', { code: 'UNAVAILABLE' });
  if (!id) throw new DownloadError('❌ That does not look like a Pinterest pin link.\n\nExample: https://www.pinterest.com/pin/123456789/', { code: 'INVALID' });

  const pin = await fetchPin(id);
  return downloadPinMedia(pickMedia(pin), pin, id, { dir });
}

/** Downloads one HLS (variant) playlist's init + media segments over https with fetch() and concatenates them
 * into a single file (fMP4 or MPEG-TS). ffmpeg's own network HLS path is avoided on purpose: the panel's
 * ffmpeg 7.0.2-static build segfaults fetching Pinterest's fMP4 HLS playlists over https. */
async function fetchHlsToFile(playlistUrl, out, { maxBytes, deadline }) {
  const res = await fetchPublic(playlistUrl, { headers: { 'user-agent': UA, referer: 'https://www.pinterest.com/' }, timeoutMs: 30_000 });
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`playlist HTTP ${res.status}`);
  const text = res.body.toString('utf8');
  if (/#EXT-X-STREAM-INF/.test(text)) throw new Error('master playlist passed where a variant was expected');
  let map = null; let nextRange = null; const parts = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^#EXT-X-MAP:URI="([^"]+)"(?:,BYTERANGE="(\d+)@(\d+)")?/))) map = { url: new URL(m[1], playlistUrl).href, range: m[2] ? [Number(m[2]), Number(m[3])] : null };
    else if ((m = line.match(/^#EXT-X-BYTERANGE:(\d+)@(\d+)/))) nextRange = [Number(m[1]), Number(m[2])];
    else if (line && !line.startsWith('#')) { parts.push({ url: new URL(line, playlistUrl).href, range: nextRange }); nextRange = null; }
  }
  if (map) parts.unshift(map);
  if (!parts.length) throw new Error('playlist has no segments');
  const fh = await fs.open(out, 'w');
  let total = 0;
  try {
    for (const part of parts) {
      if (Date.now() > deadline) throw new Error('HLS download timed out');
      const headers = { 'user-agent': UA, referer: 'https://www.pinterest.com/' };
      if (part.range) headers.range = `bytes=${part.range[1]}-${part.range[1] + part.range[0] - 1}`;
      const r = await fetchPublic(part.url, { headers, timeoutMs: 60_000, maxBytes });
      if (!(r.status >= 200 && r.status < 300)) throw new Error(`segment HTTP ${r.status}`);
      const buf = r.body;
      total += buf.length;
      if (total > maxBytes) { const e = new Error('HLS stream exceeds the size limit'); e.code = 'TOO_LARGE'; throw e; }
      await fh.write(buf);
    }
  } finally { await fh.close(); }
  return total;
}

/** Resolves a (master or variant) HLS playlist to { video, audio } variant playlist URLs, picking the highest-bandwidth rendition. */
async function resolveHls(masterUrl) {
  const res = await fetchPublic(masterUrl, { headers: { 'user-agent': UA, referer: 'https://www.pinterest.com/' }, timeoutMs: 30_000 });
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`playlist HTTP ${res.status}`);
  const text = res.body.toString('utf8');
  if (!/#EXT-X-STREAM-INF/.test(text)) return { video: masterUrl, audio: null };
  let best = null;
  for (const m of text.matchAll(/#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(\d+)[^\n]*\n([^\n]+)/g)) {
    const bw = Number(m[1]); const uri = (m[2] || '').trim();
    if (uri && !uri.startsWith('#') && (!best || bw > best.bw)) best = { bw, uri };
  }
  if (!best) throw new Error('no playable variant in master playlist');
  const am = text.match(/#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*URI="([^"]+)"/);
  return { video: new URL(best.uri, masterUrl).href, audio: am ? new URL(am[1], masterUrl).href : null };
}

function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.tools.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new DownloadError('⏱️ The video took too long to prepare. Please try again.', { code: 'TIMEOUT' })); }, timeoutMs);
    child.stderr.on('data', (d) => { if (err.length < 10_000) err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new DownloadError('❌ Could not prepare this video.', { code: 'FAILED', cause: e })); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      logger.warn(`[pinterest] ffmpeg remux failed (code ${code} signal ${signal || 'none'}): ${err.slice(-300).replace(/[\r\n]+/g, ' ')}`);
      reject(new DownloadError('❌ Could not prepare this video.', { code: 'FAILED', cause: new Error(err.slice(-300) || `exit ${code}/${signal}`) }));
    });
  });
}

/** Downloads an HLS stream (segments via fetch) and remuxes the local parts into an mp4. */
async function downloadHls(playlistUrl, out, { dir, id }) {
  const deadline = Date.now() + Math.min(config.limits.maxDownloadSeconds * 1000, 180_000);
  const { video, audio } = await resolveHls(playlistUrl);
  const vFile = path.join(dir, `pin-${id}.vpart`);
  const aFile = path.join(dir, `pin-${id}.apart`);
  await fetchHlsToFile(video, vFile, { maxBytes: config.limits.maxFileBytes, deadline });
  let hasAudio = false;
  if (audio) {
    try { await fetchHlsToFile(audio, aFile, { maxBytes: config.limits.maxFileBytes, deadline }); hasAudio = true; }
    catch (e) { logger.warn(`[pinterest] audio playlist failed, video-only: ${e.message}`); }
  }
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', vFile];
  if (hasAudio) args.push('-i', aFile, '-map', '0:v:0', '-map', '1:a:0');
  else args.push('-map', '0:v:0', '-map', '0:a:0?');
  args.push('-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out);
  try {
    await runFfmpeg(args, Math.max(30_000, deadline - Date.now()));
  } finally {
    await fs.rm(vFile, { force: true });
    await fs.rm(aFile, { force: true });
  }
}

/** Downloads media already picked from a pin payload (also used for search hits, whose ids are encoded and cannot be re-fetched). */
export async function downloadPinMedia(media, pin, id, { dir }) {
  if (!media) throw new DownloadError('❌ No downloadable image or video was found on this pin.', { code: 'NO_MEDIA' });

  let res = null;
  if (media.hls) {
    // pinimg HLS streams usually have a progressive mp4 twin; try it first, else remux with ffmpeg.
    const twin = media.url.replace('/hls/', '/720p/').replace(/\.m3u8(\?.*)?$/i, '.mp4');
    if (twin !== media.url) {
      try { res = await httpDownload(twin, dir, { allowedHosts: MEDIA_HOSTS, baseName: `pin-${id}` }); } catch (e) { logger.warn(`[pinterest] twin mp4 failed: ${e.message}`); res = null; }
    }
    if (!res) {
      // Try the picked variant, then the other qualities the pin offers (up to 3 total).
      const variants = [media.url, ...(media.hlsVariants || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
      let lastErr = null;
      for (const v of variants) {
        const out = path.join(dir, `pin-${id}.mp4`);
        try { await downloadHls(v, out, { dir, id }); res = { path: out, contentType: 'video/mp4' }; lastErr = null; break; } catch (e) { lastErr = e; logger.warn(`[pinterest] hls variant failed: ${e.userMessage || e.message} :: ${(e.cause && (e.cause.message || e.cause)) || 'no cause'}`); }
      }
      if (!res) {
        // Final fallback: send the pin image + link instead of a bare error.
        const img = pin?.images?.orig?.url || pin?.images?.['736x']?.url || pin?.images?.['564x']?.url;
        if (img) {
          try {
            res = await httpDownload(img, dir, { allowedHosts: MEDIA_HOSTS, baseName: `pin-${id}` });
            const st = await fs.stat(res.path);
            const t0 = safeFileName(pin.title || pin.grid_title || pin.description || `pin-${id}`, `pin-${id}`).slice(0, 60);
            return { title: t0, note: `⚠️ The video could not be prepared on the server, so here is the pin image instead.\nWatch the video: https://www.pinterest.com/pin/${id}/`, files: [{ path: res.path, type: 'image', mimetype: res.contentType, fileName: res.path.split('/').pop(), size: st.size }] };
          } catch { /* fall through to the video error */ }
        }
        throw lastErr;
      }
    }
  } else {
  try {
    res = await httpDownload(media.url, dir, { allowedHosts: MEDIA_HOSTS, baseName: `pin-${id}` });
  } catch (err) {
    if (err.code === 'TOO_LARGE') throw new DownloadError(`📦 This file is larger than the ${Math.round(config.limits.maxFileBytes / 1048576)} MB limit.`, { code: 'TOO_LARGE' });
    throw err;
  }
  }
  const title = safeFileName(pin.title || pin.grid_title || pin.description || `pin-${id}`, `pin-${id}`).slice(0, 60);
  const stat = await fs.stat(res.path);
  return {
    title,
    files: [{ path: res.path, type: media.kind, mimetype: res.contentType, fileName: res.path.split('/').pop(), size: stat.size }],
  };
}

// Sent-pin history per query, persisted so a pin is never resent for the same query.
const HIST_FILE = path.join(config.paths.data, 'pin-history.json');
const HIST_MAX_IDS = 2000;
let hist = null;
function loadHist() {
  if (hist) return hist;
  try { hist = JSON.parse(fsSync.readFileSync(HIST_FILE, 'utf8')); } catch { hist = {}; }
  if (!hist || typeof hist !== 'object') hist = {};
  return hist;
}
function saveHist() {
  try {
    const keys = Object.keys(hist);
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete hist[k];
    fsSync.writeFileSync(HIST_FILE + '.tmp', JSON.stringify(hist));
    fsSync.renameSync(HIST_FILE + '.tmp', HIST_FILE);
  } catch { /* history is best effort */ }
}
const histKey = (q) => String(q).toLowerCase().replace(/\s+/g, ' ').trim();
export function sentIds(query) { return new Set(loadHist()[histKey(query)] || []); }
export function markSent(query, id) {
  const h = loadHist(); const k = histKey(query);
  const arr = h[k] || (h[k] = []);
  if (!arr.includes(id)) arr.push(id);
  if (arr.length > HIST_MAX_IDS) arr.splice(0, arr.length - HIST_MAX_IDS);
  saveHist();
}

/** Random pick among pins that were never sent for this query. Returns null when none are left. */
export function chooseVariant(query, usable, rnd = Math.random, sent = sentIds(query)) {
  const fresh = usable.filter((p) => !sent.has(String(p.id)));
  if (!fresh.length) return null;
  return fresh[Math.floor(rnd() * fresh.length)];
}

async function searchPage(query, bookmark) {
  const u = new URL('https://www.pinterest.com/resource/BaseSearchResource/get/');
  u.searchParams.set('source_url', `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`);
  const options = { query, scope: 'pins', rs: 'typed', page_size: 25 };
  if (bookmark) options.bookmarks = [bookmark];
  u.searchParams.set('data', JSON.stringify({ options, context: {} }));
  const res = await fetchPublic(u.href ?? u, {
    timeoutMs: 25_000,
    headers: { 'user-agent': UA, accept: 'application/json', 'x-pinterest-pws-handler': 'www/search/[scope].js', 'x-requested-with': 'XMLHttpRequest' },
  });
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`HTTP ${res.status}`);
  const json = JSON.parse(res.body.toString('utf8'));
  const rr = json?.resource_response;
  const list = (rr?.data?.results || []).filter((p) => p?.id && p.type === 'pin' && (p.images?.orig?.url || p.images?.['736x']?.url));
  const bm = typeof rr?.bookmark === 'string' && rr.bookmark !== '-end-' ? rr.bookmark : null;
  return { list, bm };
}

const EXPAND = ['', ' aesthetic', ' ideas', ' hd', ' wallpaper', ' photos'];
const MAX_PAGES = 6;

/**
 * Searches Pinterest, paging through results (and a few widened queries) until it finds a pin never sent for this query.
 * Returns { url, title }, null when nothing exists, or { exhausted: true } when every pin found was already sent.
 */
export async function searchPin(query, { wantVideo = false } = {}) {
  const sent = sentIds(query);
  let anyFound = false;
  for (const suffix of EXPAND) {
    const q = query + suffix;
    let bm = null; const seen = new Set();
    for (let page = 0; page < MAX_PAGES; page++) {
      let r;
      try { r = await searchPage(q, bm); } catch (e) { if (!anyFound) throw e; break; }
      const pins = r.list.filter((p) => !seen.has(p.id)); pins.forEach((p) => seen.add(p.id));
      if (pins.length) anyFound = true;
      const pin = chooseVariant(query, pins.filter((p) => { const m = pickMedia(p); return wantVideo ? m?.kind === 'video' : m; }), Math.random, sent);
      if (pin) {
        markSent(query, String(pin.id));
        const title = String(pin.title || pin.grid_title || pin.description || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        return { url: `https://www.pinterest.com/pin/${pin.id}/`, title, pin, media: pickMedia(pin), id: String(pin.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) };
      }
      bm = r.bm;
      if (!bm || !r.list.length) break;
    }
  }
  return anyFound ? { exhausted: true } : null;
}

/**
 * Searches and downloads in one loop: a pin that fails to download stays in the
 * sent-history, so the next attempt automatically picks the next fresh pin.
 * Returns { status:'ok', hit, media } | 'none' | 'exhausted' | { status:'failed', cause }.
 */
export async function searchAndDownload(query, { wantVideo = false, dir, maxAttempts = 4, _download = downloadPinMedia } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const hit = await searchPin(query, { wantVideo });
    if (!hit) return { status: 'none' };
    if (hit.exhausted) return { status: 'exhausted' };
    try {
      const media = await _download(hit.media, hit.pin, hit.id, { dir });
      return { status: 'ok', hit, media };
    } catch (e) {
      lastErr = e;
      logger.warn(`Pin ${hit.id} download failed (attempt ${attempt + 1}/${maxAttempts}): ${e.userMessage || e.message} :: ${(e.cause && (e.cause.message || e.cause)) || 'no cause'}`);
    }
  }
  return { status: 'failed', cause: lastErr };
}
