import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
const C = await import('../src/confess/index.js');
test('screen refuses links, numbers and blockwords', () => {
  assert.ok(C.screen('visit https://x.com'));
  assert.ok(C.screen('call 9876543210 now'));
  assert.ok(C.screen('you are a Badword!', ['badword']));
  assert.equal(C.screen('i like pizza', ['badword']), null);
});
test('numbering, ban by confession number, off switch', () => {
  assert.equal(C.record('g', 'u1'), 1); assert.equal(C.record('g', 'u2'), 2);
  assert.ok(C.banByNumber('g', 2)); assert.ok(C.isBanned('g', 'u2')); assert.ok(!C.isBanned('g', 'u1'));
  assert.equal(C.banByNumber('g', 99), false);
  C.setOff('g', true); assert.ok(C.isOff('g'));
  assert.equal(C.unbanAll('g'), 1);
});
