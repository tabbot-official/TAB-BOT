import { getJson } from './limiter.js';
const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', accept: 'application/json,text/plain,*/*' };
async function yj(url, f) { const r = await f(url, { headers: H, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
// Fallback when Yahoo blocks or errors: stooq.com daily CSV (no key). Covers US tickers, e.g. AAPL -> aapl.us.
export async function stooqQuote(query, { fetchImpl = fetch } = {}) {
  const t = String(query || '').trim().toLowerCase();
  if (!/^[a-z.\-]{1,10}$/.test(t)) return null;
  const sym = t.includes('.') ? t : t + '.us';
  const r = await fetchImpl('https://stooq.com/q/l/?s=' + encodeURIComponent(sym) + '&f=sd2t2ohlcv&h&e=csv', { headers: H, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = (await r.text()).trim().split(/\r?\n/);
  const c = (rows[1] || '').split(',');
  const close = Number(c[6]);
  if (c.length < 8 || !(close > 0)) return null;
  return { symbol: c[0].toUpperCase(), name: c[0].toUpperCase(), cur: sym.endsWith('.us') ? 'USD' : '', price: close, prev: null, hi: Number(c[4]) || null, lo: Number(c[5]) || null, wkHi: null, wkLo: null, exch: 'via stooq.com' };
}
export async function findStock(query, opts = {}) {
  try {
    const r = await findStockYahoo(query, opts);
    if (r) return r;
  } catch (e) {
    try { const f = await stooqQuote(query, opts); if (f) return f; } catch { /* fall through */ }
    throw e;
  }
  try { return await stooqQuote(query, opts); } catch { return null; }
}
async function findStockYahoo(query, { fetchImpl = fetch } = {}) {
  const q = String(query || '').trim().slice(0, 40);
  if (!q) return null;
  const s = await yj('https://query1.finance.yahoo.com/v1/finance/search?newsCount=0&quotesCount=6&q=' + encodeURIComponent(q), fetchImpl);
  const eq = (s.quotes || []).filter((x) => x.quoteType === 'EQUITY' || x.quoteType === 'ETF' || x.quoteType === 'INDEX');
  const pick = eq.find((x) => /^(NSI|BSE)$/.test(x.exchange)) || eq[0];
  if (!pick) return null;
  const c = await yj('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(pick.symbol) + '?range=1d&interval=1d', fetchImpl);
  const m = c.chart?.result?.[0]?.meta; if (!m?.regularMarketPrice) return null;
  return { symbol: m.symbol, name: m.longName || m.shortName || pick.shortname || m.symbol, cur: m.currency, price: m.regularMarketPrice, prev: m.chartPreviousClose ?? m.previousClose, hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow, wkHi: m.fiftyTwoWeekHigh, wkLo: m.fiftyTwoWeekLow, exch: m.fullExchangeName || m.exchangeName };
}
const n = (x) => (x == null ? '-' : Number(x).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export function formatStock(s) {
  const ch = s.prev ? s.price - s.prev : null, pct = s.prev ? (ch / s.prev) * 100 : null;
  const arrow = ch == null ? '' : ch >= 0 ? '🟢 ▲' : '🔴 ▼';
  return `📈 *${s.name}* (${s.symbol})\n${s.cur} *${n(s.price)}* ${arrow} ${ch == null ? '' : `${n(Math.abs(ch))} (${Math.abs(pct).toFixed(2)}%)`}\nDay: ${n(s.lo)} - ${n(s.hi)}\n52 wk: ${n(s.wkLo)} - ${n(s.wkHi)}\n${s.exch || ''}\n_Delayed data, not investment advice._`;
}
export async function goldPrices({ fetchImpl = fetch } = {}) {
  const [au, ag, fx] = await Promise.all([getJson('https://api.gold-api.com/price/XAU', 12000, fetchImpl), getJson('https://api.gold-api.com/price/XAG', 12000, fetchImpl), getJson('https://open.er-api.com/v6/latest/USD', 12000, fetchImpl)]);
  const inr = fx.rates?.INR; if (!au.price || !ag.price || !inr) throw new Error('bad data');
  const OZ = 31.1035;
  return { goldOz: au.price, silverOz: ag.price, inr, gold10g: (au.price / OZ) * 10 * inr, silverKg: (ag.price / OZ) * 1000 * inr };
}
export const formatGold = (g) => `🪙 *Gold & Silver (international spot)*\nGold: $${n(g.goldOz)}/oz ≈ ₹${n(g.gold10g)} per 10 g\nSilver: $${n(g.silverOz)}/oz ≈ ₹${n(g.silverKg)} per kg\n_Spot price converted at ₹${n(g.inr)}/$. Indian shop prices differ (import duty, GST, making charges)._`;
