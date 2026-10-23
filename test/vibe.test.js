import test from 'node:test';
import assert from 'node:assert/strict';
import {vibe, render, groupMood} from '../src/vibe/index.js';
test('vibe is stable per person per day and in range', () => {
  const a = vibe('9199', '2026-10-05'); assert.deepEqual(a, vibe('9199', '2026-10-05')); assert.notDeepEqual(a, vibe('9199', '2026-10-06'));
  for (const k of ['energy', 'chill', 'chaos', 'luck']) assert.ok(a[k] >= 10 && a[k] <= 100);
  assert.match(render('Rohan', a), /Vibe check: Rohan/);
});
test('group mood buckets', () => {
  assert.match(groupMood(2, 50).label, /Sleepy/); assert.match(groupMood(100, 50).label, /fire/); assert.match(groupMood(50, 50).label, /Chill/);
});
