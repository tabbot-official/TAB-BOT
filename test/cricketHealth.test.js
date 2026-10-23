import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMatches, health, _resetCache } from '../src/cricket/cricbuzz.js';
const page = (n) => '"matchesList":{"matches":[' + Array.from({ length: n }, () => '{"match":{"matchInfo":{"team1":{"teamName":"A"},"team2":{"teamName":"B"},"state":"Complete"}}}').join(',') + ']}';
const ok = (html) => async () => ({ ok: true, text: async () => html });
test('good page marks healthy', async () => {
  _resetCache();
  const m = await fetchMatches({ fetchImpl: ok(page(1)), now: 1e9 });
  assert.equal(m.length, 1); assert.equal(health.parseBroken, false);
});
test('layout change flags parseBroken and serves stale cache, then throws once stale', async () => {
  _resetCache();
  await fetchMatches({ fetchImpl: ok(page(1)), now: 1e9 });
  const big = '<html>' + 'x'.repeat(30000) + '</html>';
  const m = await fetchMatches({ fetchImpl: ok(big), now: 1e9 + 120000 });
  assert.equal(m.length, 1); assert.equal(health.parseBroken, true);
  await assert.rejects(fetchMatches({ fetchImpl: ok(big), now: 1e9 + 40 * 60000 }));
});
test('HTTP error with no cache throws', async () => {
  _resetCache();
  await assert.rejects(fetchMatches({ fetchImpl: async () => ({ ok: false, status: 500 }), now: 2e9 }));
});
