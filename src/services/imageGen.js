import axios from 'axios';
import {gradioRun, PublicAiError} from './publicAi.js';

// Free, key-less text-to-image providers, best quality first. Every one is free to use without a paid plan.
// Hugging Face Spaces use shared free GPU quota (HF_TOKEN, a free account token, is optional and raises it).
const MAX_BYTES = 12 * 1048576;
const rnd = () => Math.floor(Math.random() * 1e6);

async function gradioImage(host, args, opts) {
  const r = await gradioRun(host, 2, args, {timeoutMs: opts.timeoutMs});
  const f = (r.output?.data || []).find((x) => x && (x.url || x.path));
  if (!f) throw new PublicAiError('no output');
  return r.fetch(f);
}

async function pollinations(prompt, {timeoutMs, request = axios.request}) {
  const r = await request({url: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt), method: 'GET',
    params: {model: 'flux', width: 1024, height: 1024, nologo: 'true', seed: rnd()},
    responseType: 'arraybuffer', timeout: timeoutMs, maxContentLength: MAX_BYTES, maxRedirects: 3, proxy: false});
  const buf = Buffer.from(r.data);
  if (buf.length < 2000 || !/image\//.test(String(r.headers?.['content-type'] || ''))) throw new PublicAiError('bad image response');
  return buf;
}

// AI Horde: community GPUs, anonymous key. Slow when busy, so it is the last resort.
async function horde(prompt, {timeoutMs, request = axios.request}) {
  const headers = {apikey: '0000000000', 'Client-Agent': 'jarvis-bot:1:none'};
  const t0 = Date.now();
  const sub = await request({url: 'https://stablehorde.net/api/v2/generate/async', method: 'POST', headers, timeout: 20000, proxy: false,
    data: {prompt, params: {width: 512, height: 512, steps: 20, n: 1}, nsfw: false, censor_nsfw: true, models: ['Deliberate']}});
  const id = sub.data?.id;
  if (!id) throw new PublicAiError('horde: no job');
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await request({url: 'https://stablehorde.net/api/v2/generate/status/' + id, method: 'GET', headers, timeout: 15000, proxy: false});
    if (st.data?.faulted) throw new PublicAiError('horde: faulted');
    const g = st.data?.generations?.[0];
    if (st.data?.done && g?.img && !g.censored) {
      const u = new URL(g.img);
      if (u.protocol !== 'https:') throw new PublicAiError('horde: bad url');
      const img = await request({url: u.href, method: 'GET', responseType: 'arraybuffer', timeout: 30000, maxContentLength: MAX_BYTES, proxy: false});
      const buf = Buffer.from(img.data);
      if (buf.length < 2000) throw new PublicAiError('horde: bad image');
      return buf;
    }
    if (st.data?.done) throw new PublicAiError('horde: filtered');
  }
  throw new PublicAiError('horde: timeout');
}

export const PROVIDERS = [
  {id: 'dev', label: 'FLUX.1-dev (Hugging Face)', timeoutMs: 50000,
    run: (p, o) => gradioImage('https://black-forest-labs-flux-1-dev.hf.space', [p, 0, true, 1024, 1024, 3.5, 28], o)},
  {id: 'sd3', label: 'Stable Diffusion 3.5 Large Turbo (Hugging Face)', timeoutMs: 40000,
    run: (p, o) => gradioImage('https://stabilityai-stable-diffusion-3-5-large-turbo.hf.space', [p, '', 0, true, 1024, 1024, 0, 4], o)},
  {id: 'schnell', label: 'FLUX.1-schnell (Hugging Face)', timeoutMs: 40000,
    run: (p, o) => gradioImage('https://black-forest-labs-flux-1-schnell.hf.space', [p, 0, true, 1024, 1024, 4], o)},
  {id: 'pollinations', label: 'Pollinations (FLUX)', timeoutMs: 45000, run: pollinations},
  {id: 'horde', label: 'AI Horde (community GPUs)', timeoutMs: 100000, run: horde},
];

export const ALIASES = {dev: 'dev', flux: 'dev', sd3: 'sd3', sd: 'sd3', schnell: 'schnell', fast: 'schnell', pollinations: 'pollinations', horde: 'horde'};

/** "dev: a red car" picks a model first, then the others are still used as fallback. */
export function parsePrompt(text) {
  const m = String(text).match(/^\s*([a-z0-9]+)\s*:\s*(.+)$/is);
  if (m && ALIASES[m[1].toLowerCase()]) return {prefer: ALIASES[m[1].toLowerCase()], prompt: m[2].trim()};
  return {prefer: null, prompt: String(text).trim()};
}

/** Tries each provider in order. Returns {buf, source, failed:[ids]}. Throws PublicAiError listing what failed. */
export async function generateImage(prompt, {prefer = null, providers = PROVIDERS, log = () => {}, budgetMs = 120000} = {}) {
  const order = prefer ? [...providers.filter((p) => p.id === prefer), ...providers.filter((p) => p.id !== prefer)] : providers;
  const failed = [];
  const t0 = Date.now();
  for (const p of order) {
    const left = budgetMs - (Date.now() - t0);
    if (left < 8000) { failed.push(p.id); continue; }
    try {
      const buf = await p.run(prompt, {timeoutMs: Math.min(p.timeoutMs, left)});
      if (!buf || buf.length < 2000) throw new PublicAiError('empty image');
      return {buf, source: p.label, failed};
    } catch (e) {
      failed.push(p.id);
      log(`imagine ${p.id} failed: ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  const err = new PublicAiError('all image services failed: ' + failed.join(', '));
  err.failed = failed;
  throw err;
}
