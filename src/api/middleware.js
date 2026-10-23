import crypto from 'node:crypto';
import {unauthorized, forbidden, tooMany, badRequest, ApiError} from './errors.js';
import {verify} from './services/jwt.js';
import {findKey, hasRole} from './services/keys.js';

export const SECURITY_HEADERS = {'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-site', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'"};
export const requestId = () => crypto.randomBytes(6).toString('hex');

/** CORS: only origins listed in API_CORS_ORIGINS (comma separated) get headers. Default: none. */
export function corsHeaders(origin) {
  const allowed = String(process.env.API_CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'authorization,content-type,x-api-key', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-max-age': '600'};
}

export class RateLimiter {
  constructor(limit = 60, windowMs = 60000, now = () => Date.now()) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.hits = new Map(); }
  check(id, limit = this.limit) {
    const t = this.now(); const a = (this.hits.get(id) || []).filter((x) => t - x < this.windowMs);
    if (a.length >= limit) { this.hits.set(id, a); throw tooMany(Math.ceil((a[0] + this.windowMs - t) / 1000)); }
    a.push(t); this.hits.set(id, a); if (this.hits.size > 5000) this.hits.clear();
  }
}

/** Resolves the caller: Bearer JWT or X-API-Key. Returns {id, role} or throws 401. */
export function authenticate(headers) {
  const auth = String(headers.authorization || '');
  if (/^bearer /i.test(auth)) { const c = verify(auth.slice(7).trim()); if (c?.sub && c.role) return {id: c.sub, role: c.role, via: 'jwt'}; throw unauthorized('Invalid or expired token'); }
  if (headers['x-api-key']) { const k = findKey(String(headers['x-api-key'])); if (k) return {id: k.id, role: k.role, via: 'key'}; throw unauthorized('Invalid API key'); }
  throw unauthorized();
}
export const requireRole = (caller, role) => { if (!hasRole(caller.role, role)) throw forbidden(); };

export async function readJson(req, max = 16384, force = false) {
  if (!force && (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS')) return {};
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw new ApiError(415, 'unsupported_media_type', 'Use application/json');
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new ApiError(413, 'payload_too_large', 'Body too large'); chunks.push(c); }
  if (!n) return {};
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; } catch { throw badRequest('Body must be a JSON object'); }
}

/** Minimal schema check: {field: {type:'string'|'boolean'|'number', required, max, pattern, enum}}. Unknown fields are rejected. */
export function validate(body, schema = {}) {
  const out = {};
  for (const k of Object.keys(body)) if (!schema[k]) throw badRequest(`Unknown field: ${k}`);
  for (const [k, r] of Object.entries(schema)) {
    const v = body[k];
    if (v === undefined) { if (r.required) throw badRequest(`Missing field: ${k}`); continue; }
    if (typeof v !== r.type) throw badRequest(`Field ${k} must be ${r.type}`);
    if (r.type === 'string') { const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim(); if (r.max && s.length > r.max) throw badRequest(`Field ${k} too long`); if (r.pattern && !r.pattern.test(s)) throw badRequest(`Field ${k} has an invalid format`); if (r.enum && !r.enum.includes(s)) throw badRequest(`Field ${k} must be one of ${r.enum.join(', ')}`); out[k] = s; } else out[k] = v;
  }
  return out;
}
