import { getJson } from './limiter.js';
export async function wikiSummary(topic, { fetchImpl = fetch } = {}) {
  const q = String(topic || '').trim().slice(0, 100);
  if (!q) return null;
  const sum = (t) => getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')) + '?redirect=true', 12000, fetchImpl);
  let j = null;
  try { j = await sum(q); } catch (e) { if (!/404/.test(e.message)) throw e; }
  if (!j || j.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
    const s = await getJson('https://en.wikipedia.org/w/rest.php/v1/search/title?limit=1&q=' + encodeURIComponent(q), 12000, fetchImpl);
    const t = s.pages?.[0]?.title; if (!t) return null;
    j = await sum(t);
  }
  if (!j?.extract) return null;
  return { title: j.title, extract: j.extract, url: j.content_urls?.desktop?.page || '', disambiguation: j.type === 'disambiguation' };
}
export function formatWiki(r) {
  let t = r.extract; if (t.length > 1200) t = t.slice(0, 1200).replace(/\s+\S*$/, '') + '…';
  return `📖 *${r.title}*\n\n${t}${r.disambiguation ? '\n\n_This title has many meanings. Try a more specific search._' : ''}\n\n${r.url}`;
}
