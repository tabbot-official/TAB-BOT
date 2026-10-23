export const SIGNS = {
  aries: ['mesh', 'mesha'], taurus: ['vrishabh', 'vrishabha', 'vrish'], gemini: ['mithun', 'mithuna'],
  cancer: ['kark', 'karka'], leo: ['singh', 'simha'], virgo: ['kanya'], libra: ['tula', 'tulaa'],
  scorpio: ['vrishchik', 'vrischik', 'vrishchika'], sagittarius: ['dhanu', 'dhanus'],
  capricorn: ['makar', 'makara'], aquarius: ['kumbh', 'kumbha'], pisces: ['meen', 'meena'],
};
export const EMOJI = { aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓' };
export function resolveSign(input) {
  const s = String(input || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return null;
  for (const [en, alts] of Object.entries(SIGNS)) if (s === en || alts.includes(s)) return en;
  return null;
}
const cache = new Map();
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
export async function getHoroscope(sign, { fetchImpl = fetch } = {}) {
  const key = sign + ':' + today();
  if (cache.has(key)) return cache.get(key);
  const r = await fetchImpl(`https://ohmanda.com/api/horoscope/${sign}/`, { headers: { 'user-agent': 'JarvisBot/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const text = String(j?.horoscope || '').trim();
  if (!text) throw new Error('empty');
  if (cache.size > 100) cache.clear();
  cache.set(key, text);
  return text;
}
export const format = (sign, text) => `${EMOJI[sign]} *${sign[0].toUpperCase() + sign.slice(1)}* - today's horoscope\n\n${text}\n\n_For fun and entertainment only._`;
export const clearCache = () => cache.clear();
