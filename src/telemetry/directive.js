// Signed maintainer directives: suspend or rate-limit one S-ID. Ed25519; the private key lives only on the collector server.
// An install accepts a directive only if the signature matches the pinned public key, it names THIS install's S-ID, it has not
// expired (30 days max) and its sequence number is newer than the last one applied (no replay).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ACTS = ['suspend', 'limit', 'clear'];
export const MAX_DAYS = 30;
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const b64 = (b) => Buffer.from(b).toString('base64url');
export const pubFromRaw = (raw) => crypto.createPublicKey({key: Buffer.concat([SPKI, Buffer.from(raw, 'base64url')]), format: 'der', type: 'spki'});
export const rawPublic = (keyObj) => b64(keyObj.export({format: 'der', type: 'spki'}).subarray(-32));

export function loadOrCreateKey(file) {
  try { const priv = crypto.createPrivateKey(fs.readFileSync(file)); return {priv, pub: rawPublic(crypto.createPublicKey(priv))}; } catch { /* create */ }
  const {privateKey} = crypto.generateKeyPairSync('ed25519');
  try { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, privateKey.export({format: 'pem', type: 'pkcs8'}), {mode: 0o600}); } catch { /* memory only */ }
  return {priv: privateKey, pub: rawPublic(crypto.createPublicKey(privateKey))};
}
export function sign(priv, d) {
  const p = b64(JSON.stringify({sid: d.sid, act: d.act, exp: d.exp, seq: d.seq, ...(d.lim ? {lim: d.lim} : {})}));
  return {p, s: b64(crypto.sign(null, Buffer.from(p), priv))};
}
/** Returns the directive object or null. `lastSeq` is the highest sequence already applied. */
export function verify(signed, {pubkey, sid, lastSeq = 0, now = Date.now()}) {
  try {
    if (!pubkey || !sid || !signed || typeof signed.p !== 'string' || typeof signed.s !== 'string' || signed.p.length > 600) return null;
    if (!crypto.verify(null, Buffer.from(signed.p), pubFromRaw(pubkey), Buffer.from(signed.s, 'base64url'))) return null;
    const d = JSON.parse(Buffer.from(signed.p, 'base64url').toString('utf8'));
    if (d.sid !== sid || !ACTS.includes(d.act) || !Number.isInteger(d.seq) || d.seq <= lastSeq) return null;
    if (!Number.isFinite(d.exp) || d.exp <= now || d.exp > now + MAX_DAYS * 86400000 + 60000) return null;
    if (d.act === 'limit' && !(Number.isInteger(d.lim) && d.lim >= 1 && d.lim <= 60)) return null;
    return d;
  } catch { return null; }
}
