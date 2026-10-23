export async function getApod({ key = process.env.NASA_API_KEY || 'DEMO_KEY', fetchImpl = fetch } = {}) {
  const r = await fetchImpl('https://api.nasa.gov/planetary/apod?api_key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(15000) });
  if (r.status === 429) return { error: 'LIMIT' };
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return { title: j.title, date: j.date, text: String(j.explanation || '').trim(), type: j.media_type, url: j.url, hd: j.hdurl, credit: j.copyright ? String(j.copyright).replace(/\s+/g, ' ').trim() : '' };
}
export function formatApod(a) {
  let t = a.text; if (t.length > 700) t = t.slice(0, 700).replace(/\s+\S*$/, '') + '…';
  return `🌌 *${a.title}* (${a.date})\n\n${t}${a.credit ? `\n\n© ${a.credit}` : ''}\n_NASA Astronomy Picture of the Day_`;
}
