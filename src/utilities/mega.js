// MEGA public-file downloads, clean-room, zero dependencies.
// Only public file links (mega.nz/file/<id>#<key>). Folders are not supported.
// Streams to disk through the decryptor so big files never sit in RAM.
import { fetchPublicStream } from './validation.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import config from '../config/config.js';

const MAX_BYTES = 20 * 1024 * 1024;

const b64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function parseMegaUrl(url) {
  let m = url.match(/mega\.nz\/file\/([\w-]+)#([\w-]+)/) || url.match(/mega\.nz\/(?:embed)?#!([\w-]+)!([\w-]+)/);
  if (!m) return null;
  return { id: m[1], key: b64u(m[2]) };
}

// MEGA file keys: fold the 32-byte key into a 16-byte AES key; bytes 16..24 are the
// CTR nonce and 24..32 the initial counter. Attributes decrypt with AES-CBC, IV 0.
function unfold(key) {
  const k = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) k[i] = key[i] ^ key[i + 16];
  return k;
}

async function api(payload) {
  const r = await fetch(`https://g.api.mega.co.nz/cs?id=${Math.floor(Math.random() * 1e10)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'JarvisBot/1.0' },
    body: JSON.stringify([payload]),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  const res = Array.isArray(j) ? j[0] : j;
  if (typeof res === 'number') throw new Error('MEGA error ' + res);
  return res;
}

export async function megaInfo(url) {
  const p = parseMegaUrl(url);
  if (!p) throw new Error('Not a MEGA file link');
  const res = await api({ a: 'g', g: 1, p: p.id, ssl: 2 });
  const k = unfold(p.key);
  const d = crypto.createDecipheriv('aes-128-cbc', k, Buffer.alloc(16));
  const at = Buffer.concat([d.update(b64u(res.at)), d.final()]);
  const meta = JSON.parse(at.subarray(4).toString('utf8').replace(/\0+$/, ''));
  return { name: meta.n || 'file', size: res.s, url: res.g, key: p.key, aes: k };
}

export async function megaDownload(url, destDir) {
  const info = await megaInfo(url);
  if (info.size > MAX_BYTES) throw new Error(`File is ${(info.size / 1048576).toFixed(1)} MB - over the 20 MB limit`);
  const r = await fetchPublicStream(info.url, { maxBytes: MAX_BYTES + 1, timeoutMs: 120000 });
  if (!(r.status >= 200 && r.status < 300) || !r.stream) throw new Error('Download failed (' + r.status + ')');
  await fs.promises.mkdir(destDir, { recursive: true });
  const out = path.join(destDir, info.name.replace(/[^\w. ()-]/g, '_').slice(0, 80) || 'mega-file');
  // IV = 8-byte nonce (key bytes 16..24) + 8-byte block counter starting at 0.
  // (Key bytes 24..32 are the meta-MAC, not the counter - MEGA CTR starts at 0 for full downloads.)
  const iv = Buffer.concat([info.key.subarray(16, 24), Buffer.alloc(8)]);
  const dec = crypto.createDecipheriv('aes-128-ctr', info.aes, iv);
  await pipeline(r.stream, dec, fs.createWriteStream(out));
  const st = await fs.promises.stat(out);
  return { path: out, name: path.basename(out), size: st.size };
}
