import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize, render} from '../src/groups/wrapped.js';
test('wrapped summary ranks users and finds peaks', () => {
  const hours = Array(24).fill(0); hours[21] = 9;
  const s = summarize({days: {'2026-10-01': {a: 5, b: 2}, '2026-10-02': {a: 1, c: 10}}, hours});
  assert.equal(s.total, 18); assert.equal(s.people, 3);
  assert.equal(s.top[0].user, 'c'); assert.equal(s.busyDay, '2026-10-02'); assert.equal(s.busyHour, 21);
  const r = render(s, 'Fam', 30); assert.match(r.text, /Peak hour: 9 PM/); assert.equal(r.mentions.length, 3);
  assert.match(render(summarize({days: {}, hours: Array(24).fill(0)}), 'x', 30).text, /Not enough/);
});
