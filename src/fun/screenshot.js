import net from 'node:net';
export class SsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const BLOCKED_HOST = /(^|\.)(localhost|local|internal|lan|home|corp|onion)$/i;
export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new SsError('EMPTY', 'Send a website link.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { throw new SsError('BAD', 'That does not look like a valid link.'); }
  if (!/^https?:$/.test(u.protocol)) throw new SsError('BAD', 'Only http and https links work.');
  if (u.username || u.password) throw new SsError('BAD', 'Links with a username or password are not allowed.');
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOST.test(h) || !h.includes('.') && !net.isIP(h)) throw new SsError('PRIVATE', 'That address is not a public website.');
  if (net.isIP(h)) {
    const v4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/.test(h);
    const v6 = net.isIPv6(h) && /^(::1?$|f[cd]|fe[89ab]|::ffff:)/i.test(h);
    if (v4 || v6) throw new SsError('PRIVATE', 'That address is not a public website.');
  }
  return u.toString();
}
export async function takeScreenshot(url, { fetchImpl = fetch } = {}) {
  const api = `https://image.thum.io/get/width/1024/crop/768/noanimate/${url}`;
  const r = await fetchImpl(api, { headers: { 'user-agent': 'JarvisBot/1.0' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new SsError('SERVICE', 'Screenshot service failed (' + r.status + ').');
  if (!/^image\//.test(r.headers.get('content-type') || '')) throw new SsError('SERVICE', 'Screenshot service returned no image.');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 500) throw new SsError('SERVICE', 'Screenshot came back empty.');
  if (buf.length > 6 * 1024 * 1024) throw new SsError('SERVICE', 'Screenshot too large.');
  return buf;
}
