/** Anime reaction GIFs (hug, pat, wave, ...) from free SFW providers.
 *  Every lookup is a fixed whitelisted category - user input never reaches a URL.
 *  All downloads go through the SSRF-guarded public fetch (validated redirects,
 *  public IPs only, byte caps) and are converted to WhatsApp-playable MP4. */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchPublic } from '../utilities/validation.js';

const WAIFU = 'https://api.waifu.pics/sfw/';
const NEKOS = 'https://nekos.life/api/v2/img/';

/** Platonic, non-suggestive reactions only. waifu/nekos give the category name
 *  used on that provider; missing means the provider does not offer it. */
export const REACTIONS = {
  hug: { emoji: '🤗', verb: 'hugs', waifu: 'hug', nekos: 'hug' },
  pat: { emoji: '🫳', verb: 'pats', waifu: 'pat', nekos: 'pat' },
  cuddle: { emoji: '🥰', verb: 'cuddles', waifu: 'cuddle', nekos: 'cuddle' },
  highfive: { emoji: '🙌', verb: 'high-fives', waifu: 'highfive' },
  wave: { emoji: '👋', verb: 'waves at', waifu: 'wave' },
  smile: { emoji: '😊', verb: 'smiles at', waifu: 'smile' },
  happy: { emoji: '😄', verb: 'shares happiness with', waifu: 'happy' },
  dance: { emoji: '🕺', verb: 'dances with', waifu: 'dance' },
  cry: { emoji: '😢', verb: 'cries with', waifu: 'cry' },
  blush: { emoji: '☺️', verb: 'blushes at', waifu: 'blush' },
  poke: { emoji: '👉', verb: 'pokes', waifu: 'poke', nekos: 'poke' },
  bonk: { emoji: '🔨', verb: 'bonks', waifu: 'bonk' },
  slap: { emoji: '🖐️', verb: 'playfully slaps', waifu: 'slap', nekos: 'slap' },
  feed: { emoji: '🍙', verb: 'feeds', nekos: 'feed' },
  tickle: { emoji: '🤭', verb: 'tickles', nekos: 'tickle' },
};

export const reactionList = () => Object.keys(REACTIONS);
export const resolveReaction = (name) => {
  const k = String(name || '').toLowerCase();
  return REACTIONS[k] ? k : null;
};

const CATEGORY_SAFE = /^[a-z_]{2,20}$/;

async function fetchJson(url, fetchImpl) {
  const r = await fetchImpl(url, { maxBytes: 64 * 1024, timeoutMs: 12000, headers: { accept: 'application/json' } });
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  return JSON.parse(r.body.toString('utf8'));
}

/** Pick a fresh GIF url for a whitelisted reaction. Tries each provider that
 *  serves the category; returns { url, provider }. Throws if all fail. */
export async function fetchReactionGif(type, { fetchImpl = fetchPublic } = {}) {
  const def = REACTIONS[type];
  if (!def) throw new Error('Unknown reaction');
  let lastErr = null;
  for (const provider of ['waifu', 'nekos']) {
    const category = def[provider];
    if (!category || !CATEGORY_SAFE.test(category)) continue;
    const endpoint = (provider === 'waifu' ? WAIFU : NEKOS) + category;
    try {
      const j = await fetchJson(endpoint, fetchImpl);
      if (j && typeof j.url === 'string' && /^https:\/\//.test(j.url)) return { url: j.url, provider };
      lastErr = new Error('Unexpected response');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No provider serves this reaction');
}

const GIF_MAX = 10 * 1024 * 1024;

/** Download the GIF bytes through the guarded fetch and verify they really are a GIF. */
export async function downloadGif(url, { fetchImpl = fetchPublic } = {}) {
  if (!/^https:\/\/(api\.waifu\.pics|waifu\.pics|cdn\.waifu\.pics|media\d*\.?waifu\.pics|nekos\.life|cdn\.nekos\.life)\//.test(url)) throw new Error('GIF host is not allowed');
  const r = await fetchImpl(url, { maxBytes: GIF_MAX, timeoutMs: 30000, headers: { accept: 'image/gif,*/*' } });
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  const head = r.body.subarray(0, 6).toString('ascii');
  if (head !== 'GIF87a' && head !== 'GIF89a') throw new Error('Not a GIF file');
  return r.body;
}

/** Convert GIF bytes to a WhatsApp-playable MP4 (H.264, yuv420p, no audio). */
export async function gifToMp4(gif, { workDir, ffmpeg = 'ffmpeg', timeoutMs = 60000 } = {}) {
  const inFile = path.join(workDir, 'reaction.gif');
  const outFile = path.join(workDir, 'reaction.mp4');
  await fs.writeFile(inFile, gif);
  const args = ['-hide_banner', '-nostdin', '-y', '-i', inFile,
    '-vf', "scale=w='max(2,trunc(iw/2)*2)':h='max(2,trunc(ih/2)*2)':flags=lanczos", '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', '-f', 'mp4', outFile];
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('GIF conversion timed out')); }, timeoutMs);
    p.stderr.on('data', (b) => { err = (err + b.toString()).slice(-4000); });
    p.on('error', () => { clearTimeout(timer); reject(new Error('Video converter is unavailable on this server')); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('GIF could not be converted')); });
  });
  const mp4 = await fs.readFile(outFile);
  if (mp4.length < 100 || mp4.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error('Converted video failed validation');
  return mp4;
}

/** Caption + mentions for a reaction. Only resolved JIDs are ever mentioned. */
export function buildCaption(type, senderJid, targetJid) {
  const def = REACTIONS[type];
  const s = '@' + String(senderJid).split('@')[0];
  if (!targetJid || targetJid === senderJid) {
    return { caption: `${s} ${def.verb} everyone ${def.emoji}`, mentions: [senderJid] };
  }
  const t = '@' + String(targetJid).split('@')[0];
  return { caption: `${s} ${def.verb} ${t} ${def.emoji}`, mentions: [senderJid, targetJid] };
}
