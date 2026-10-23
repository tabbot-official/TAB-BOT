// Song lyrics from free no-key sources: LRCLIB search first, then Deezer suggest -> lyrics.ovh.
const UA = { 'user-agent': 'JarvisBot/1.0 (WhatsApp bot)' };
async function getJson(url, fetchImpl, ms = 12000) {
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

export async function findLyrics(query, { fetchImpl = fetch } = {}) {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return null;
  try {
    const list = await getJson('https://lrclib.net/api/search?q=' + encodeURIComponent(q), fetchImpl);
    const hit = (Array.isArray(list) ? list : []).find((x) => x.plainLyrics && !x.instrumental);
    if (hit) return { title: hit.trackName, artist: hit.artistName, lyrics: clean(hit.plainLyrics), source: 'LRCLIB' };
  } catch { /* try next source */ }
  try {
    const s = await getJson('https://api.lyrics.ovh/suggest/' + encodeURIComponent(q), fetchImpl);
    for (const t of (s?.data || []).slice(0, 1)) { // top relevance only: never guess a different song
      try {
        const j = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(t.artist.name)}/${encodeURIComponent(t.title_short || t.title)}`, fetchImpl, 15000);
        if (j?.lyrics) return { title: t.title_short || t.title, artist: t.artist.name, lyrics: clean(j.lyrics), source: 'lyrics.ovh' };
      } catch { /* next candidate */ }
    }
  } catch { /* none */ }
  return null;
}

export function formatLyrics(r, max = 3800) {
  let body = r.lyrics;
  let cut = false;
  if (body.length > max) { body = body.slice(0, max).replace(/\n[^\n]*$/, ''); cut = true; }
  return `🎵 *${r.title}* - ${r.artist}\n\n${body}${cut ? '\n\n…(shortened)' : ''}\n\n_Lyrics source: ${r.source}. Lyrics belong to their owners._`;
}
