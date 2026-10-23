// Group expense ledger: amounts are integer paise/cents so splits never drift.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
const file = () => path.join(config.paths.data, 'expenses.json');
let db = null;
const load = () => { if (db) return db; db = {}; try { db = JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch { /* new */ } return db; };
const save = () => { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(db)); fs.renameSync(file() + '.tmp', file()); } catch { /* ignore */ } };
export const _reset = () => { db = null; };
const ledger = (gid) => { const d = load(); return (d[gid] ||= { next: 1, expenses: [], payments: [], names: {} }); };

export function parseAmount(s) {
  const m = /^(?:₹|rs\.?|inr|\$)?\s*(\d{1,9}(?:[.,]\d{1,2})?)$/i.exec(String(s || '').trim().replace(/,(?=\d{3}\b)/g, ''));
  if (!m) return null;
  const v = Math.round(parseFloat(m[1].replace(',', '.')) * 100);
  return v > 0 && v <= 100000000 ? v : null;
}
export const fmt = (c) => `₹${(c / 100).toFixed(2).replace(/\.00$/, '')}`;

export function addExpense(gid, { payer, amount, desc, split, name }) {
  const L = ledger(gid);
  const people = [...new Set([payer, ...split])];
  if (people.length < 2) return { error: 'Need at least one other person to split with.' };
  if (L.expenses.length >= 500) return { error: 'This group has too many expenses. Run /expense clear after settling.' };
  const e = { id: L.next++, payer, amount, desc: String(desc || 'expense').slice(0, 60), split: people, ts: Date.now() };
  L.expenses.push(e);
  if (name) L.names[payer] = String(name).slice(0, 30);
  save();
  return { expense: e, share: Math.floor(amount / people.length) };
}
export function addPayment(gid, { from, to, amount }) {
  const L = ledger(gid);
  if (from === to) return { error: 'Cannot pay yourself.' };
  if (L.payments.length >= 500) return { error: 'Too many payments recorded; settle and /expense clear.' };
  L.payments.push({ from, to, amount, ts: Date.now() }); save(); return { ok: true };
}
export function removeExpense(gid, id, by, isAdmin) {
  const L = ledger(gid); const i = L.expenses.findIndex((e) => e.id === id);
  if (i < 0) return { error: 'No expense #' + id };
  if (L.expenses[i].payer !== by && !isAdmin) return { error: 'Only the person who added it (or an admin) can delete it.' };
  L.expenses.splice(i, 1); save(); return { ok: true };
}
export const clear = (gid) => { delete load()[gid]; save(); };
export const list = (gid) => ledger(gid);

/** Net balance per person in cents: positive = is owed money, negative = owes. */
export function balances(gid) {
  const L = ledger(gid); const b = {};
  const add = (k, v) => { b[k] = (b[k] || 0) + v; };
  for (const e of L.expenses) {
    const n = e.split.length; const base = Math.floor(e.amount / n); let rem = e.amount - base * n;
    add(e.payer, e.amount);
    for (const p of e.split) { const extra = rem > 0 && p !== e.payer ? 1 : 0; if (extra) rem--; add(p, -(base + extra)); }
    if (rem > 0) add(e.payer, -rem); // leftover paise stay with the payer
  }
  for (const p of L.payments) { add(p.from, p.amount); add(p.to, -p.amount); }
  return b;
}
/** Fewest transfers (greedy): [{from,to,amount}]. */
export function settleUp(gid) {
  const b = balances(gid);
  const debt = Object.entries(b).filter(([, v]) => v < 0).map(([k, v]) => [k, -v]).sort((x, y) => y[1] - x[1]);
  const cred = Object.entries(b).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  const out = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const t = Math.min(debt[i][1], cred[j][1]);
    if (t > 0) out.push({ from: debt[i][0], to: cred[j][0], amount: t });
    debt[i][1] -= t; cred[j][1] -= t;
    if (debt[i][1] === 0) i++; if (cred[j][1] === 0) j++;
  }
  return out;
}
