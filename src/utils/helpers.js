export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s % 60}s`);
  return parts.join(' ');
}

/** Returns a URL object for http(s) strings only, otherwise null. */
export function parseHttpUrl(text) {
  if (!text || text.length > 2048) return null;
  try {
    const u = new URL(text.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

export function extractUrls(text) {
  return (text.match(/https?:\/\/[^\s<>"']+/gi) || []).slice(0, 5);
}

export function jidToNumber(jid = '') {
  return jid.split('@')[0].split(':')[0];
}

export function truncate(text, n = 60) {
  const t = String(text ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
