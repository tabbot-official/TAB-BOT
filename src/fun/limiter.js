/** Small per-user sliding-window limiter: makeRate(max, windowMs)(userId) -> true if allowed. */
export function makeRate(max, windowMs = 60000) {
  const hits = new Map();
  return (id, now = Date.now()) => {
    const a = (hits.get(id) || []).filter((t) => now - t < windowMs);
    if (a.length >= max) { hits.set(id, a); return false; }
    hits.set(id, [...a, now]);
    if (hits.size > 3000) hits.clear();
    return true;
  };
}
export async function getJson(url, ms = 12000, fetchImpl = fetch) {
  const r = await fetchImpl(url, { headers: { 'user-agent': 'JarvisBot/1.0 (WhatsApp bot)', accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
