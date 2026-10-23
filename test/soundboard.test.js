import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {names, render, SOUNDS} from '../src/soundboard/index.js';
import cmd from '../src/commands/sound.js';
test('sound list and unknown name', async () => {
  const sent = []; const ctx = {args: ['nope'], sender: 'u', reply: async (t) => sent.push(t)};
  await cmd.run(ctx); assert.match(sent[0], /No sound called/);
  const c2 = {args: [], sender: 'u', reply: async (t) => sent.push(t)}; await cmd.run(c2); assert.match(sent[1], /airhorn/);
  assert.equal(names().length, Object.keys(SOUNDS).length);
});
test('sounds render to ogg when ffmpeg exists', async (t) => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) return t.skip('no ffmpeg');
  for (const n of names()) { const b = await render(n); assert.equal(b.subarray(0, 4).toString(), 'OggS', n); }
});
