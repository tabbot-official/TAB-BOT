// The ONLY fields a telemetry ping may contain. Shared by the client (builds) and the collector (rejects anything else).
import crypto from 'node:crypto';

import {ENVS} from './env.js';
export const ALLOWED_KEYS = ['v', 'id', 'ver', 'up', 'on', 'nh', 'cmds', 'env', 'ps'];
export const MAX_CMDS = 300;
export const MAX_BODY = 8192;

/** Brute-forceable by design (phone numbers are guessable): it lets the owner check "is this number a known install", nothing more. Disclosed in the README. */
export const numberHash = (digits) => digits ? crypto.createHmac('sha256', 'jarvis-sid-v1').update(String(digits).replace(/\D/g, '')).digest('hex').slice(0, 16) : '';

/** Hash of the pairing-portal S-ID, so the maintainer can match an install to a portal account without the S-ID itself being sent. Disclosed in the README. */
export const portalSidHash = (sid) => /^S-[A-Z0-9]{6}$/.test(String(sid || '')) ? crypto.createHmac('sha256', 'jarvis-psid-v1').update(String(sid)).digest('hex').slice(0, 16) : '';

export function buildPayload({id, ver, up, on, number, cmds, env, portalSid}) {
  const out = {v: 1, id, ver: String(ver).slice(0, 20), up: Math.max(0, Math.floor(up)), on: !!on, cmds: {}};
  const nh = numberHash(number); if (nh) out.nh = nh;
  if (ENVS.includes(env)) out.env = env;
  const ps = portalSidHash(portalSid); if (ps) out.ps = ps;
  for (const [k, n] of Object.entries(cmds || {}).slice(0, MAX_CMDS)) if (/^[a-z0-9_]{1,30}$/.test(k) && Number.isInteger(n) && n > 0 && n < 1e7) out.cmds[k] = n;
  return out;
}

/** Strict validation: unknown keys, wrong types or odd shapes -> null. */
export function validatePayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (Object.keys(p).some((k) => !ALLOWED_KEYS.includes(k))) return null;
  if (p.v !== 1 || !/^[a-f0-9]{24}$/.test(p.id || '')) return null;
  if (typeof p.ver !== 'string' || !/^[0-9A-Za-z.\-+]{1,20}$/.test(p.ver)) return null;
  if (!Number.isInteger(p.up) || p.up < 0 || p.up > 3e8 || typeof p.on !== 'boolean') return null;
  if (p.nh !== undefined && !/^[a-f0-9]{16}$/.test(p.nh)) return null;
  if (p.ps !== undefined && !/^[a-f0-9]{16}$/.test(p.ps)) return null;
  if (p.env !== undefined && !ENVS.includes(p.env)) return null;
  if (!p.cmds || typeof p.cmds !== 'object' || Array.isArray(p.cmds)) return null;
  const e = Object.entries(p.cmds); if (e.length > MAX_CMDS) return null;
  for (const [k, n] of e) if (!/^[a-z0-9_]{1,30}$/.test(k) || !Number.isInteger(n) || n < 1 || n >= 1e7) return null;
  return p;
}
