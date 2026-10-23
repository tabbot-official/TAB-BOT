// Spotify metadata without an account (oEmbed/embed page + public page meta), and YouTube matching the spotdl way.
// Spotify audio is DRM-protected, so the audio itself comes from the closest YouTube / YouTube Music match.
const UA_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_PAGE = 1_500_000; // never hold more than ~1.5 MB of a page in memory
const ID = '[A-Za-z0-9]{22}';

/** Parses a Spotify link or URI. Returns { type: 'track'|'album'|'playlist', id } or null. */
export function parseSpotifyLink(input) {
  const s = String(input || '').trim();
  let m = s.match(new RegExp(`^spotify:(track|album|playlist):(${ID})$`));
  if (m) return { type: m[1], id: m[2] };
  m = s.match(new RegExp(`^https?://(?:open|play)\\.spotify\\.com/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?/)?(?:embed/)?(track|album|playlist)/(${ID})`, 'i'));
  if (m) return { type: m[1].toLowerCase(), id: m[2] };
  return null;
}
export const isShortSpotifyLink = (s) => /^https?:\/\/(spotify\.link|spotify\.app\.link)\/[\w-]+/i.test(String(s || '').trim());
export const looksLikeSpotify = (s) => /^(https?:\/\/[\w.-]*spotify\.(com|link|app\.link)\/|spotify:)/i.test(String(s || '').trim());

async function getText(url, { ua = UA_WEB, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  if (!res.body?.getReader) return { text: (await res.text()).slice(0, MAX_PAGE), url: res.url || url };
  const reader = res.body.getReader(); const dec = new TextDecoder(); let text = '';
  while (text.length < MAX_PAGE) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); }
  reader.cancel().catch(() => {});
  return { text, url: res.url || url };
}

/** spotify.link short links: follow the redirect and find the open.spotify.com link. */
export async function resolveShortLink(url, opts = {}) {
  const { text, url: finalUrl } = await getText(url, { ...opts, ua: UA_WEB });
  const direct = parseSpotifyLink(finalUrl);
  if (direct) return direct;
  const m = text.match(new RegExp(`https://open\\.spotify\\.com/(track|album|playlist)/(${ID})`));
  return m ? { type: m[1], id: m[2] } : null;
}

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\u00a0/g, ' ');
export function pageMeta(html) {
  const out = {};
  for (const m of String(html).matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)) {
    const k = m[1]; if (k.includes('restrictions')) continue;
    if (k === 'music:musician') (out[k] ||= []).push(decode(m[2])); else if (!(k in out)) out[k] = decode(m[2]);
  }
  return out;
}
export function embedEntity(html) {
  const m = String(html).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity || null; } catch { return null; }
}
const bestImage = (list = []) => [...list].sort((a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0))[0]?.url || null;
const splitArtists = (s) => decode(s).split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);

/** Track metadata from the public page meta (title, artists, album, cover, duration); embed page as fallback. */
export async function getTrack(id, opts = {}) {
  const t = { id, url: `https://open.spotify.com/track/${id}`, title: null, artists: [], album: null, cover: null, duration: 0, year: null };
  try {
    const { text } = await getText(t.url, { ...opts, ua: UA_BOT });
    const m = pageMeta(text);
    if (m['og:title']) {
      t.title = m['og:title'];
      const parts = String(m['og:description'] || '').split(' · ');
      t.artists = m['music:musician_description'] ? splitArtists(m['music:musician_description']) : splitArtists(parts[0] || '');
      if (parts.length >= 4) t.album = parts.slice(1, parts.length - 2).join(' · ') || null;
      t.cover = m['og:image'] || null;
      t.duration = Number(m['music:duration']) || 0;
      t.year = (m['music:release_date'] || '').slice(0, 4) || (parts.at(-1) || '').match(/^\d{4}$/)?.[0] || null;
    }
  } catch { /* fall back to the embed page */ }
  if (!t.title || !t.duration || !t.artists.length) {
    try {
      const { text } = await getText(`https://open.spotify.com/embed/track/${id}`, opts);
      const e = embedEntity(text);
      if (e) {
        t.title ||= decode(e.title || e.name);
        if (!t.artists.length) t.artists = (e.artists || []).map((a) => decode(a.name)).filter(Boolean);
        if (!t.duration) t.duration = Math.round((e.duration || 0) / 1000);
        t.cover ||= bestImage(e.visualIdentity?.image || e.coverArt?.sources);
        t.year ||= String(e.releaseDate?.isoString || '').slice(0, 4) || null;
      }
    } catch { /* oEmbed as the last resort */ }
  }
  if (!t.title) {
    try {
      const { text } = await getText(`https://open.spotify.com/oembed?url=${encodeURIComponent(t.url)}`, opts);
      const o = JSON.parse(text); t.title = o.title || null; t.cover ||= o.thumbnail_url || null;
    } catch { /* nothing */ }
  }
  if (!t.title) { const e = new Error('Spotify track not found'); e.code = 'NOT_FOUND'; throw e; }
  return t;
}

/** Album/playlist: name and up to `limit` tracks from the embed page (no account needed). */
export async function getCollection(type, id, { limit = 10, ...opts } = {}) {
  const { text } = await getText(`https://open.spotify.com/embed/${type}/${id}`, opts);
  const e = embedEntity(text);
  if (!e) { const err = new Error('Spotify list not found'); err.code = 'NOT_FOUND'; throw err; }
  const all = Array.isArray(e.trackList) ? e.trackList : [];
  const tracks = all.filter((x) => /^spotify:track:/.test(x.uri || '')).slice(0, limit).map((x) => ({
    id: x.uri.split(':')[2], title: decode(x.title), artists: splitArtists(x.subtitle || ''), duration: Math.round((x.duration || 0) / 1000),
  }));
  return { type, id, name: decode(e.name || e.title || ''), owner: decode(e.subtitle || ''), total: all.length, tracks };
}

/** Optional: Spotify Web API search, only when SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set. */
let token = null;
export async function apiSearch(query, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const idv = env.SPOTIFY_CLIENT_ID, secret = env.SPOTIFY_CLIENT_SECRET;
  if (!idv || !secret) return null;
  if (!token || token.exp < Date.now()) {
    const r = await fetchImpl('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(idv + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json(); token = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60000 };
  }
  const r = await fetchImpl(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`, { headers: { Authorization: 'Bearer ' + token.v }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const it = (await r.json())?.tracks?.items?.[0];
  if (!it) return null;
  return { id: it.id, url: it.external_urls?.spotify || `https://open.spotify.com/track/${it.id}`, title: it.name, artists: (it.artists || []).map((a) => a.name), album: it.album?.name || null, cover: bestImage((it.album?.images || []).map((i) => ({ url: i.url, width: i.width }))), duration: Math.round((it.duration_ms || 0) / 1000), year: String(it.album?.release_date || '').slice(0, 4) || null };
}
export function _resetToken() { token = null; }

/* ------------------------------ matching ------------------------------ */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const BAD = /\b(live|cover|karaoke|instrumental|remix|slowed|reverb|8d|lofi|lo fi|sped up|nightcore|reaction|teaser|status|mashup|jukebox|whatsapp|ringtone|bass boosted)\b/i;

/** Scores one YouTube candidate {id,title,channel,duration} against a Spotify track. Higher is better. */
export function scoreCandidate(c, track) {
  let s = 0;
  const title = norm(c.title); const want = norm(track.title);
  const words = want.split(' ').filter((w) => w.length > 1);
  const hit = words.length ? words.filter((w) => title.includes(w)).length / words.length : 0;
  s += hit * 40;
  const artists = (track.artists || []).map(norm).filter(Boolean);
  const chan = norm(c.channel).replace(/\s*topic$/, '');
  if (artists.some((a) => chan === a || chan.includes(a))) s += 20;
  else if (artists.some((a) => title.includes(a))) s += 10;
  if (/ - topic$/i.test(String(c.channel || ''))) s += 10;
  const badHere = BAD.test(c.title) && !BAD.test(track.title);
  if (badHere) s -= 30;
  if (track.duration && c.duration) {
    const d = Math.abs(c.duration - track.duration);
    s += d <= 3 ? 40 : d <= 10 ? 30 : d <= 20 ? 15 : d <= 45 ? 0 : -40;
  } else if (!c.duration) s -= 10;
  return s;
}
export function pickBest(cands, track) {
  const ranked = cands.filter((c) => c && /^[\w-]{11}$/.test(c.id)).map((c) => ({ ...c, score: scoreCandidate(c, track) })).sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}
/** Parses yt-dlp "--print %(id)s\t%(duration)s\t%(channel)s\t%(title)s" lines. */
export function parseCandidates(stdout) {
  return String(stdout || '').split('\n').map((l) => l.split('\t')).filter((p) => p.length >= 4 && /^[\w-]{11}$/.test(p[0]))
    .map(([id, dur, channel, ...t]) => ({ id, duration: Number(dur) || 0, channel: channel === 'NA' ? '' : channel, title: t.join('\t') }));
}
export const fmtDuration = (sec) => { sec = Math.round(Number(sec) || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
