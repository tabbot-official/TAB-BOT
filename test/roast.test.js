import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSongs, hasLink, buildPrompt, cleanRoast, MAX_SONGS} from '../src/roast/index.js';
test('parseSongs handles lines, commas, numbering, links, dupes', () => {
  assert.deepEqual(parseSongs('1. Kesariya\n2) Despacito\n- Baby Shark\n* Tum Hi Ho'), ['Kesariya', 'Despacito', 'Baby Shark', 'Tum Hi Ho']);
  assert.deepEqual(parseSongs('Kesariya, Despacito, kesariya, Believer'), ['Kesariya', 'Despacito', 'Believer']);
  assert.deepEqual(parseSongs('https://open.spotify.com/playlist/abc'), []);
  assert.equal(parseSongs(Array.from({length: 80}, (_, i) => 'song ' + i).join('\n')).length, MAX_SONGS);
  assert.deepEqual(parseSongs('Shape of You - Ed Sheeran, Perfect'), ['Shape of You - Ed Sheeran', 'Perfect']);
});
test('prompt is family-friendly and clean output is bounded', () => {
  assert.ok(hasLink('see https://x.y/z')); assert.ok(!hasLink('no link'));
  const p = buildPrompt(['A', 'B', 'C'], 'mild'); assert.match(p, /family-friendly/); assert.match(p, /gentle/); assert.match(p, /3\. C/);
  assert.equal(cleanRoast('x'), null); assert.ok(cleanRoast('y'.repeat(5000)).length <= 1200);
});
