// Image and sticker helpers: media lookup, WebP stickers with WhatsApp metadata, conversions.
import {identify} from '../utilities/files.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import config from '../config/config.js';
import { getCached, cacheInfo } from './msgCache.js';
import fsSync from 'node:fs';
import logger from './logger.js';

let sharpMod = null;
async function sharp() {
  if (!sharpMod) {
    try { sharpMod = (await import('sharp')).default; } catch { throw new Error('SHARP_MISSING'); }
  }
  return sharpMod;
}

const unwrap = (m) =>
  m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m?.documentWithCaptionMessage?.message || m;

/** Finds an image/video/sticker in the command message or in the message it replies to. */
export function findMedia(msg) {
  const direct = unwrap(msg.message) || {};
  const ctxInfo = direct.extendedTextMessage?.contextInfo || direct.imageMessage?.contextInfo || direct.videoMessage?.contextInfo;
  if (!ctxInfo && !direct.imageMessage && !direct.videoMessage) logger.info(`[image] no reply info; message type: ${Object.keys(direct).filter((k) => k !== 'messageContextInfo').join(',').slice(0, 80)}`);
  let quoted = unwrap(ctxInfo?.quotedMessage) || null;
  let cachedKey = null;
  const hasMedia = (h) => h && (h.imageMessage || h.videoMessage || h.stickerMessage || h.documentMessage);
  if (ctxInfo?.stanzaId && !hasMedia(quoted)) {
    // WhatsApp sometimes leaves the quoted media out; fall back to what this bot saw earlier.
    const c = getCached(ctxInfo.stanzaId);
    if (c) { quoted = c.message; cachedKey = c.key; }
    else logger.info(`[image] reply has no media (quoted ${quoted ? 'other' : 'missing'}, not in cache)`);
  }
  for (const [holder, fromQuote] of [[direct, false], [quoted, true]]) {
    if (!holder) continue;
    for (const type of ['imageMessage', 'videoMessage', 'stickerMessage']) {
      if (holder[type]) {
        const key = fromQuote
          ? cachedKey || { remoteJid: msg.key.remoteJid, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: false }
          : msg.key;
        return { type: type.replace('Message', ''), node: holder[type], message: { key, message: holder }, animated: !!holder[type].isAnimated || type === 'videoMessage' || holder[type].seconds > 0 };
      }
    }
    if (holder.documentMessage && /^video\/|gif/.test(holder.documentMessage.mimetype || '')) {
      const key = fromQuote ? cachedKey || { remoteJid: msg.key.remoteJid, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: false } : msg.key;
      return { type: 'video', node: holder.documentMessage, message: { key, message: holder }, animated: true };
    }
    if (holder.documentMessage && /^image\//.test(holder.documentMessage.mimetype || '')) {
      const key = fromQuote ? cachedKey || { remoteJid: msg.key.remoteJid, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: false } : msg.key;
      return { type: 'image', node: holder.documentMessage, message: { key, message: holder }, animated: false };
    }
  }
  debugMiss(msg, direct, ctxInfo, quoted);
  return null;
}

function debugMiss(msg, direct, ctxInfo, quoted) {
  try {
    const shape = (o) => (o && typeof o === 'object' ? Object.keys(o).slice(0, 12) : o);
    const line = JSON.stringify({ t: new Date().toISOString(), msgKeys: shape(msg.message), direct: shape(direct), ctxKeys: shape(ctxInfo), stanzaId: ctxInfo?.stanzaId, quotedKeys: shape(quoted), cache: cacheInfo(), key: { fromMe: msg.key?.fromMe, remote: String(msg.key?.remoteJid || '').split('@')[1], id: String(msg.key?.id || '').slice(0, 8) } });
    fsSync.mkdirSync('data', { recursive: true });
    fsSync.appendFileSync('data/replydebug.log', line + '\n');
  } catch { /* diagnostics only */ }
}

export async function downloadMedia(sock, media) {
  const buf=await downloadMediaMessage(media.message, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
  const t=await identify(buf);if(!t.mime.startsWith('image/')&&!t.mime.startsWith('video/'))throw new Error('Unsupported image/video content');return buf;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.tools.ffmpeg || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    const t = setTimeout(() => p.kill('SIGKILL'), 60000);
    p.on('error', reject);
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)); });
  });
}

/** Writes WhatsApp sticker-pack EXIF into a WebP buffer (static or animated). */
export function addStickerExif(webp, pack, author) {
  const json = Buffer.from(JSON.stringify({ 'sticker-pack-id': crypto.randomBytes(16).toString('hex'), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['🤖'] }), 'utf8');
  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const exif = Buffer.concat([head, json]);
  exif.writeUInt32LE(json.length, 14);
  if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not webp');
  let body = webp.subarray(12);
  if (body.toString('ascii', 0, 4) !== 'VP8X') {
    // Build a VP8X header (needed to carry EXIF). Canvas is 512x512 for stickers.
    const v = Buffer.alloc(18);
    v.write('VP8X', 0, 'ascii');
    v.writeUInt32LE(10, 4);
    v[8] = 0x08;
    v.writeUIntLE(511, 12, 3);
    v.writeUIntLE(511, 15, 3);
    body = Buffer.concat([v, body]);
  } else {
    body = Buffer.from(body);
    body[8] |= 0x08; // EXIF flag
  }
  const chunk = Buffer.alloc(8 + exif.length + (exif.length % 2));
  chunk.write('EXIF', 0, 'ascii');
  chunk.writeUInt32LE(exif.length, 4);
  exif.copy(chunk, 8);
  const out = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), body, chunk]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

export const STICKER_LADDER = [{ fps: 12, q: 45, t: 8 }, { fps: 10, q: 35, t: 6 }, { fps: 8, q: 25, t: 5 }, { fps: 8, q: 15, t: 4 }];
export async function toSticker(buf, { animated, pack = 'Tab', author = 'Rohan', crop = false }) {
  let webp;
  if (animated) {
    const dir = await fs.mkdtemp(path.join(config.paths.temp, 'stk-'));
    try {
      const inp = path.join(dir, 'in.bin');
      const out = path.join(dir, 'out.webp');
      await fs.writeFile(inp, buf);
      const vf = (fps) => (crop ? `fps=${fps},scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba` : `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`);
      // Size ladder: try the best look first, then lighter settings until it fits WhatsApp's ~900 KB sticker limit. One thread keeps RAM low.
      for (const a of STICKER_LADDER) {
        await runFfmpeg(['-y', '-threads', '1', '-i', inp, '-t', String(a.t), '-vf', vf(a.fps), '-loop', '0', '-an', '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(a.q), '-compression_level', '4', out]);
        webp = await fs.readFile(out);
        if (webp.length <= 900 * 1024) break;
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    if (webp.length > 900 * 1024) throw new Error('STICKER_TOO_BIG');
  } else {
    const s = await sharp();
    webp = await s(buf).resize(512, 512, { fit: crop ? 'cover' : 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80 }).toBuffer();
  }
  return addStickerExif(webp, pack, author);
}

export async function stickerToImage(buf, format = 'png') {
  const s = await sharp();
  const img = s(buf, { animated: false });
  return format === 'jpg' ? img.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer() : img.png().toBuffer();
}

export async function resizeImage(buf, width) {
  const s = await sharp();
  const meta = await s(buf).metadata();
  if (!meta.width) throw new Error('BAD_IMAGE');
  return { out: await s(buf).resize({ width, withoutEnlargement: false }).toBuffer(), meta };
}

export async function compressImage(buf, quality = 60) {
  const s = await sharp();
  return s(buf).rotate().jpeg({ quality, mozjpeg: true }).toBuffer();
}

export async function convertImage(buf, format) {
  const s = await sharp();
  const img = s(buf);
  if (format === 'png') return { out: await img.png().toBuffer(), mime: 'image/png', ext: 'png' };
  if (format === 'webp') return { out: await img.webp({ quality: 85 }).toBuffer(), mime: 'image/webp', ext: 'webp' };
  return { out: await img.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer(), mime: 'image/jpeg', ext: 'jpg' };
}

export const MEDIA_LIMIT = 15 * 1024 * 1024;
export function friendly(err, what) {
  if (err.message === 'SHARP_MISSING') return '❌ Image tools are not installed on this server yet.';
  if (err.message === 'STICKER_TOO_BIG') return '📦 That clip is too big for a sticker. Try a shorter one.';
  return `❌ Could not ${what}. Send or reply to a valid image.`;
}

/** True when the message replies to something whose media the bot cannot see (older than the bot's memory). */
export function quotedMediaMissing(msg) {
  const direct = unwrap(msg.message) || {};
  const c = direct.extendedTextMessage?.contextInfo || direct.imageMessage?.contextInfo || direct.videoMessage?.contextInfo;
  return !!c?.stanzaId && !findMedia(msg);
}
export const MISSING_MEDIA_HINT = "I can't see that photo anymore (it is older than my memory or I was offline). Please send it again with the command as its caption.";
