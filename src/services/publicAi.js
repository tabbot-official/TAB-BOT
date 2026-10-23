import crypto from 'node:crypto';
import axios from 'axios';
import FormData from 'form-data';

// Free, key-less public AI helpers (Hugging Face Spaces + Pollinations). Best effort: callers must handle errors.
export class PublicAiError extends Error {
  constructor(m) { super(m); this.quota = /quota|runs limit/i.test(String(m || '')); }
}
const MAX_BYTES = 12 * 1048576;
const NET = { maxRedirects: 0, proxy: false };

export function makeLimiter(name, perHourEnv, defPerHour, maxInflight = 1) {
  let inflight = 0; let stamps = [];
  return {
    ok(env = process.env, now = Date.now()) {
      if (env.PUBLIC_AI_ENABLED === 'false' || env[name + '_ENABLED'] === 'false') return false;
      stamps = stamps.filter((t) => now - t < 3600_000);
      return inflight < maxInflight && stamps.length < Math.max(1, Number(env[perHourEnv] || defPerHour));
    },
    async run(fn) { inflight++; stamps.push(Date.now()); try { return await fn(); } finally { inflight--; } },
  };
}

function readSse(stream, signal) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const done = (fn, v) => { stream.destroy(); fn(v); };
    signal.addEventListener('abort', () => done(reject, new PublicAiError('timeout')), { once: true });
    stream.on('data', (c) => {
      buf += c.toString();
      if (buf.length > 400000) return done(reject, new PublicAiError('response too large'));
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = block.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        let m; try { m = JSON.parse(line.slice(5)); } catch { continue; }
        if (m.msg === 'process_completed') return m.success ? done(resolve, m.output) : done(reject, new PublicAiError(String(m.output?.error || 'space error').slice(0, 160)));
        if (m.msg === 'queue_full') return done(reject, new PublicAiError('queue full'));
      }
    });
    stream.on('error', reject);
    stream.on('end', () => reject(new PublicAiError('stream ended')));
  });
}

// Run one Gradio 5 Space function. `data` entries may be { upload: Buffer, name, type } to upload a file first.
export async function gradioRun(host, fnIndex, data, { timeoutMs = 40000, request = axios.request, prefix = '/gradio_api' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const auth = process.env.HF_TOKEN && /\.hf\.space$/.test(new URL(host).hostname) ? { Authorization: 'Bearer ' + process.env.HF_TOKEN } : {};
  const base = { signal: ctrl.signal, timeout: timeoutMs, headers: auth, ...NET };
  try {
    const args = [];
    for (const d of data) {
      if (d && d.upload) {
        const form = new FormData();
        form.append('files', d.upload, { filename: d.name || 'file', contentType: d.type || 'application/octet-stream' });
        const up = await request({ ...base, url: host + prefix + '/upload', method: 'POST', data: form, headers: { ...auth, ...form.getHeaders() } });
        const p = up.data?.[0];
        if (typeof p !== 'string' || !p) throw new PublicAiError('upload failed');
        args.push({ path: p, orig_name: d.name || 'file', meta: { _type: 'gradio.FileData' } });
      } else args.push(d);
    }
    const session = crypto.randomBytes(6).toString('hex');
    await request({ ...base, timeout: 15000, url: host + prefix + '/queue/join', method: 'POST', data: { data: args, fn_index: fnIndex, session_hash: session } });
    const r = await request({ ...base, url: host + prefix + '/queue/data', params: { session_hash: session }, method: 'GET', responseType: 'stream' });
    const out = await readSse(r.data, ctrl.signal);
    return { output: out, fetch: (f) => fetchResult(host, f, base, request, prefix) };
  } finally { clearTimeout(timer); }
}

async function fetchResult(host, file, base, request, prefix = '/gradio_api') {
  const url = file?.url || (file?.path ? host + prefix + '/file=' + file.path : '');
  let u; try { u = new URL(url); } catch { throw new PublicAiError('no result file'); }
  if (u.protocol !== 'https:' || u.hostname !== new URL(host).hostname) throw new PublicAiError('unexpected result host');
  const img = await request({ ...base, url: u.href, method: 'GET', responseType: 'arraybuffer', maxContentLength: MAX_BYTES });
  const buf = Buffer.from(img.data);
  if (!buf.length || buf.length > MAX_BYTES) throw new PublicAiError('bad output size');
  return buf;
}

export const BRIA_HOST = 'https://briaai-bria-rmbg-1-4.hf.space';
export const FLUX_HOST = 'https://black-forest-labs-flux-1-schnell.hf.space';

// Returns PNG buffer with transparent background.
export async function removeBackground(jpeg, opts = {}) {
  const r = await gradioRun(BRIA_HOST, 1, [{ upload: jpeg, name: 'photo.jpg', type: 'image/jpeg' }], opts);
  const out = r.output?.data || [];
  const f = out.find((x) => x && (x.url || x.path));
  if (!f) throw new PublicAiError('no output');
  return r.fetch(f);
}

export async function pollinationsImage(prompt, opts = {}) {
  try { return await pollinationsOnce(prompt, opts); }
  catch (e) {
    const st = e?.response?.status;
    if (st === 402 || st === 429 || st >= 500) { await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 15000)); return pollinationsOnce(prompt, opts); }
    throw e;
  }
}

async function pollinationsOnce(prompt, { timeoutMs = 45000, request = axios.request, size = 768 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await request({ url: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt), method: 'GET',
      params: { width: size, height: size, nologo: 'true', seed: Math.floor(Math.random() * 1e6) },
      responseType: 'arraybuffer', signal: ctrl.signal, timeout: timeoutMs, maxContentLength: MAX_BYTES, maxRedirects: 3, proxy: false });
    const buf = Buffer.from(r.data);
    if (buf.length < 2000 || !/image\//.test(String(r.headers?.['content-type'] || ''))) throw new PublicAiError('bad image response');
    return buf;
  } finally { clearTimeout(timer); }
}

export async function fluxImage(prompt, opts = {}) {
  const r = await gradioRun(FLUX_HOST, 2, [prompt, 0, true, 768, 768, 4], opts);
  const f = (r.output?.data || []).find((x) => x && (x.url || x.path));
  if (!f) throw new PublicAiError('no output');
  return r.fetch(f);
}

export const WHISPER_HOST = 'https://openai-whisper.hf.space';
export const OPUS_HOST = 'https://helsinki-nlp-opus-translate.hf.space';
export const OCR_HOST = 'https://merterbak-deepseek-ocr-demo.hf.space';

// wav: Buffer (16 kHz mono wav). Returns transcript text.
export async function transcribeAudio(wav, opts = {}) {
  const r = await gradioRun(WHISPER_HOST, 2, [{ upload: wav, name: 'audio.wav', type: 'audio/wav' }, 'transcribe'], opts);
  const t = r.output?.data?.[0];
  if (typeof t !== 'string') throw new PublicAiError('no transcript');
  return t.trim();
}

export async function translateText(text, from, to, opts = {}) {
  const r = await gradioRun(OPUS_HOST, 2, [text, from || 'Auto Detect', to], { ...opts, prefix: '' });
  const t = r.output?.data?.[0];
  if (typeof t !== 'string' || !t.trim()) throw new PublicAiError('no translation');
  return t.trim();
}

export async function ocrImage(jpeg, opts = {}) {
  const r = await gradioRun(OCR_HOST, 6, [{ upload: jpeg, name: 'photo.jpg', type: 'image/jpeg' }, null, '\u{1F4DD} Free OCR', '', 1], opts);
  const t = r.output?.data?.[0];
  if (typeof t !== 'string') throw new PublicAiError('no text');
  return t.trim();
}

export const BLIP_HOST = 'https://tonyassi-blip-image-captioning-large.hf.space';
export const FLORENCE_HOST = 'https://prithivmlmods-florence-2-image-caption.hf.space';
export const ANIME_HOST = 'https://akhaliq-animeganv2.hf.space';
export const DEPTH_HOST = 'https://depth-anything-depth-anything-v2.hf.space';
export const CODEFORMER_HOST = 'https://sczhou-codeformer.hf.space';
const up = (jpeg) => ({ upload: jpeg, name: 'photo.jpg', type: 'image/jpeg' });
const fileOf = (x) => (x && (x.url || x.path) ? x : Array.isArray(x) ? x.map(fileOf).find(Boolean) : null);

export async function captionImage(jpeg, opts = {}) {
  const r = await gradioRun(BLIP_HOST, 2, [up(jpeg), 5, 20], opts);
  const t = r.output?.data?.[0];
  if (typeof t !== 'string' || !t.trim()) throw new PublicAiError('no caption');
  return t.split('\n')[0].trim().replace(/^(araffe|arafed|araffes)\s+/i, '');
}
export async function describeImage(jpeg, opts = {}) {
  const r = await gradioRun(FLORENCE_HOST, 1, [up(jpeg), 'Florence-2-base'], opts);
  const t = r.output?.data?.[0];
  if (typeof t !== 'string' || !t.trim()) throw new PublicAiError('no description');
  return t.trim();
}
async function imageOut(r, idx = 0) {
  const f = fileOf(r.output?.data?.[idx]);
  if (!f) throw new PublicAiError('no output');
  return r.fetch(f);
}
export async function animeImage(jpeg, opts = {}) { return imageOut(await gradioRun(ANIME_HOST, 2, [up(jpeg), 'Version 2'], opts)); }
export async function depthImage(jpeg, opts = {}) { return imageOut(await gradioRun(DEPTH_HOST, 0, [up(jpeg)], opts), 1); }
export async function restoreFace(jpeg, opts = {}) { return imageOut(await gradioRun(CODEFORMER_HOST, 0, [up(jpeg), true, true, true, 2, 0.5], opts)); }
