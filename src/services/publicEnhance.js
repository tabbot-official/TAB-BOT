import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'node:crypto';

// Free, key-less AI upscaling through a public Hugging Face Space (Real-ESRGAN). No token or credits.
// Best effort only: callers must fall back to local enhancement on any error or timeout.
const HOST = 'https://nick088-real-esrgan-pytorch.hf.space';
const MAX_SIDE = 1024; // keeps the free GPU job short; result is 2x
const MAX_OUT_BYTES = 12 * 1048576;
let inflight = 0;
let stamps = [];

export class PublicEnhanceError extends Error {}

export function publicAiAvailable(env = process.env, now = Date.now()) {
  if (env.PUBLIC_AI_ENHANCE === 'false') return false;
  stamps = stamps.filter((t) => now - t < 3600_000);
  return inflight < 1 && stamps.length < Math.max(1, Number(env.PUBLIC_AI_ENHANCE_PER_HOUR || 40));
}

function readSse(stream, signal) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const done = (fn, v) => { stream.destroy(); fn(v); };
    signal.addEventListener('abort', () => done(reject, new PublicEnhanceError('timeout')), { once: true });
    stream.on('data', (c) => {
      buf += c.toString();
      if (buf.length > 200000) return done(reject, new PublicEnhanceError('response too large'));
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = block.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        let m; try { m = JSON.parse(line.slice(5)); } catch { continue; }
        if (m.msg === 'process_completed') return m.success ? done(resolve, m.output) : done(reject, new PublicEnhanceError('space error'));
        if (m.msg === 'queue_full') return done(reject, new PublicEnhanceError('queue full'));
      }
    });
    stream.on('error', (e) => reject(e));
    stream.on('end', () => reject(new PublicEnhanceError('stream ended')));
  });
}

export async function publicAiEnhance(input, dir, { timeoutMs = 40000, request = axios.request } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  inflight++; stamps.push(Date.now());
  const small = path.join(dir, 'public-in.jpg');
  try {
    await sharp(input, { limitInputPixels: 16e6, failOn: 'error' }).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(small);
    const form = new FormData();
    form.append('files', await fs.readFile(small), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    const up = await request({ url: HOST + '/upload', method: 'POST', data: form, headers: form.getHeaders(), signal: ctrl.signal, timeout: timeoutMs, maxRedirects: 0, proxy: false });
    const p = up.data?.[0];
    if (typeof p !== 'string' || !p) throw new PublicEnhanceError('upload failed');
    const session = crypto.randomBytes(6).toString('hex');
    await request({ url: HOST + '/queue/join', method: 'POST', signal: ctrl.signal, timeout: 15000, maxRedirects: 0, proxy: false,
      data: { data: [{ path: p, orig_name: 'photo.jpg', meta: { _type: 'gradio.FileData' } }, 2], fn_index: 0, session_hash: session } });
    const r = await request({ url: HOST + '/queue/data', params: { session_hash: session }, method: 'GET', responseType: 'stream', signal: ctrl.signal, timeout: timeoutMs, maxRedirects: 0, proxy: false });
    const out = await readSse(r.data, ctrl.signal);
    const file = out?.data?.[0];
    const url = file?.url || (file?.path ? HOST + '/file=' + file.path : '');
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== new URL(HOST).hostname) throw new PublicEnhanceError('unexpected result host');
    const img = await request({ url: u.href, method: 'GET', responseType: 'arraybuffer', signal: ctrl.signal, timeout: timeoutMs, maxRedirects: 0, proxy: false, maxContentLength: MAX_OUT_BYTES });
    const buf = Buffer.from(img.data);
    if (!buf.length || buf.length > MAX_OUT_BYTES) throw new PublicEnhanceError('bad output size');
    const final = path.join(dir, 'result.jpg');
    await sharp(buf, { limitInputPixels: 4096 * 4096 }).rotate().jpeg({ quality: 92 }).toFile(final);
    return { provider: 'realesrgan-free', file: final, mime: 'image/jpeg', creditsRemaining: null, note: 'Free public Real-ESRGAN Space' };
  } finally {
    clearTimeout(timer); inflight--;
    await fs.rm(small, { force: true });
  }
}
