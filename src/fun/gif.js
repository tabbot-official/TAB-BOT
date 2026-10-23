export async function searchGif(query, { key = process.env.GIPHY_API_KEY, fetchImpl = fetch } = {}) {
  if (!key) return { error: 'NO_KEY' };
  const u = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 80))}&limit=12&rating=pg&lang=en`;
  const r = await fetchImpl(u, { signal: AbortSignal.timeout(12000) });
  if (r.status === 401 || r.status === 403) return { error: 'BAD_KEY' };
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const items = (j.data || []).map((d) => d.images?.original_mp4?.mp4 || d.images?.downsized_small?.mp4).filter(Boolean);
  if (!items.length) return { error: 'NONE' };
  return { url: items[Math.floor(Math.random() * items.length)] };
}
