// HS256 JWT with node:crypto only. The secret comes from API_JWT_SECRET; without it a random per-boot secret is used (tokens die on restart).
import crypto from 'node:crypto';
const b64 = (b) => Buffer.from(b).toString('base64url');
let ephemeral = null;
const secret = () => process.env.API_JWT_SECRET || (ephemeral ||= crypto.randomBytes(32).toString('hex'));
const sig = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');
export function sign(claims, ttlSec = 900, now = Date.now()) {
  const h = b64(JSON.stringify({alg: 'HS256', typ: 'JWT'})); const iat = Math.floor(now / 1000);
  const p = b64(JSON.stringify({...claims, iat, exp: iat + ttlSec})); return `${h}.${p}.${sig(h + '.' + p)}`;
}
export function verify(token, now = Date.now()) {
  const parts = String(token || '').split('.'); if (parts.length !== 3) return null;
  const want = Buffer.from(sig(parts[0] + '.' + parts[1])); const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const hd = JSON.parse(Buffer.from(parts[0], 'base64url')); if (hd.alg !== 'HS256') return null; const c = JSON.parse(Buffer.from(parts[1], 'base64url')); return c.exp > Math.floor(now / 1000) ? c : null; } catch { return null; }
}
