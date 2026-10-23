/**
 * Public receive-SMS numbers with a provider chain (no keys). Providers scrape public pages, so they can
 * break when a site changes; the chain falls through to the next one. Messages on these numbers are PUBLIC.
 * Provider: {name, countries, pickNumber(country, fetch), messages(number, fetch)}.
 */
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; JarvisBot/1.0)', accept: 'text/html' };
async function page(url, f = fetch) {
  const r = await f(url, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await r.text();
  if (t.length < 500) throw new Error('empty page');
  return t;
}
export const toTokens = (html) => String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, '|').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').split('|').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const AGO = /^(\d+\s+\w+\s+ago|a\s+\w+\s+ago|just now)$/i;
const ago = (t) => AGO.test(t);
/** Rough age in minutes of "5 minutes ago" strings; Infinity if unknown. */
export function ageMinutes(s) {
  const m = /^(\d+|a|an)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(String(s).trim());
  if (!m) return /just now/i.test(s) ? 0 : Infinity;
  const n = /^an?$/i.test(m[1]) ? 1 : +m[1];
  return n * { second: 1 / 60, minute: 1, hour: 60, day: 1440, week: 10080, month: 43200, year: 525600 }[m[2].toLowerCase()];
}
/** Hide email addresses and long digit strings that other people's public SMS may contain. */
export const scrub = (t) => String(t).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]').replace(/\.{3}/g, '…').slice(0, 300);

const COUNTRY_PATHS = { us: '/us-phone-numbers/us/', ca: '/canadian-phone-numbers/ca/', au: '/australian-phone-numbers/au/', de: '/german-phone-numbers/de/', fr: '/french-phone-numbers/fr/', nl: '/dutch-phone-numbers/nl/', es: '/spanish-phone-numbers/es/', se: '/swedish-phone-numbers/se/', pl: '/polish-phone-numbers/pl/', nz: '/new-zealand-phone-numbers/nz/' };
export function parseReceivesmsMessages(html) {
  const t = toTokens(html); const out = [];
  let lastActivity = ''; const la = t.find((x) => /^Last activity:/i.test(x)); if (la) lastActivity = la.replace(/^Last activity:\s*/i, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== 'From') continue;
    const sender = t[i + 1] || ''; let j = i + 2; const bits = [];
    while (j < t.length && t[j] !== 'From' && !ago(t[j]) && bits.length < 4) { bits.push(t[j]); j++; }
    if (!ago(t[j] || '')) continue;
    const when = t[j]; j++;
    const body = []; while (j < t.length && t[j] !== 'From' && body.length < 3) { if (/^(Load new|Free|All active|Terms|Privacy)/i.test(t[j])) break; body.push(t[j]); j++; }
    out.push({ from: sender, when, text: scrub(body.join(' ') || bits.join(' ')) });
  }
  return { lastActivity, messages: out.slice(0, 15) };
}
const receivesms = {
  name: 'receivesms.co', countries: Object.keys(COUNTRY_PATHS),
  async pickNumber(country, f) {
    const list = await page('https://www.receivesms.co' + COUNTRY_PATHS[country], f);
    const ids = [...new Set([...list.matchAll(/href="(\/[a-z-]+-phone-number\/\d+\/)"/g)].map((m) => m[1]))].slice(0, 6);
    if (!ids.length) throw new Error('no numbers');
    const checked = (await Promise.allSettled(ids.map(async (p) => {
      const h = await page('https://www.receivesms.co' + p, f); const t = toTokens(h);
      const num = t.find((x) => /^\+\d[\d\s-]{7,}$/.test(x)); const r = parseReceivesmsMessages(h);
      return { number: num.replace(/[\s-]/g, ''), age: ageMinutes(r.lastActivity), path: p };
    }))).filter((x) => x.status === 'fulfilled' && x.value.number).map((x) => x.value).sort((a, b) => a.age - b.age);
    if (!checked.length) throw new Error('no usable number');
    return { provider: 'receivesms.co', number: checked[0].number, ref: checked[0].path };
  },
  async messages(s, f) { return parseReceivesmsMessages(await page('https://www.receivesms.co' + s.ref, f)); },
};
export function parseAnonymMessages(html) {
  const t = toTokens(html); const start = t.findIndex((x) => x === 'Date'); const out = [];
  if (start < 0) return { lastActivity: '', messages: [] };
  let cur = [];
  for (let i = start + 1; i < t.length && out.length < 15; i++) {
    if (/^From:$/i.test(t[i])) break;
    if (ago(t[i])) { if (cur.length) out.push({ from: cur[0], when: t[i], text: scrub(cur.slice(1).join(' ')) }); cur = []; } else cur.push(t[i]);
  }
  return { lastActivity: out[0]?.when || '', messages: out };
}
const anonym = {
  name: 'anonymsms.com', countries: ['any'],
  async pickNumber(country, f) {
    const h = await page('https://anonymsms.com/', f);
    const ids = [...new Set([...h.matchAll(/\/number\/(\d{8,15})\//g)].map((m) => m[1]))];
    if (!ids.length) throw new Error('no numbers');
    return { provider: 'anonymsms.com', number: '+' + ids[Math.floor(Math.random() * ids.length)], ref: '' };
  },
  async messages(s, f) { return parseAnonymMessages(await page(`https://anonymsms.com/number/${s.number.replace('+', '')}/`, f)); },
};
export const PROVIDERS = [receivesms, anonym];
const down = new Map();
export async function getNumber(country = 'us', { fetchImpl = fetch, providers = PROVIDERS, now = Date.now() } = {}) {
  const errors = [];
  const usable = providers.filter((p) => (p.countries.includes(country) || p.countries.includes('any')) && (down.get(p.name) || 0) <= now);
  for (const p of usable) {
    try { return await p.pickNumber(country, fetchImpl); } catch { down.set(p.name, now + 5 * 60000); errors.push(p.name); }
  }
  throw new Error(usable.length ? 'all providers failed' : 'unsupported country');
}
export const getMessages = (s, { fetchImpl = fetch, providers = PROVIDERS } = {}) => providers.find((p) => p.name === s.provider).messages(s, fetchImpl);
export const _reset = () => down.clear();
export const COUNTRIES = Object.keys(COUNTRY_PATHS);
