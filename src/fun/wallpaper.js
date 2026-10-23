import { getJson } from './limiter.js';
const MAX_BYTES = 5 * 1024 * 1024;
/** SFW only (purity=100). Returns a random 1080p+ wallpaper under 5 MB, or null. */
export async function findWallpaper(query, { fetchImpl = fetch } = {}) {
  const q = String(query || '').trim().slice(0, 60);
  const url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(q)}&purity=100&categories=110&sorting=random&atleast=1920x1080&ratios=landscape,portrait`;
  const j = await getJson(url, 12000, fetchImpl);
  const ok = (j.data || []).filter((d) => d.purity === 'sfw' && d.path && Number(d.file_size) <= MAX_BYTES);
  if (!ok.length) return null;
  const d = ok[Math.floor(Math.random() * ok.length)];
  return { url: d.path, page: d.url, resolution: d.resolution };
}
