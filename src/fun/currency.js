import { getJson } from './limiter.js';
export const CRYPTO = { btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', bnb: 'binancecoin', sol: 'solana', xrp: 'ripple', doge: 'dogecoin', ada: 'cardano', ltc: 'litecoin', matic: 'matic-network', dot: 'polkadot', trx: 'tron', shib: 'shiba-inu', ton: 'the-open-network' };
const ALIASES = { rs: 'INR', rupee: 'INR', rupees: 'INR', inr: 'INR', dollar: 'USD', dollars: 'USD', euro: 'EUR', euros: 'EUR', pound: 'GBP', pounds: 'GBP', yen: 'JPY', dirham: 'AED' };
export function parseConvert(args) {
  const t = (args || []).join(' ').toLowerCase().replace(/,/g, '').replace(/\bto\b|\bin\b|=>|->/g, ' ').trim().split(/\s+/).filter(Boolean);
  let amount = 1;
  const m = /^(\d*\.?\d+)([a-z]*)$/.exec(t[0] || '');
  if (m) { amount = parseFloat(m[1]); t.shift(); if (m[2]) t.unshift(m[2]); }
  else if (!t.length) return null;
  if (t.length < 2 || !(amount > 0) || amount > 1e12) return null;
  const norm = (c) => ALIASES[c] || c.toUpperCase();
  const from = norm(t[0]), to = norm(t[1]);
  if (!/^[A-Z]{2,10}$/.test(from) || !/^[A-Z]{2,10}$/.test(to)) return null;
  return { amount, from, to };
}
let fiat = null;
async function fiatRates(fetchImpl, now) {
  if (fiat && now - fiat.t < 3600e3) return fiat.rates;
  const j = await getJson('https://open.er-api.com/v6/latest/USD', 12000, fetchImpl);
  if (j.result !== 'success') throw new Error('bad');
  fiat = { t: now, rates: j.rates };
  return j.rates;
}
async function usdPerCrypto(sym, fetchImpl) {
  const id = CRYPTO[sym.toLowerCase()];
  const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, 12000, fetchImpl);
  const p = j?.[id]?.usd; if (!p) throw new Error('price');
  return p;
}
/** USD value of one unit of code, or null if unknown. */
async function usdOf(code, fetchImpl, now) {
  if (CRYPTO[code.toLowerCase()]) return usdPerCrypto(code, fetchImpl);
  const r = (await fiatRates(fetchImpl, now))[code];
  return r ? 1 / r : null;
}
export async function convert({ amount, from, to }, { fetchImpl = fetch, now = Date.now() } = {}) {
  const a = await usdOf(from, fetchImpl, now), b = await usdOf(to, fetchImpl, now);
  if (a == null || b == null) return null;
  return { amount, from, to, result: (amount * a) / b };
}
export function fmt(n) {
  const abs = Math.abs(n);
  const d = abs >= 100 ? 2 : abs >= 1 ? 4 : 8;
  return Number(n.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d });
}
export const formatConvert = (r) => `💱 ${fmt(r.amount)} *${r.from}* = *${fmt(r.result)} ${r.to}*\n_Rates are indicative and may lag a few minutes to an hour._`;
export const _reset = () => { fiat = null; };
