const TOPICS = { india: 'IN', world: 'WORLD', business: 'BUSINESS', technology: 'TECHNOLOGY', tech: 'TECHNOLOGY', sports: 'SPORTS', entertainment: 'ENTERTAINMENT', science: 'SCIENCE', health: 'HEALTH' };
export const topicList = () => ['india', 'world', 'business', 'tech', 'sports', 'entertainment', 'science', 'health'];
export function feedUrl(arg) {
  const a = String(arg || '').trim().toLowerCase();
  const base = 'hl=en-IN&gl=IN&ceid=IN:en';
  if (!a || a === 'india') return `https://news.google.com/rss?${base}`;
  if (TOPICS[a]) return `https://news.google.com/rss/headlines/section/topic/${TOPICS[a] === 'IN' ? 'NATION' : TOPICS[a]}?${base}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(a.slice(0, 80))}&${base}`;
}
const unesc = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
export function parseRss(xml, max = 8) {
  const out = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = /<title>([\s\S]*?)<\/title>/.exec(m[1]); if (!t) continue;
    let title = unesc(t[1]); const s = /<source[^>]*>([\s\S]*?)<\/source>/.exec(m[1]); const source = s ? unesc(s[1]) : '';
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    out.push({ title, source });
    if (out.length >= max) break;
  }
  return out;
}
let cache = new Map();
export async function getNews(arg, { fetchImpl = fetch, now = Date.now() } = {}) {
  const url = feedUrl(arg); const c = cache.get(url);
  if (c && now - c.t < 5 * 60000) return c.items;
  const r = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 JarvisBot' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const items = parseRss(await r.text());
  if (cache.size > 40) cache = new Map();
  cache.set(url, { t: now, items });
  return items;
}
export const formatNews = (label, items) => `📰 *${label} - top headlines*\n\n` + items.map((x, i) => `${i + 1}. ${x.title}${x.source ? ` _(${x.source})_` : ''}`).join('\n\n');
