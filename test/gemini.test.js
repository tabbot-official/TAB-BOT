import test from 'node:test';
import assert from 'node:assert/strict';
import {geminiTranslate,genConfig} from '../src/ai/providers.js';
import {translateBest} from '../src/commands/translate.js';
import {splitLang} from '../src/books/command.js';

test('genConfig: 4096 tokens, thinking off for 2.5+/3.x only', () => {
  assert.equal(genConfig('gemini-3.8-flash', 0.2).maxOutputTokens, 4096);
  assert.equal(genConfig('gemini-3.8-flash', 0.2).thinkingConfig.thinkingBudget, 0);
  assert.equal(genConfig('gemini-2.0-flash', 0.2).thinkingConfig, undefined);
});
test('geminiTranslate sends config, returns text, rejects MAX_TOKENS and falls to next model', async () => {
  const real = globalThis.fetch; const calls = [];
  process.env.GEMINI_API_KEY = 'test-key'; delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const first = calls.length === 1;
    return new Response(JSON.stringify({ candidates: [{ finishReason: first ? 'MAX_TOKENS' : 'STOP', content: { parts: [{ text: 'ਸਤਿ ਨਾਮੁ' }] } }] }), { status: 200 });
  };
  try {
    const r = await geminiTranslate('Truth is the name', 'Punjabi');
    assert.equal(r.text, 'ਸਤਿ ਨਾਮੁ');
    assert.match(calls[0].url, /gemini-3\.8-flash/);
    assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingBudget, 0);
    assert.equal(calls.length, 2);
    assert.match(calls[0].body.systemInstruction.parts[0].text, /Punjabi/);
  } finally { globalThis.fetch = real; delete process.env.GEMINI_API_KEY; }
});
test('translateBest: gemini first, helsinki fallback, none for Punjabi', async () => {
  const bad = async () => { throw new Error('x'); };
  assert.equal((await translateBest('hi', 'Hindi', { gemini: async () => ({ text: 'G' }), fallback: bad })).engine, 'gemini');
  assert.deepEqual(await translateBest('hi', 'Hindi', { gemini: bad, fallback: async () => 'H' }), { text: 'H', engine: 'helsinki' });
  await assert.rejects(translateBest('hi', 'Punjabi', { gemini: bad, fallback: async () => 'H' }));
});
test('splitLang strips trailing language', () => {
  assert.deepEqual(splitLang(['2', '47', 'punjabi']), { args: ['2', '47'], lang: 'Punjabi' });
  assert.deepEqual(splitLang(['2', '47', 'in', 'hi']), { args: ['2', '47'], lang: 'Hindi' });
  assert.deepEqual(splitLang(['2', '47']), { args: ['2', '47'], lang: null });
});
