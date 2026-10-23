import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'santa-'));
const S = await import('../src/santa/index.js');
test('derange never gives anyone themselves', () => {
  for (let n = 3; n < 12; n++) for (let k = 0; k < 40; k++) { const l = Array.from({length: n}, (_, i) => 'u' + i); const d = S.derange(l); assert.ok(d.every((x, i) => x !== l[i])); assert.equal(new Set(d).size, n); }
  assert.equal(S.derange(['a', 'b']), null);
});
test('santa flow', () => {
  S._reset(); S.open('g', 'budget 200');
  assert.equal(S.join('g', 'a@s.whatsapp.net', 'A'), 'ok'); assert.equal(S.join('g', 'a@s.whatsapp.net', 'A'), 'already');
  S.join('g', 'b@s.whatsapp.net', 'B'); assert.equal(S.draw('g'), null);
  S.join('g', 'c@s.whatsapp.net', 'C'); const g = S.draw('g');
  assert.equal(Object.keys(g.pairs).length, 3); assert.equal(S.join('g', 'd@s.whatsapp.net', 'D'), 'closed');
  assert.ok(Object.entries(g.pairs).every(([a, b]) => a !== b));
});
