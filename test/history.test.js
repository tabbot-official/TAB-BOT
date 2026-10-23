import test from 'node:test';
import assert from 'node:assert/strict';
import { record, recent, clear, format, ago } from '../src/utils/history.js';
test('records names newest first, per user, capped', () => {
  for (let i = 0; i < 20; i++) record('u1', 'c' + i, 1000 + i);
  record('u2', 'other', 5);
  const r = recent('u1');
  assert.equal(r.length, 15); assert.equal(r[0].name, 'c19'); assert.equal(recent('u2').length, 1);
});
test('clear and empty text', () => {
  record('u3', 'ping'); clear('u3');
  assert.match(format(recent('u3')), /No command history/);
});
test('format shows names only and relative time', () => {
  const t = format([{ name: 'play', at: 0 }], '/', 3 * 3600000);
  assert.match(t, /\/play - 3 h ago/); assert.match(t, /names only/);
  assert.equal(ago(30000), 'just now');
});
test('ignores empty input', () => { record('', 'x'); record('u', ''); assert.equal(recent('').length, 0); });
