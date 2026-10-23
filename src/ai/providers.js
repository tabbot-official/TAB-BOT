// AI provider registry. To add a provider, add one entry to PROVIDERS and set its key in .env.
// type "openai" works with any OpenAI-compatible chat API (Groq, OpenRouter, DeepSeek, Mistral, ...).
// Free tiers only. Providers without a key are skipped.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

export const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Gemini',
    type: 'gemini',
    keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    models: () => (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash']),
  },
  {
    id: 'groq',
    label: 'Groq',
    type: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: ['GROQ_API_KEY'],
    models: () => (process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']),
  },
  {
    id: 'openrouter',
    label: 'DeepSeek V3',
    type: 'openai',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    keyEnv: ['OPENROUTER_API_KEY'],
    models: () => (process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : ['deepseek/deepseek-chat-v3-0324:free']),
  },
  {
    id: 'commanda',
    label: 'Cohere Command A',
    type: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyEnv: ['COHERE_API_KEY'],
    models: () => ['command-a-03-2025'],
  },
  {
    id: 'commandrplus',
    label: 'Cohere Command R+',
    type: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyEnv: ['COHERE_API_KEY'],
    models: () => ['command-r-plus-08-2024'],
  },
  {
    id: 'commandr',
    label: 'Cohere Command R',
    type: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyEnv: ['COHERE_API_KEY'],
    models: () => ['command-r-08-2024'],
  },
  {
    id: 'aya',
    label: 'Cohere Aya Expanse 32B',
    type: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyEnv: ['COHERE_API_KEY'],
    models: () => ['c4ai-aya-expanse-32b'],
  },
  {
    id: 'commandr7b',
    label: 'Cohere Command R7B',
    type: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyEnv: ['COHERE_API_KEY'],
    models: () => ['command-r7b-12-2024'],
  },
  {
    id: 'huggingface',
    label: 'HuggingFace',
    type: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    keyEnv: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
    models: () => ['meta-llama/Llama-3.1-8B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    type: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: ['MISTRAL_API_KEY'],
    models: () => (process.env.MISTRAL_MODEL ? [process.env.MISTRAL_MODEL] : ['mistral-small-latest', 'open-mistral-nemo']),
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    type: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: ['CEREBRAS_API_KEY'],
    models: () => (process.env.CEREBRAS_MODEL ? [process.env.CEREBRAS_MODEL] : ['llama-3.3-70b', 'llama3.1-8b']),
  },
  {
    id: 'sambanova',
    label: 'SambaNova',
    type: 'openai',
    baseUrl: 'https://api.sambanova.ai/v1',
    keyEnv: ['SAMBANOVA_API_KEY'],
    models: () => (process.env.SAMBANOVA_MODEL ? [process.env.SAMBANOVA_MODEL] : ['Meta-Llama-3.3-70B-Instruct', 'Meta-Llama-3.1-8B-Instruct']),
  },
  {
    id: 'githubmodels',
    label: 'GitHub Models',
    type: 'openai',
    baseUrl: 'https://models.github.ai/inference',
    keyEnv: ['GITHUB_MODELS_TOKEN'],
    models: () => (process.env.GITHUB_MODELS_MODEL ? [process.env.GITHUB_MODELS_MODEL] : ['openai/gpt-4o-mini', 'meta/Llama-3.3-70B-Instruct']),
  },
  {
    id: 'nvidianim',
    label: 'NVIDIA NIM',
    type: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyEnv: ['NVIDIA_API_KEY'],
    models: () => (process.env.NVIDIA_MODEL ? [process.env.NVIDIA_MODEL] : ['meta/llama-3.3-70b-instruct', 'meta/llama-3.1-8b-instruct']),
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    type: 'openai',
    baseUrl: process.env.CF_ACCOUNT_ID ? ('https://api.cloudflare.com/client/v4/accounts/' + process.env.CF_ACCOUNT_ID + '/ai/v1') : 'https://api.cloudflare.com/client/v4/accounts/UNSET/ai/v1',
    keyEnv: ['CF_API_TOKEN'],
    models: () => (process.env.CF_MODEL ? [process.env.CF_MODEL] : ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast']),
  },
  {
    id: 'pollinations',
    label: 'Pollinations (free, no key)',
    type: 'openai',
    keyless: true,
    baseUrl: 'https://text.pollinations.ai/openai',
    keyEnv: [],
    models: () => ['openai'],
  },
];

const SYSTEM = (name) =>
  `You are ${name}, a helpful assistant inside WhatsApp. Reply in the same language and style as the user (Hindi, Hinglish or English). ` +
  'Keep answers short and clear, under about 150 words unless the user asks for detail. Plain text only, light WhatsApp formatting (*bold*) is fine. No markdown headings or tables. ' +
  'Users often misspell names of artists, songs, anime and brands. When a word looks like a misspelling of a famous name (for example "tentation" or "tentacion" for the rapper XXXTENTACION), answer for the most likely intended name and start with a short note of how you read it. If it is truly ambiguous, give the most popular reading and say which one you picked.';

const HINGLISH = /\b(kya|hai|hain|nahi|nahin|kaise|kaisa|kyun|kyu|bhai|yaar|mujhe|mera|meri|tum|tumhe|aap|apna|batao|bata|karo|kar|kare|kaun|kab|kahan|kitna|kitne|accha|acha|theek|thik|bohot|bahut|zyada|abhi|aur|lekin|par|mat|chahiye|sakta|sakte|hota|hoga|wala|wali|ye|yeh|woh|isko|usko|ho|raha|rahi|samajh|dena|do|dikhao|likh|likho)\b/gi;
/** Picks the reply style from the user's latest message (script and Romanized Hindi detection). */
export function detectStyle(text) {
  const t = String(text || '');
  if (/[\u0900-\u097F]/.test(t)) return 'Hindi written in Devanagari script';
  const hits = (t.match(HINGLISH) || []).length;
  if (hits >= 2 || (hits >= 1 && t.split(/\s+/).length <= 4)) return 'Hinglish (Hindi written in Roman/English letters, mixed with English words, casual like a friend)';
  return 'English';
}
function systemFor(question) {
  const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
  return SYSTEM(config.botName) + ` The user's latest message is in ${detectStyle(question)}: reply in exactly that style. If the user clearly asks for another language, use it. Current date and time (IST, for your reference only, do not mention it unless asked): ${ist}. Use earlier turns of the conversation for follow-ups like "ye", "uska", "aur batao", "explain more". If you are not sure of a fact, say so instead of inventing it.`;
}

/** Reads a key from the environment, then from a sibling .env one folder up (shared server .env). */
function readParentEnv() {
  const out = {};
  for (const p of [path.join(config.root, '..', '.env')]) {
    try {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch { /* no parent .env */ }
  }
  return out;
}

function keyFor(p, parentEnv) {
  for (const k of p.keyEnv) {
    const v = (process.env[k] || '').trim();
    if (v) return v;
  }
  for (const k of p.keyEnv) {
    const v = (parentEnv[k] || '').trim();
    if (v) return v;
  }
  return '';
}

export function configuredProviders({ allowKeyless = false } = {}) {
  const parentEnv = readParentEnv();
  return PROVIDERS.map((p) => ({ ...p, key: keyFor(p, parentEnv) })).filter((p) => p.key || (allowKeyless && p.keyless && process.env.KEYLESS_AI !== 'off'));
}

async function httpJson(url, init, ms = 30000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 120);
    const err = new Error(`HTTP ${r.status}: ${String(msg).slice(0, 160)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

/** Gemini 2.5+/3.x: thinking off + 4096 output tokens (validated: full clean translations, finishReason STOP). */
export function genConfig(model, temperature) {
  const c = { maxOutputTokens: 4096, temperature };
  if (/gemini-(2\.5|3)/.test(model)) c.thinkingConfig = { thinkingBudget: 0 };
  return c;
}

/**
 * Faithful translation through Gemini. Throws on no key, truncation (MAX_TOKENS) or empty output
 * so callers can fall back. Returns { text, model }.
 */
export async function geminiTranslate(text, to, { from = '', note = '' } = {}) {
  const p = configuredProviders().find((x) => x.id === 'gemini');
  if (!p) { const e = new Error('no gemini key'); e.code = 'NO_KEYS'; throw e; }
  const sys = `You are a professional translator. Translate the user's text${from ? ' from ' + from : ''} into ${to}. ` +
    `Write ${to} in its native script only, with no romanized leftovers. Keep verse/line numbers and line breaks as given. ` +
    'Translate faithfully and completely; do not summarize, explain or add commentary.' + (note ? ' ' + note : '');
  let lastErr;
  for (const model of p.models()) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const j = await httpJson(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': p.key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: genConfig(model, 0.2) }),
      }, 60000);
      const cand = j?.candidates?.[0];
      const out = (cand?.content?.parts || []).map((x) => x.text || '').join('').trim();
      if (cand?.finishReason === 'MAX_TOKENS') throw new Error('translation truncated');
      if (!out) throw new Error('empty reply');
      return { text: out, model };
    } catch (err) {
      lastErr = err;
      logger.warn(`[ai] translate ${model} failed, status ${Number(err.status) || 0}`);
      if (err.status === 401 || err.status === 403) break;
    }
  }
  throw lastErr || new Error('translate failed');
}

async function callGemini(p, model, question, history = [], opts = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const j = await httpJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': p.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemFor(question) + (opts.systemSuffix ? ' ' + opts.systemSuffix : '') }] },
      contents: [...history.flatMap((x) => [{ role: 'user', parts: [{ text: x.q }] }, { role: 'model', parts: [{ text: x.a }] }]), { role: 'user', parts: [{ text: question }] }],
      generationConfig: genConfig(model, opts.temperature ?? 0.7),
    }),
  }, 25000);
  const text = (j?.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim();
  if (!text) throw new Error(`empty reply (${j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || 'no text'})`);
  return text;
}

async function callOpenAi(p, model, question, history = [], opts = {}) {
  const j = await httpJson(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemFor(question) + (opts.systemSuffix ? ' ' + opts.systemSuffix : '') }, ...history.flatMap((x) => [{ role: 'user', content: x.q }, { role: 'assistant', content: x.a }]), { role: 'user', content: question }],
      max_tokens: p.keyless ? 1500 : 1200,
      temperature: opts.temperature ?? 0.7,
      ...(/gpt-oss/.test(model) || p.keyless ? { reasoning_effort: 'low' } : {}),
    }),
  }, 25000);
  const text = (j?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('empty reply');
  return text;
}

/**
 * Tiny free classification call for internal decisions (never Gemini - preserves its daily quota).
 * Tries configured keyless/free providers. Returns the raw short reply, or null when all fail.
 */
export async function classifyFree(sysPrompt, question, { timeoutMs = 15000 } = {}) {
  const list = configuredProviders({ allowKeyless: true }).filter((p) => p.id !== 'gemini' && p.type === 'openai');
  for (const p of list) {
    for (const model of p.models().slice(0, 2)) {
      try {
        const j = await httpJson(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: question }], max_tokens: 5, temperature: 0 }),
        }, timeoutMs);
        const t = (j?.choices?.[0]?.message?.content || '').trim();
        if (t) return t;
      } catch (e) { logger.warn(`[ai] classify ${p.id}/${model} failed, status ${Number(e.status) || 0}`); break; }
    }
  }
  return null;
}

/**
 * Asks the providers in order (default first, then the rest). `prefer` is an optional provider id.
 * Returns { text, provider } or throws an Error with .code NO_KEYS / ALL_FAILED.
 */
const deadModels = new Map();
export async function askAi(question, { prefer, history = [], allowKeyless = false, onStatus, temperature, systemSuffix } = {}) {
  const list = configuredProviders({ allowKeyless });
  if (!list.length) {
    const e = new Error('no keys');
    e.code = 'NO_KEYS';
    throw e;
  }
  const ordered = prefer && list.some((p) => p.id === prefer) ? [list.find((p) => p.id === prefer), ...list.filter((p) => p.id !== prefer)] : list;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let announced = '';
  for (const p of ordered) {
    if (announced && onStatus) { try { onStatus(`${announced} is busy, trying ${p.label}...`); } catch { /* ui only */ } }
    announced = p.label;
    let badKey = false;
    for (const model of p.models()) {
      const dead = deadModels.get(`${p.id}/${model}`);
      if (dead && Date.now() - dead < 6 * 3600 * 1000) continue; // 404: model gone, skip for a while
      for (let attempt = 1; attempt <= (p.keyless ? 3 : 2); attempt++) {
        try {
          const text = p.type === 'gemini' ? await callGemini(p, model, question, history, { temperature, systemSuffix }) : await callOpenAi(p, model, question, history, { temperature, systemSuffix });
          logger.info(`[ai] ok ${p.id}/${model}`);
          return { text, provider: p.label, id: p.id, model };
        } catch (err) {
          const st = Number(err.status) || 0;
          logger.warn(`[ai] ${p.id}/${model} failed (try ${attempt}), status ${st}, ${String(err.message || '').replace(/[\r\n]+/g, ' ').slice(0, 90)}`);
          if (st === 404) { deadModels.set(`${p.id}/${model}`, Date.now()); break; }
          if (st === 401 || st === 403) { badKey = st === 401; break; }
          const transient = st === 0 || st === 429 || st >= 500 || (p.keyless && st === 402);
          if (!transient || attempt === (p.keyless ? 3 : 2)) break;
          await sleep(st === 429 ? 2500 : st === 402 ? 9000 : 900);
        }
      }
      if (badKey) break;
    }
  }
  const e = new Error('all failed');
  e.code = 'ALL_FAILED';
  throw e;
}

/**
 * Asks every configured provider in parallel (first working model each) and returns all answers:
 * [{ id, label, text }]. `exclude` skips provider ids (used to keep Gemini's daily quota in reserve).
 */
let orRotation = 0;
export async function askAll(question, { history = [], allowKeyless = true, temperature, systemSuffix, exclude = [], maxProviders = 5, orVoices = 2 } = {}) {
  const all = configuredProviders({ allowKeyless }).filter((p) => !exclude.includes(p.id));
  const orBacked = all.filter((p) => /openrouter\.ai/.test(p.baseUrl || ''));
  const direct = all.filter((p) => !/openrouter\.ai/.test(p.baseUrl || ''));
  // OpenRouter's free pool is small (about 50 req/day), so rotate a couple of OR voices per question instead of all.
  const start = orBacked.length ? orRotation++ % orBacked.length : 0;
  const chosenOr = orBacked.slice(start).concat(orBacked.slice(0, start)).slice(0, orVoices);
  const list = [...direct, ...chosenOr].slice(0, maxProviders);
  const one = async (p) => {
    for (const model of p.models().slice(0, 2)) {
      try {
        const text = p.type === 'gemini' ? await callGemini(p, model, question, history, { temperature, systemSuffix }) : await callOpenAi(p, model, question, history, { temperature, systemSuffix });
        logger.info(`[ai] ok ${p.id}/${model}`);
        return { id: p.id, label: p.label, text };
      } catch (err) {
        logger.warn(`[ai] ${p.id}/${model} failed, status ${Number(err.status) || 0}`);
      }
    }
    return null;
  };
  const settled = await Promise.allSettled(list.map(one));
  return settled.map((x) => (x.status === 'fulfilled' ? x.value : null)).filter(Boolean);
}

/**
 * Merges several AI answers into one final answer with a free provider (never Gemini).
 * Falls back to the first answer when no free synthesizer is available.
 */
export async function synthesizeAnswers(question, answers, { systemSuffix = '', temperature = 0.4 } = {}) {
  if (answers.length === 1) return { text: answers[0].text, provider: answers[0].label };
  const sys = systemFor(question) + ' You are merging answers from multiple AIs to the same question. Produce ONE final best answer: prefer facts that multiple answers agree on, drop claims that contradict the majority, never invent facts, keep it short and in the user style.' + (systemSuffix ? ' ' + systemSuffix : '');
  const user = `Question: ${question}\n\nAnswers from different AIs:\n${answers.map((a, i) => `[AI ${i + 1} - ${a.label}]: ${a.text}`).join('\n\n')}`;
  const list = configuredProviders({ allowKeyless: true }).filter((p) => p.id !== 'gemini' && p.type === 'openai');
  for (const p of list) {
    for (const model of p.models().slice(0, 2)) {
      try {
        const j = await httpJson(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 1500, temperature }),
        }, 30000);
        const text = (j?.choices?.[0]?.message?.content || '').trim();
        if (text) return { text, provider: answers.map((a) => a.label).join(' + ') };
      } catch (e) { logger.warn(`[ai] synthesize ${p.id}/${model} failed, status ${Number(e.status) || 0}`); break; }
    }
  }
  return { text: answers[0].text, provider: answers[0].label };
}


/** Photo + instruction through Cohere Aya Vision (OpenAI-compatible, same free trial key as chat).
 * Returns { text, model }. Throws when no Cohere key or all vision models fail. */
export async function cohereVision(jpeg, instruction, { timeoutMs = 60000 } = {}) {
  const p = configuredProviders().find((x) => x.id === 'commanda' || x.id === 'aya');
  if (!p) { const e = new Error('no cohere key'); e.code = 'NO_KEYS'; throw e; }
  const models = ['c4ai-aya-vision-32b', 'c4ai-aya-vision-8b'];
  let last;
  for (const model of models) {
    try {
      const j = await httpJson(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [
            { type: 'text', text: String(instruction || 'Describe this image.').slice(0, 2000) },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + Buffer.from(jpeg).toString('base64') } },
          ] }],
          max_tokens: 1200,
          temperature: 0.3,
        }),
      }, timeoutMs);
      const text = (j?.choices?.[0]?.message?.content || '').trim();
      if (text) return { text, model };
      last = new Error('empty reply');
    } catch (e) { last = e; logger.warn(`[ai] cohere vision ${model} failed, status ${Number(e.status) || 0}`); if (e.status === 401 || e.status === 403) break; }
  }
  throw last || new Error('vision failed');
}

/** Photo + instruction through Gemini vision. Tries the configured models in order. Returns { text, model }. */
export async function geminiVision(jpeg, instruction, { timeoutMs = 60000 } = {}) {
  const p = configuredProviders().find((x) => x.id === 'gemini');
  if (!p) { const e = new Error('no gemini key'); e.code = 'NO_KEYS'; throw e; }
  let last;
  for (const model of p.models()) {
    try {
      const j = await httpJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': p.key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }, { inlineData: { mimeType: 'image/jpeg', data: Buffer.from(jpeg).toString('base64') } }] }],
          generationConfig: genConfig(model, 0.3),
        }),
      }, timeoutMs);
      const cand = j?.candidates?.[0];
      const text = (cand?.content?.parts || []).map((x) => x.text || '').join('').trim();
      if (text && cand?.finishReason !== 'MAX_TOKENS') return { text, model };
      last = new Error('empty or truncated');
    } catch (e) { last = e; if (e.status === 429) e.quota = true; if (e.status === 401) break; }
  }
  throw last || new Error('failed');
}
