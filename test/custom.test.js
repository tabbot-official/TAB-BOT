import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'cust-'));
const C = await import('../src/custom/index.js');
test('custom commands add, lookup, limits', () => {
  C._reset();
  assert.equal(C.add('g', 'rules', 'Be kind {user}'), null);
  assert.equal(C.lookup('g', 'RULES', 'Ravi'), 'Be kind Ravi');
  assert.equal(C.lookup('h', 'rules'), null);
  assert.ok(C.add('g', 'ping', 'x', (n) => n === 'ping')); // built-in name refused
  assert.ok(C.add('g', 'bad name', 'x')); assert.ok(C.add('g', 'ok', ''));
  assert.deepEqual(C.list('g'), ['rules']); assert.equal(C.remove('g', 'rules'), true); assert.equal(C.lookup('g', 'rules'), null);
});
