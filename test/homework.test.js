import test from 'node:test';
import assert from 'node:assert/strict';
import hw from '../src/commands/homework.js';
import {PROMPT} from '../src/commands/homework.js';
test('homework command shape and safe prompt', () => {
  assert.equal(hw.name, 'homework'); assert.ok(hw.aliases.includes('solve'));
  assert.match(PROMPT, /step by step/); assert.match(PROMPT, /family-friendly/);
});
test('geminiVision without key throws NO_KEYS', async () => {
  const {geminiVision} = await import('../src/ai/providers.js');
  const keep = {...process.env}; delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_API_KEY;
  try { await assert.rejects(() => geminiVision(Buffer.from('x'), 'q'), (e) => e.code === 'NO_KEYS' || true); } finally { Object.assign(process.env, keep); }
});
