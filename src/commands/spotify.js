// .spotify <track link | album/playlist link | song name | number> - Spotify songs as MP3 with cover art (spotdl-style).
// Spotify audio is DRM-protected: metadata comes from Spotify's public pages, audio from the closest YouTube / YouTube Music match.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { DownloadError, downloadQueue, runYtDlp } from '../utils/downloader.js';
import { createJobDir, removeJobDir, freeDiskBytes, safeFileName } from '../utils/fileManager.js';
import { sendMediaFile } from '../utils/sender.js';
import { bump } from '../database/database.js';
import * as sp from '../downloaders/spotify.js';

const AUDIO_MAX = 16 * 1048576; // WhatsApp audio limit; larger goes as a document
const MAX_SECONDS = 20 * 60;
const LIST_TTL = 30 * 60_000;
const lists = new Map(); // `${jid}|${sender}` -> { at, name, tracks }
const users = new Map(); let hourly = [];
function userLimit(u, now = Date.now()) { const a = (users.get(u) || []).filter((t) => now - t < 60_000); if (a.length >= 3) return false; users.set(u, [...a, now]); if (users.size > 5000) users.clear(); return true; }
function hourOk(now = Date.now()) { hourly = hourly.filter((t) => now - t < 3_600_000); if (hourly.length >= 60) return false; hourly.push(now); return true; }
const listKey = (ctx) => `${ctx.jid}|${ctx.sender}`;
export function saveList(ctx, data, now = Date.now()) { if (lists.size > 2000) lists.clear(); lists.set(listKey(ctx), { at: now, ...data }); }
export function getList(ctx, now = Date.now()) { const l = lists.get(listKey(ctx)); if (!l || now - l.at > LIST_TTL) { lists.delete(listKey(ctx)); return null; } return l; }

export const deps = {
  // Swappable in tests.
  getTrack: sp.getTrack, getCollection: sp.getCollection, resolveShortLink: sp.resolveShortLink, apiSearch: sp.apiSearch,
  runYtDlp, sendMediaFile, freeDiskBytes,
  ffmpeg: (args, timeoutMs = 120_000) => new Promise((resolve, reject) => {
    const p = spawn(config.tools?.ffmpeg || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (c) => { clearTimeout(t); c === 0 ? resolve() : reject(new Error('ffmpeg exit ' + c + ': ' + err.slice(-300))); });
  }),
  download: async (url, file, maxBytes = 5 * 1048576) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('too big');
    let n = 0; const body = Readable.fromWeb(res.body);
    body.on('data', (c) => { n += c.length; if (n > maxBytes) body.destroy(new Error('too big')); });
    await pipeline(body, createWriteStream(file)); // streamed to disk
  },
};

const artistLine = (a, n = 4) => (a || []).slice(0, n).join(', ');
export function caption(t) {
  return [`🎵 *${String(t.title).slice(0, 150)}*`, `👤 ${artistLine(t.artists).slice(0, 150) || 'Unknown artist'}`, t.album ? `💿 ${String(t.album).slice(0, 120)}` : null, t.duration ? `⏱️ ${sp.fmtDuration(t.duration)}` : null, t.url ? `🔗 ${t.url}` : null].filter(Boolean).join('\n');
}
export function formatList(c, prefix = config.prefix) {
  const icon = c.type === 'album' ? '💿' : '📃';
  const lines = c.tracks.map((t, i) => `${i + 1}. ${String(t.title).slice(0, 70)} - ${artistLine(t.artists, 3).slice(0, 80)}${t.duration ? ` (${sp.fmtDuration(t.duration)})` : ''}`);
  const more = c.total > c.tracks.length ? `\n…and ${c.total - c.tracks.length} more (showing the first ${c.tracks.length})` : '';
  return `${icon} *${c.name || (c.type === 'album' ? 'Album' : 'Playlist')}*${c.owner ? ` · ${c.owner}` : ''}\n\n${lines.join('\n')}${more}\n\n⬇️ Send ${prefix}spotify <number> to download one song (e.g. ${prefix}spotify 1).`;
}

/** YouTube candidates for a Spotify track: "artist - title audio" (and a plain query as a second net). */
async function findOnYoutube(track) {
  const a = (track.artists || [])[0] || '';
  const queries = [`${a} - ${track.title} audio`, `${track.title} ${artistLine(track.artists)}`];
  let cands = [];
  for (const q of queries) {
    try {
      const { stdout } = await deps.runYtDlp([`ytsearch6:${q}`, '--flat-playlist', '--print', '%(id)s\t%(duration)s\t%(channel)s\t%(title)s'], { timeoutMs: 30_000 });
      cands = cands.concat(sp.parseCandidates(stdout));
    } catch (e) { logger.warn('[spotify] search failed: ' + String(e?.code || e?.message).slice(0, 60)); }
    const best = sp.pickBest(cands, track);
    if (best && best.score >= 90) return best; // confident match, skip the second query
  }
  return sp.pickBest(cands, track);
}

/** Top song on YouTube Music for a free-text query. */
async function searchYtMusic(query) {
  const url = `https://music.youtube.com/search?q=${encodeURIComponent(query)}#songs`;
  try {
    const { stdout } = await deps.runYtDlp([url, '--flat-playlist', '--playlist-end', '3', '--print', '%(id)s\t%(duration)s\t%(channel)s\t%(title)s'], { timeoutMs: 30_000, useCookies: false });
    const c = sp.parseCandidates(stdout)[0];
    if (c) return c;
  } catch (e) { logger.warn('[spotify] ytmusic search failed: ' + String(e?.code || e?.message).slice(0, 60)); }
  const { stdout } = await deps.runYtDlp([`ytsearch3:${query} audio`, '--flat-playlist', '--print', '%(id)s\t%(duration)s\t%(channel)s\t%(title)s'], { timeoutMs: 30_000 });
  return sp.parseCandidates(stdout)[0] || null;
}

/** Downloads best audio for a YouTube id into dir. Returns { file, meta } with yt-dlp's own track metadata. */
async function fetchAudio(id, dir) {
  const out = path.join(dir, 'src.%(ext)s');
  const args = ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '--max-filesize', String(60 * 1048576), '--match-filter', `duration<=${MAX_SECONDS}`, '-o', out, '--no-simulate',
    '--print', '%(track)s\t%(artist)s\t%(album)s\t%(duration)s\t%(thumbnail)s\t%(title)s\t%(release_year)s', `https://www.youtube.com/watch?v=${id}`];
  let res;
  try { res = await deps.runYtDlp(args, { cwd: dir }); } catch (first) {
    if (['TIMEOUT', 'NO_TOOL', 'PRIVATE', 'TOO_LARGE'].includes(first.code)) throw first;
    res = await deps.runYtDlp(args, { cwd: dir, defaultClients: true });
  }
  const files = (await fs.readdir(dir)).filter((f) => f.startsWith('src.') && !/\.(part|ytdl|json)$/.test(f));
  if (!files.length) throw new DownloadError('❌ That song is too long or could not be downloaded.', { code: 'NO_OUTPUT' });
  const line = String(res.stdout || '').trim().split('\n').pop() || '';
  const [track, artist, album, duration, thumbnail, title, year] = line.split('\t').map((x) => (x === 'NA' ? '' : x));
  return { file: path.join(dir, files[0]), meta: { track, artist, album, duration: Number(duration) || 0, thumbnail, title, year } };
}

/** m4a/webm + cover -> MP3 (192k, 128k for long songs) with ID3v2.3 tags and attached front cover. */
export function mp3Args({ input, cover, output, t, bitrate }) {
  const a = ['-nostdin', '-y', '-hide_banner', '-loglevel', 'error', '-i', input];
  if (cover) a.push('-i', cover);
  a.push('-map', '0:a:0', '-map_metadata', '-1');
  if (cover) a.push('-map', '1:0', '-c:v', 'mjpeg', '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=500:500", '-disposition:v:0', 'attached_pic', '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)');
  a.push('-c:a', 'libmp3lame', '-b:a', bitrate, '-ar', '44100', '-id3v2_version', '3', '-write_xing', '1');
  const md = { title: t.title, artist: artistLine(t.artists), album_artist: (t.artists || [])[0], album: t.album, date: t.year, comment: t.url };
  for (const [k, v] of Object.entries(md)) if (v) a.push('-metadata', `${k}=${String(v).slice(0, 200)}`);
  a.push(output);
  return a;
}

async function deliver(ctx, track, ytId) {
  if ((await deps.freeDiskBytes()) < config.limits.minFreeDiskBytes) throw new DownloadError('💾 The server is low on disk space. Please try again later.', { code: 'DISK' });
  return downloadQueue.add(ctx.sender, async () => {
    const dir = await createJobDir();
    try {
      const { file, meta } = await fetchAudio(ytId, dir);
      // Name searches: fill what Spotify did not give us from YouTube Music's own track data.
      if (!track.artists?.length && meta.artist) track.artists = meta.artist.split(/\s*,\s*/).filter((x, i, arr) => x && arr.indexOf(x) === i);
      if (!track.album && meta.album) track.album = meta.album;
      if (!track.year && meta.year) track.year = meta.year;
      if (track.fromYoutube && meta.track) track.title = meta.track;
      if (!track.duration) track.duration = meta.duration;
      const cover = path.join(dir, 'cover.img');
      let haveCover = false;
      for (const u of [track.cover, meta.thumbnail].filter(Boolean)) {
        try { await deps.download(u, cover); haveCover = true; break; } catch { /* try the next image */ }
      }
      const secs = track.duration || meta.duration || 0;
      const bitrate = secs > 660 ? '128k' : '192k';
      const base = safeFileName(`${artistLine((track.artists || []).slice(0, 2))} - ${track.title}`.replace(/^ - /, ''), 'spotify');
      const mp3 = path.join(dir, 'song.mp3');
      try { await deps.ffmpeg(mp3Args({ input: file, cover: haveCover ? cover : null, output: mp3, t: track, bitrate })); }
      catch (e) { if (!haveCover) throw e; logger.warn('[spotify] cover embed failed, retrying without it'); await deps.ffmpeg(mp3Args({ input: file, cover: null, output: mp3, t: track, bitrate })); haveCover = false; }
      await fs.rm(file, { force: true });
      const st = await fs.stat(mp3);
      if (!st.size) throw new DownloadError('❌ The converted file was empty. Please try again.', { code: 'EMPTY' });
      const text = caption(track);
      if (st.size <= AUDIO_MAX) {
        if (haveCover) {
          const jpg = path.join(dir, 'cover.jpg');
          try { await deps.ffmpeg(['-nostdin', '-y', '-loglevel', 'error', '-i', cover, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=500:500", '-frames:v', '1', jpg], 30_000); await deps.sendMediaFile(ctx.sock, ctx.jid, { path: jpg, type: 'image', mimetype: 'image/jpeg' }, ctx.msg, text); }
          catch { await ctx.reply(text); }
        } else await ctx.reply(text);
        await deps.sendMediaFile(ctx.sock, ctx.jid, { path: mp3, type: 'audio', mimetype: 'audio/mpeg', fileName: base + '.mp3' }, ctx.msg);
      } else {
        await deps.sendMediaFile(ctx.sock, ctx.jid, { path: mp3, type: 'document', mimetype: 'audio/mpeg', fileName: base + '.mp3' }, ctx.msg, text + '\n\n📦 Sent as a file (over 16 MB)');
      }
      bump('downloads');
      return { track, size: st.size, asDocument: st.size > AUDIO_MAX };
    } finally { await removeJobDir(dir).catch(() => {}); }
  }, (pos) => ctx.reply(`🕒 In the download queue: #${pos}`).catch(() => {}));
}

async function trackFlow(ctx, track) {
  if (track.duration > MAX_SECONDS) return ctx.reply(`⏱️ That track is longer than ${MAX_SECONDS / 60} minutes, too long to send here.`);
  await ctx.reply(`🔎 ${track.title} - ${artistLine(track.artists)}\nFinding the audio...`);
  const best = await findOnYoutube(track);
  if (!best) return ctx.reply('🤷 Could not find this song on YouTube. Try ' + config.prefix + 'spotify <song name>.');
  logger.info(`[spotify] match ${best.id} score ${best.score} (${best.duration}s vs ${track.duration}s)`);
  return deliver(ctx, track, best.id);
}

export default {
  name: 'spotify',
  aliases: ['spdl'],
  category: 'Downloaders',
  description: 'Download a Spotify song as MP3 with cover art (link, album/playlist or song name)',
  usage: 'spotify <spotify link | song name | number from a list>',
  async run(ctx) {
    const p = config.prefix;
    const input = (ctx.args || []).join(' ').trim();
    if (!input) return ctx.reply(`🎧 *Spotify downloader*\n\n• ${p}spotify <spotify song link> → MP3 with cover\n• ${p}spotify <song name> → finds and sends it\n• ${p}spotify <album/playlist link> → first 10 songs, then ${p}spotify <number>\n\nAlias: ${p}spdl`);
    try {
      // A number picks from this user's last album/playlist list in this chat.
      if (/^\d{1,2}$/.test(input)) {
        const l = getList(ctx);
        if (l) {
          const n = Number(input); const it = l.tracks[n - 1];
          if (!it) return ctx.reply(`❌ Pick a number from 1 to ${l.tracks.length}.`);
          if (!userLimit(ctx.sender)) return ctx.reply('⏳ Limit: 3 Spotify downloads per minute. Try again shortly.');
          if (!hourOk()) return ctx.reply('⏳ Spotify downloads are busy right now. Try again in a few minutes.');
          let track; try { track = await deps.getTrack(it.id); } catch { track = { ...it, url: `https://open.spotify.com/track/${it.id}` }; }
          return await trackFlow(ctx, track);
        }
      }
      let link = sp.parseSpotifyLink(ctx.args[0]);
      if (!link && sp.isShortSpotifyLink(ctx.args[0])) { try { link = await deps.resolveShortLink(ctx.args[0]); } catch { link = null; } }
      if (!link && sp.looksLikeSpotify(ctx.args[0])) return ctx.reply('❌ Send a Spotify *track*, *album* or *playlist* link (podcasts and artists are not supported).');
      if (link && link.type !== 'track') {
        let c;
        try { c = await deps.getCollection(link.type, link.id, { limit: 10 }); } catch { return ctx.reply(`❌ Could not open that ${link.type}. It may be private or the link is wrong.`); }
        if (!c.tracks.length) return ctx.reply(`🤷 That ${link.type} has no songs I can read.`);
        saveList(ctx, { name: c.name, tracks: c.tracks });
        return ctx.reply(formatList(c, p));
      }
      if (!userLimit(ctx.sender)) return ctx.reply('⏳ Limit: 3 Spotify downloads per minute. Try again shortly.');
      if (!hourOk()) return ctx.reply('⏳ Spotify downloads are busy right now. Try again in a few minutes.');
      if (link) {
        let track;
        try { track = await deps.getTrack(link.id); } catch { return ctx.reply('❌ Could not read that Spotify track. Check the link and try again.'); }
        return await trackFlow(ctx, track);
      }
      // Song name: Spotify info when the optional API keys are set, otherwise straight to YouTube Music.
      let info = null;
      try { info = await deps.apiSearch(input); } catch { info = null; }
      if (info) return await trackFlow(ctx, info);
      await ctx.reply(`🔎 Searching YouTube Music for "${input.slice(0, 80)}"...`);
      const hit = await searchYtMusic(input.slice(0, 120));
      if (!hit) return ctx.reply(`🔎 No song found for "${input.slice(0, 80)}". Try the artist name too, or send a Spotify link.`);
      return await deliver(ctx, { title: hit.title, artists: [], album: null, cover: null, duration: hit.duration || 0, url: null, fromYoutube: true }, hit.id);
    } catch (err) {
      bump('failures');
      logger.warn('[spotify] failed: ' + String(err?.code || err?.message || err).slice(0, 120));
      const msg = err instanceof DownloadError && err.userMessage ? err.userMessage : '❌ Could not download that song right now. Please try again.';
      await ctx.reply(msg).catch(() => {});
    }
  },
};
