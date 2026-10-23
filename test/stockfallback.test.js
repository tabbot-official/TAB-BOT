import test from 'node:test';
import assert from 'node:assert/strict';
import { findStock, stooqQuote, formatStock } from '../src/fun/stock.js';

const csv = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-10-02,22:00:00,220,225,219,224.5,1000\n';
const f = (yahoo) => async (url) => {
  if (url.includes('stooq')) return { ok: true, text: async () => csv };
  if (yahoo === 'block') return { ok: false, status: 429 };
  return { ok: true, json: async () => ({ quotes: [] }) };
};
test('stooq parses a US ticker', async () => {
  const r = await stooqQuote('aapl', { fetchImpl: f('x') });
  assert.equal(r.symbol, 'AAPL.US'); assert.equal(r.price, 224.5);
  assert.match(formatStock(r), /224\.5/);
});
test('stooq returns null for non-ticker text and N/D rows', async () => {
  assert.equal(await stooqQuote('tata motors', { fetchImpl: f('x') }), null);
  const nd = async () => ({ ok: true, text: async () => 'Symbol,Date,Time,Open,High,Low,Close,Volume\nXXX.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n' });
  assert.equal(await stooqQuote('xxx', { fetchImpl: nd }), null);
});
test('Yahoo blocked -> falls back to stooq', async () => {
  const r = await findStock('aapl', { fetchImpl: f('block') });
  assert.equal(r.price, 224.5);
});
test('Yahoo blocked and not a ticker -> still throws so the command can say lookup failed', async () => {
  await assert.rejects(findStock('tata motors', { fetchImpl: f('block') }));
});
