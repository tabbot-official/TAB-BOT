import test from 'node:test';
import assert from 'node:assert/strict';
import { askAi, isPlaceholderKey, configuredProviders, chainStatus, resetCooling, isCooling, PROVIDERS } from '../src/ai/providers.js';

// Item 1 (Oct 24): one shared line-up Groq -> Gemini -> OpenRouter (free) -> Pollinations, mocked providers only.
const KEYS = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'COHERE_API_KEY', 'HF_TOKEN', 'HUGGINGFACE_API_KEY', 'MISTRAL_API_KEY', 'CEREBRAS_API_KEY', 'SAMBANOVA_API_KEY', 'GITHUB_MODELS_TOKEN', 'NVIDIA_API_KEY', 'CF_API_TOKEN', 'AI_ORDER', 'GROQ_MODEL', 'GEMINI_MODEL', 'OPENROUTER_MODEL', 'KEYLESS_AI'];
function withEnv(env, fn) {
  return async () => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, env);
    const realFetch = globalThis.fetch;
    resetCooling();
    try { await fn(); } finally {
      globalThis.fetch = realFetch; resetCooling();
      for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  };
}
const host = (u) => { const s = String(u); if (s.includes('groq')) return 'groq'; if (s.includes('generativelanguage')) return 'gemini'; if (s.includes('openrouter')) return 'openrouter'; if (s.includes('pollinations')) return 'pollinations'; return 'other'; };
const okOpenAi = (text) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
const okGemini = (text) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }), { status: 200 });
const fail = (status, headers = {}) => new Response(JSON.stringify({ error: { message: 'nope ' + status } }), { status, headers });
const REAL = { GROQ_API_KEY: 'gsk_live1234567890abcdef', GEMINI_API_KEY: 'AIzaSyLive1234567890abcdef', OPENROUTER_API_KEY: 'sk-or-v1-live1234567890abcdef' };

test('placeholder keys are treated as missing', () => {
  for (const v of ['', ' ', 'your-groq-key', 'your_api_key_here', 'change-me', 'CHANGE_ME', 'xxxxxxxxxx', 'gsk_xxxxxxxxxxxx', '<key>', 'sk-...', 'none', 'placeholder', 'paste-key-here', 'abc']) assert.equal(isPlaceholderKey(v), true, v);
  for (const v of ['gsk_A1b2C3d4E5f6G7h8I9j0', 'AIzaSyB1c2D3e4F5g6H7i8J9', 'sk-or-v1-0123456789abcdef0123', 'test-key']) assert.equal(isPlaceholderKey(v), false, v);
});

test('line-up order: Groq, Gemini, OpenRouter, Pollinations last; placeholders skipped', withEnv({ GROQ_API_KEY: REAL.GROQ_API_KEY, GEMINI_API_KEY: 'your-gemini-key', OPENROUTER_API_KEY: REAL.OPENROUTER_API_KEY }, async () => {
  const ids = configuredProviders({ allowKeyless: true }).map((p) => p.id);
  assert.deepEqual(ids, ['groq', 'openrouter', 'pollinations']);
  const st = chainStatus();
  assert.deepEqual(st.slice(0, 3).map((x) => [x.id, x.ready]), [['groq', true], ['gemini', false], ['openrouter', true]]);
  assert.equal(st.at(-1).id, 'pollinations');
  assert.ok(!JSON.stringify(st).includes('gsk_live'), 'chain status never carries a key');
}));

test('with all three keys, Groq answers first', withEnv(REAL, async () => {
  const seen = [];
  globalThis.fetch = async (u) => { seen.push(host(u)); return okOpenAi('from groq'); };
  const r = await askAi('hi');
  assert.equal(r.id, 'groq'); assert.equal(r.text, 'from groq'); assert.deepEqual(seen, ['groq']);
}));

test('429 on Groq falls straight through to Gemini, and Groq cools down', withEnv(REAL, async () => {
  const seen = [];
  globalThis.fetch = async (u) => { const h = host(u); seen.push(h); if (h === 'groq') return fail(429, { 'retry-after': '7' }); return okGemini('from gemini'); };
  const r = await askAi('hi');
  assert.equal(r.id, 'gemini');
  assert.deepEqual(seen, ['groq', 'gemini'], 'one Groq call only, no second Groq model on a 429');
  assert.equal(isCooling('groq'), true);
  seen.length = 0;
  await askAi('again');
  assert.deepEqual(seen, ['gemini'], 'a cooling provider is skipped on the next question');
}));

test('5xx on Groq and Gemini falls through to OpenRouter free models', withEnv(REAL, async () => {
  const seen = []; let orModel = '';
  globalThis.fetch = async (u, init) => { const h = host(u); seen.push(h); if (h === 'openrouter') { orModel = JSON.parse(init.body).model; assert.equal(init.headers['X-Title'], 'TAB BOT'); return okOpenAi('from openrouter'); } return fail(h === 'groq' ? 503 : 500); };
  const r = await askAi('hi');
  assert.equal(r.id, 'openrouter'); assert.deepEqual(seen, ['groq', 'gemini', 'openrouter']);
  assert.match(orModel, /free/);
}));

test('a timeout (network error) falls through; Pollinations is the last stop', withEnv(REAL, async () => {
  const seen = [];
  globalThis.fetch = async (u) => { const h = host(u); seen.push(h); if (h === 'pollinations') return okOpenAi('from pollinations'); const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
  const r = await askAi('hi', { allowKeyless: true });
  assert.equal(r.id, 'pollinations'); assert.deepEqual(seen, ['groq', 'gemini', 'openrouter', 'pollinations']);
}));

test('no keys at all: only Pollinations is asked (works today, picks up a key the moment it appears)', withEnv({}, async () => {
  const seen = [];
  globalThis.fetch = async (u) => { seen.push(host(u)); return okOpenAi('keyless'); };
  let r = await askAi('hi', { allowKeyless: true });
  assert.equal(r.id, 'pollinations'); assert.deepEqual(seen, ['pollinations']);
  process.env.GROQ_API_KEY = REAL.GROQ_API_KEY; seen.length = 0;
  r = await askAi('hi', { allowKeyless: true });
  assert.equal(r.id, 'groq'); assert.deepEqual(seen, ['groq']);
}));

test('AI_ORDER reorders keyed providers but keeps Pollinations last', withEnv({ ...REAL, AI_ORDER: 'openrouter,gemini' }, async () => {
  assert.deepEqual(configuredProviders({ allowKeyless: true }).map((p) => p.id), ['openrouter', 'gemini', 'groq', 'pollinations']);
}));

test('401 bad key moves on to the next provider too', withEnv(REAL, async () => {
  const seen = [];
  globalThis.fetch = async (u) => { const h = host(u); seen.push(h); return h === 'groq' ? fail(401) : okGemini('g'); };
  const r = await askAi('hi');
  assert.equal(r.id, 'gemini'); assert.deepEqual(seen, ['groq', 'gemini']);
}));

test('404 model_not_found tries the next model of the same provider, then the next provider', withEnv(REAL, async () => {
  const seen = [];
  globalThis.fetch = async (u, init) => { const h = host(u); const model = h === 'gemini' ? String(u).split('/models/')[1]?.split(':')[0] : JSON.parse(init.body).model; seen.push(h + ':' + model); if (h === 'groq' && model === 'openai/gpt-oss-120b') return fail(404); if (h === 'groq') return okOpenAi('second groq model'); return okGemini('g'); };
  const r = await askAi('hi');
  assert.equal(r.id, 'groq'); assert.equal(r.model, 'qwen/qwen3.8-27b');
  assert.deepEqual(seen, ['groq:openai/gpt-oss-120b', 'groq:qwen/qwen3.8-27b']);
  // every Groq model gone -> Gemini answers; the dead model is remembered and skipped next time
  seen.length = 0;
  globalThis.fetch = async (u, init) => { const h = host(u); seen.push(h); return h === 'groq' ? fail(404) : okGemini('from gemini'); };
  const r2 = await askAi('hi');
  assert.equal(r2.id, 'gemini');
  assert.deepEqual(seen.filter((x) => x === 'groq').length, 2, 'gpt-oss-120b was skipped as already dead; 20b and qwen tried');
}));

test('default Groq models contain no dead llama ids', () => {
  assert.ok(!/llama-3\.(3-70b-versatile|1-8b-instant)/.test(String(PROVIDERS.find((p) => p.id === 'groq').models())));
});
