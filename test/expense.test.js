import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-'));
const L = await import('../src/expense/ledger.js');
test('parseAmount', () => {
  assert.equal(L.parseAmount('1200'), 120000); assert.equal(L.parseAmount('₹99.5'), 9950); assert.equal(L.parseAmount('1,200'), 120000);
  assert.equal(L.parseAmount('abc'), null); assert.equal(L.parseAmount('0'), null); assert.equal(L.parseAmount('-5'), null);
});
test('equal split, balances and minimal settlement', () => {
  L._reset(); L.clear('g');
  L.addExpense('g', { payer: 'A', amount: 30000, desc: 'dinner', split: ['B', 'C'] });
  let b = L.balances('g'); assert.deepEqual([b.A, b.B, b.C], [20000, -10000, -10000]);
  L.addExpense('g', { payer: 'B', amount: 6000, desc: 'cab', split: ['A'] });
  b = L.balances('g'); assert.equal(Object.values(b).reduce((x, y) => x + y, 0), 0);
  const t = L.settleUp('g'); assert.ok(t.length <= 2);
  L.addPayment('g', { from: 'C', to: 'A', amount: 10000 });
  assert.equal(L.balances('g').C, 0);
});
test('uneven cents never create money', () => {
  L._reset(); L.clear('g2');
  L.addExpense('g2', { payer: 'A', amount: 10001, desc: 'x', split: ['B', 'C'] });
  const b = L.balances('g2'); assert.equal(Object.values(b).reduce((x, y) => x + y, 0), 0);
});
test('validation and permissions', () => {
  L._reset(); L.clear('g3');
  assert.ok(L.addExpense('g3', { payer: 'A', amount: 100, desc: 'x', split: [] }).error);
  const e = L.addExpense('g3', { payer: 'A', amount: 100, desc: 'x', split: ['B'] }).expense;
  assert.ok(L.removeExpense('g3', e.id, 'B', false).error); assert.ok(L.removeExpense('g3', e.id, 'A', false).ok);
  assert.ok(L.addPayment('g3', { from: 'A', to: 'A', amount: 5 }).error);
});
