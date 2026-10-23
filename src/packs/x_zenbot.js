// Extra commands from @soyaxell09/zenbot-scraper v1.1.9 (AxelDev09, MIT), vendored in src/vendor/zenbot.
// Only scrapers that worked live and that TAB BOT did not already have: .tiktok .threads .yts .ghsearch .deezer .attp
// Media is streamed to a temp job folder on disk and removed after sending (low memory).
import fs from 'node:fs/promises';
import path from 'node:path';
import { defineCommand } from './_kit.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { createJobDir, removeJobDir } from '../utils/fileManager.js';
import { fileTypeFromFile } from 'file-type';
import { streamToFile } from '../commands/xvideos.js';
import { tiktokDownload } from '../vendor/zenbot/tiktok.js';
import { threadsDownload } from '../vendor/zenbot/threads.js';
import { threadsDirect, isAvatarUrl } from '../downloaders/threadsDirect.js';
import { ytSearch } from '../vendor/zenbot/youtube.js';
import { githubSearch } from '../vendor/zenbot/github.js';
import { deezerFind } from '../vendor/zenbot/deezersearch.js';
import { attp } from '../vendor/zenbot/attp.js';

const MB = 1024 * 1024;
const P = () => config.prefix || '.';
const clip = (s, n = 80) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const num = (x) => (x == null ? '?' : Number(x).toLocaleString('en-IN'));
const linkArg = (args, re) => { const u = (args || []).find((a) => /^https?:\/\//i.test(a)); if (!u) return null; try { const x = new URL(u); return re.test(x.hostname) ? x.href : null; } catch { return null; } };

/** Download one remote file to a job folder and send it: <=16 MB video inline, bigger as a document (<=100 MB). */
async function sendRemote(ctx, url, { kind, caption = '', referer, name = 'media' }) {
  let dir = null;
  try {
    dir = await createJobDir();
    const ext = kind === 'image' ? '.jpg' : kind === 'audio' ? '.mp3' : '.mp4';
    const file = path.join(dir, name + ext);
    const size = await streamToFile(url, file, { referer, maxBytes: Math.min(100 * MB, config.limits.maxFileBytes || 100 * MB) });
    if (!size) throw new Error('empty file');
    // Trust the bytes, not the scraper's label.
    const ft = await fileTypeFromFile(file).catch(() => null);
    const mime = ft?.mime || '';
    const real = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : null;
    if (!real) throw new Error('not a media file: ' + (mime || 'unknown'));
    if (kind === 'audio' && real === 'video') kind = 'audio'; // TikTok sounds come as mp4 audio
    else kind = real;
    const src = { url: file };
    let content;
    if (kind === 'image') content = { image: src, caption };
    else if (kind === 'audio') content = { audio: src, mimetype: mime === 'audio/mpeg' ? 'audio/mpeg' : 'audio/mp4', ptt: false };
    else if (size <= 16 * MB) content = { video: src, mimetype: 'video/mp4', caption };
    else content = { document: src, mimetype: mime || 'video/mp4', fileName: name + '.' + (ft?.ext || 'mp4'), caption };
    await ctx.sock.sendMessage(ctx.jid, content, { quoted: ctx.msg });
    return size;
  } finally { await removeJobDir(dir); }
}

// tikwm's free API allows 1 request per second: space calls out and retry once on its limit message.
let tikwmLast = 0;
async function tiktokInfo(url) {
  for (let i = 0; i < 2; i++) {
    const wait = tikwmLast + 1200 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    tikwmLast = Date.now();
    try { return await tiktokDownload(url); } catch (e) { if (i || !/limit/i.test(String(e.message))) throw e; }
  }
}

const cmd = (category, e, run) => { const c = defineCommand(category, { tests: [['', null, () => true]], ...e, fn: () => '' }); c.run = run; c.zenbot = true; return c; };

const tiktok = cmd('Downloaders', { name: 'tiktok', aliases: ['tt', 'ttdl', 'tiktokdl'], description: 'Download a TikTok video without watermark (or its photos / sound)', usage: 'tiktok <TikTok link> [audio]', web: true, tests: [['https://www.tiktok.com/@khaby.lame/video/7137423965982592302', null, () => true]] }, async (ctx) => {
  const url = linkArg(ctx.args, /(^|\.)tiktok\.com$/i);
  if (!url) return ctx.reply(`Usage: ${P()}tiktok <TikTok link>\nAdd "audio" at the end for just the sound.`);
  const wantAudio = (ctx.args || []).some((a) => /^(audio|mp3|sound)$/i.test(a));
  try {
    await ctx.reply('⏳ Downloading TikTok...');
    const d = await tiktokInfo(url);
    const cap = `🎵 ${clip(d.title || 'TikTok', 120)}${d.author ? `\n👤 ${d.author}` : ''}\n▶️ ${num(d.plays)} · ❤️ ${num(d.likes)}`;
    if (wantAudio) { const a = d.music?.url || d.audio; if (!a) throw new Error('no audio'); await sendRemote(ctx, a, { kind: 'audio', name: 'tiktok-audio' }); return; }
    if (d.images?.length) { for (const [i, img] of d.images.slice(0, 10).entries()) await sendRemote(ctx, img, { kind: 'image', caption: i === 0 ? cap : '', name: 'tiktok-' + i }); return; }
    const v = d.nowatermark || d.watermark; if (!v) throw new Error('no video');
    await sendRemote(ctx, v, { kind: 'video', caption: cap, name: 'tiktok-' + (d.id || 'video') });
  } catch (e) { logger.warn(`tiktok failed: ${e.message}`); await ctx.reply('❌ Could not download that TikTok right now. Check the link is public and try again.'); }
});

// Threads sources, in order: the post page itself (threads.com JSON: every video/photo of the post, carousels too),
// then sssthreads. sssthreads sometimes answers with a 150px profile picture instead of the media: never send an avatar.
export async function threadsMedia(url, { direct = threadsDirect, sss = threadsDownload, pause = 2500 } = {}) {
  const errors = [];
  try { const items = (await direct(url)).filter((x) => x?.url && !isAvatarUrl(x.url)); if (items.length) return { items, via: 'threads.com' }; } catch (e) { errors.push('threads.com: ' + e.message); }
  for (let i = 0; i < 3; i++) {
    if (i && pause) await new Promise((r) => setTimeout(r, pause));
    try { const r = await sss(url); if (r?.url && !isAvatarUrl(r.url)) return { items: [{ type: r.type === 'image' ? 'image' : 'video', url: r.url }], via: 'sssthreads' }; errors.push('sssthreads: avatar only'); }
    catch (e) { errors.push('sssthreads: ' + e.message); }
  }
  throw new Error(errors.slice(-2).join('; ') || 'no media');
}

const threads = cmd('Downloaders', { name: 'threads', aliases: ['threadsdl'], description: 'Download the videos or photos of a public Threads post', usage: 'threads <Threads post link>', web: true }, async (ctx) => {
  const url = linkArg(ctx.args, /(^|\.)threads\.(net|com)$/i);
  if (!url) return ctx.reply(`Usage: ${P()}threads <Threads post link>`);
  try {
    await ctx.reply('⏳ Downloading from Threads...');
    const { items, via } = await threadsMedia(url);
    let sent = 0;
    for (const [i, it] of items.slice(0, 10).entries()) {
      try { await sendRemote(ctx, it.url, { kind: it.type === 'image' ? 'image' : 'video', caption: sent ? '' : '✅ Threads', name: 'threads-' + i }); sent++; }
      catch (e) { logger.warn(`threads item ${i} (${via}) failed: ${e.message}`); }
    }
    if (!sent) throw new Error('no item could be sent');
  } catch (e) { logger.warn(`threads failed: ${e.message}`); await ctx.reply('❌ Could not download that Threads post. Make sure it is public and has a video or photo.'); }
});

const yts = cmd('Downloaders', { name: 'yts', aliases: ['ytsearch'], description: 'Search YouTube and list the top results with links', usage: 'yts <words>', web: true, minArgs: 1, tests: [['kesariya', null, () => true]] }, async (ctx) => {
  const q = (ctx.args || []).join(' ').trim().slice(0, 100);
  if (!q) return ctx.reply(`Usage: ${P()}yts <words>`);
  try {
    const r = (await ytSearch(q, 6)).filter((x) => x?.url).slice(0, 6);
    if (!r.length) return ctx.reply(`No YouTube results for "${clip(q, 40)}".`);
    const lines = r.map((x, i) => `${i + 1}. ${clip(x.title, 70)}${x.duration ? ` (${x.duration})` : ''}${x.channel || x.author ? `\n   ${clip(x.channel || x.author, 40)}` : ''}\n   ${x.url}`);
    await ctx.reply(`🔎 YouTube: "${clip(q, 40)}"\n\n${lines.join('\n')}\n\nDownload: ${P()}play <link> (audio) or ${P()}video <link>`);
  } catch (e) { logger.warn(`yts failed: ${e.message}`); await ctx.reply('❌ YouTube search is not working right now. Try again in a bit.'); }
});

const ghsearch = cmd('Tools', { name: 'ghsearch', aliases: ['githubsearch', 'gitsearch'], description: 'Search GitHub repositories', usage: 'ghsearch <words>', web: true, minArgs: 1, tests: [['baileys', null, () => true]] }, async (ctx) => {
  const q = (ctx.args || []).join(' ').trim().slice(0, 100);
  if (!q) return ctx.reply(`Usage: ${P()}ghsearch <words>`);
  try {
    const r = await githubSearch(q, 'repositories', 5);
    if (!r?.length) return ctx.reply(`No GitHub repos found for "${clip(q, 40)}".`);
    const lines = r.map((x, i) => `${i + 1}. ${x.name} ⭐ ${num(x.stars)}${x.language ? ` · ${x.language}` : ''}\n   ${clip(x.description || '', 90)}\n   ${x.url}`);
    await ctx.reply(`🐙 GitHub: "${clip(q, 40)}"\n\n${lines.join('\n')}\n\nZip a repo: ${P()}gitclone <link>`);
  } catch (e) { logger.warn(`ghsearch failed: ${e.message}`); await ctx.reply('❌ GitHub search is not working right now (GitHub limits anonymous searches). Try again in a minute.'); }
});

const deezer = cmd('Downloaders', { name: 'deezer', aliases: ['dz'], description: 'Find a song on Deezer and get its 30-second preview', usage: 'deezer <song name>', web: true, minArgs: 1, tests: [['kesariya', null, () => true]] }, async (ctx) => {
  const q = (ctx.args || []).join(' ').trim().slice(0, 100);
  if (!q) return ctx.reply(`Usage: ${P()}deezer <song name>`);
  try {
    const r = await deezerFind(q, 5);
    if (!r?.length) return ctx.reply(`No Deezer results for "${clip(q, 40)}".`);
    const top = r[0];
    const more = r.slice(1, 5).map((x, i) => `${i + 2}. ${clip(x.title, 50)} – ${clip(x.artist, 30)}`).join('\n');
    await ctx.reply(`🎧 ${top.title} – ${top.artist}\n💿 ${top.album || ''}${top.duration ? ` · ${top.duration}` : ''}\n${top.link || ''}${more ? `\n\nAlso:\n${more}` : ''}\n\nFull song: ${P()}play ${clip(top.title + ' ' + top.artist, 60)}`);
    if (top.preview) await sendRemote(ctx, top.preview, { kind: 'audio', name: 'deezer-preview' });
  } catch (e) { logger.warn(`deezer failed: ${e.message}`); await ctx.reply('❌ Deezer search is not working right now.'); }
});

const attpCmd = cmd('Image', { name: 'attp', aliases: ['ttp'], description: 'Animated colour-changing text sticker', usage: 'attp <text, up to 40 letters>', minArgs: 1, tests: [['Tab', null, () => true]] }, async (ctx) => {
  const text = (ctx.args || []).join(' ').trim();
  if (!text) return ctx.reply(`Usage: ${P()}attp <text>`);
  try {
    const gif = Buffer.from(await attp(text.slice(0, 40), text.length > 12 ? 3 : 5));
    const { toSticker } = await import('../utils/imageTools.js');
    const out = await toSticker(gif, { animated: true, pack: 'Tab', author: 'attp' });
    await ctx.sock.sendMessage(ctx.jid, { sticker: out }, { quoted: ctx.msg });
  } catch (e) { logger.warn(`attp failed: ${e.message}`); await ctx.reply('❌ Could not make that sticker. Try shorter text (A–Z, 0–9).'); }
});

export default [tiktok, threads, yts, ghsearch, deezer, attpCmd];
