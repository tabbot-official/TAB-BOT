// Remembers recent media messages (images, videos, stickers) so a reply to them can be processed
// even when WhatsApp does not include the quoted media in the reply itself.
// The cache is saved to disk, so it survives bot restarts.
import fs from 'node:fs';
import path from 'node:path';
import { BufferJSON } from '@whiskeysockets/baileys';
import config from '../config/config.js';

const MAX = 400;
const cache = new Map();
const file = path.join(config.paths.data, 'media-cache.json');
const unwrap = (m) => m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m?.documentWithCaptionMessage?.message || m;

try {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'), BufferJSON.reviver);
  for (const [id, v] of rows) cache.set(id, v);
} catch { /* first run or unreadable file */ }

let timer = null;
function scheduleSave() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.mkdirSync(config.paths.data, { recursive: true });
      fs.writeFileSync(file, JSON.stringify([...cache.entries()], BufferJSON.replacer));
    } catch { /* best effort */ }
  }, 3000);
  timer.unref?.();
}

// Keep only what is needed to download the media again (thumbnails are the bulk of the size).
function slim(m) {
  const out = { ...m };
  for (const t of ['imageMessage', 'videoMessage', 'stickerMessage', 'documentMessage']) {
    if (out[t]) { out[t] = { ...out[t] }; delete out[t].jpegThumbnail; delete out[t].contextInfo; }
  }
  return out;
}

export function cacheMessage(msg) {
  try {
    const id = msg?.key?.id;
    const m = unwrap(msg?.message);
    if (!id || !m) return;
    if (!(m.imageMessage || m.videoMessage || m.stickerMessage || m.documentMessage || m.audioMessage)) return;
    cache.set(id, { key: msg.key, message: slim(m) });
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    scheduleSave();
  } catch { /* cache is best effort */ }
}
export const getCached = (id) => cache.get(id) || null;
export const cacheInfo = () => ({ size: cache.size, last: [...cache.keys()].slice(-6).map((k) => k.slice(0, 10) + '..' + k.length) });
