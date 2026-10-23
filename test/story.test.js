import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'story-'));
const S = await import('../src/story/index.js');
test('story chain rules', () => {
  S._reset();
  assert.ok(S.add('g', 'a', 'hello there').err);
  assert.ok(S.start('g', 'a', 'Once upon a time in Delhi').ok);
  assert.ok(S.add('g', 'a', 'then it rained').err); // same person twice
  assert.ok(S.add('g', 'b', 'visit http://x.com').err); // links refused
  assert.ok(S.add('g', 'b', 'a cat appeared').ok);
  assert.equal(S.text('g'), 'Once upon a time in Delhi a cat appeared');
  assert.equal(S.end('g').length > 10, true); assert.equal(S.get('g'), null);
});
