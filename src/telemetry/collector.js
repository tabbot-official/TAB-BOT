// Runs only inside the owner's own deployment (TELEMETRY_COLLECTOR=on). Stores aggregate install stats, never chats or numbers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validatePayload, numberHash} from './payload.js';
import {valid as validFb, FB_KEYS} from './feedback.js';
import {loadOrCreateKey, sign, ACTS, MAX_DAYS} from './directive.js';

export const MAX_INSTALLS = 5000;
const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newSid = () => 'S-' + Array.from(crypto.randomBytes(6), (b) => A[b % A.length]).join('');
const DAY = 86400000;

export class Collector {
  constructor({file, ownerHash = '', ownerInstallId = '', notify = async () => false, now = () => Date.now()}) {
    this.file = file; this.ownerHash = ownerHash; this.notify = notify; this.now = now;
    this.db = {installs: {}, audit: []}; this.ipHits = new Map(); this.pending = []; this.sent = [];
    try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d?.installs) this.db = d; } catch { /* first run */ }
    this.key = loadOrCreateKey(file.replace(/\.json$/, '') + '-directive-key.pem'); this.ipNew = new Map();
    this.pinOwner(ownerInstallId);
  }
  get directivePublicKey() { return this.key.pub; }
  /** Response body for a ping: the S-ID plus (if one is active for this install) a signed directive. */
  reply(it) { const o = {sid: it.sid}; if (it.dir && !it.owner && it.dir.exp > this.now()) o.dir = sign(this.key.priv, {sid: it.sid, ...it.dir}); return o; }
  flag(it, k) { if (it.owner) return; const f = (it.flags ||= []); const e = f.find((x) => x.k === k); if (e) { e.t = this.now(); e.n = (e.n || 1) + 1; } else { f.push({k, t: this.now(), n: 1}); if (f.length > 5) f.shift(); } }
  /** Owner action on one S-ID. The owner install can never be targeted. */
  setDirective(sid, act, days = 7, lim = 0) {
    const it = Object.values(this.db.installs).find((i) => i.sid === sid); if (!it) return {ok: false, why: 'unknown S-ID'};
    if (it.owner) return {ok: false, why: 'the owner install is exempt'};
    if (!ACTS.includes(act)) return {ok: false, why: 'unknown action'};
    const d = Math.min(MAX_DAYS, Math.max(1, Math.floor(days) || 7)); const seq = (it.dir?.seq || 0) + 1;
    it.dir = {act, exp: this.now() + (act === 'clear' ? 7 : d) * 86400000, seq, ...(act === 'limit' ? {lim: Math.min(60, Math.max(1, Math.floor(lim) || 6))} : {})}; this.save();
    return {ok: true, dir: {act, days: act === 'clear' ? 0 : d, lim: it.dir.lim || 0}};
  }
  /** The owner install is pinned from LOCAL identity (this server's own install-id file), never from anything a public ping says. */
  pinOwner(id) {
    if (!/^[a-f0-9]{24}$/.test(id || '')) return;
    for (const [k, v] of Object.entries(this.db.installs)) if (v.owner && k !== id) { v.owner = false; delete v.nh; } // identity changed on this server: only the local one is owner
    const it = this.db.installs[id] ||= {sid: newSid(), first: this.now(), last: 0, ver: '', up: 0, on: false, owner: true, pings: 0, cmds: {}};
    it.owner = true; if (this.ownerHash) it.nh = this.ownerHash;
    this.save();
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), {recursive: true}); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.db)); fs.renameSync(this.file + '.tmp', this.file); } catch { /* keep memory */ } }
  rateOk(ip) { const t = this.now(); const a = (this.ipHits.get(ip) || []).filter((x) => t - x < 3600000); if (a.length >= 60) return false; this.ipHits.set(ip, [...a, t]); if (this.ipHits.size > 5000) this.ipHits.clear(); return true; }
  /** Returns {sid} or null (rejected). Directives are added in a later phase. */
  ingest(body, ip = '?') {
    if (!this.rateOk(ip)) return null;
    if (body && typeof body === 'object' && body.k === 'fb') return this.feedback(body, ip);
    const p = validatePayload(body); if (!p) return null;
    const t = this.now(); let it = this.db.installs[p.id];
    if (!it) {
      if (Object.keys(this.db.installs).length >= MAX_INSTALLS) return null;
      it = this.db.installs[p.id] = {sid: newSid(), first: t, last: 0, ver: p.ver, up: 0, on: false, owner: false, pings: 0, cmds: {}};
      this.db.audit.push({t, e: 'new', sid: it.sid}); this.db.audit = this.db.audit.slice(-200);
      this.pending.push({sid: it.sid, ver: p.ver, t});
      const hits = (this.ipNew.get(ip) || []).filter((x) => t - x < DAY); hits.push(t); this.ipNew.set(ip, hits); if (this.ipNew.size > 5000) this.ipNew.clear();
      if (hits.length >= 5) this.flag(it, 'many-installs-one-ip');
    } else if (!it.owner && t - it.last < 600000) { return this.reply(it); }
    if (it.owner) {
      if (t - it.last < 600000) return {sid: it.sid};
      if (this.ownerHash && p.nh !== this.ownerHash) return {sid: it.sid}; // owner record only updates with the matching identity hash
    }
    if (!it.owner && p.nh) it.nh = p.nh;
    if (p.env) it.env = p.env;
    if (p.ps) it.ps = p.ps;
    it.last = t; it.ver = p.ver; it.up = p.up; it.on = p.on; it.pings++;
    for (const [k, n] of Object.entries(p.cmds)) { if (Object.keys(it.cmds).length < 300 || it.cmds[k]) it.cmds[k] = (it.cmds[k] || 0) + n; }
    if (!it.owner && Object.values(p.cmds).reduce((a, b) => a + b, 0) > 2000) this.flag(it, 'high-volume');
    this.save(); return this.reply(it);
  }
  /** Per-install diagnostics for the owner dashboard. Never includes the id, the hash or any number. */
  detail(sid) {
    const it = Object.values(this.db.installs).find((i) => i.sid === sid); if (!it) return null;
    return {sid: it.sid, owner: !!it.owner, ver: it.ver, first: it.first, last: it.last, on: it.on, up: it.up, pings: it.pings, hasNumberHash: !!it.nh, hasPortalSid: !!it.ps, env: it.env || '', flags: (it.flags || []).map((f) => ({k: f.k, t: f.t, n: f.n})), directive: it.dir && it.dir.exp > this.now() ? {act: it.dir.act, until: it.dir.exp, lim: it.dir.lim || 0} : null, cmdTotal: Object.values(it.cmds).reduce((a, b) => a + b, 0), top: Object.entries(it.cmds).sort((a, b) => b[1] - a[1]).slice(0, 10)};
  }
  /** "Is this number a known install?" The number is hashed on the spot and compared; it is never stored or logged. */
  lookupNumber(digits) {
    const h = numberHash(String(digits || '').replace(/\D/g, '').slice(0, 20)); if (!h) return {valid: false, matches: []};
    return {valid: true, matches: Object.values(this.db.installs).filter((i) => i.nh === h).map((i) => ({sid: i.sid, owner: !!i.owner, ver: i.ver, last: i.last}))};
  }
  /** Feedback from an install that has pinged before: S-ID + cleaned text only. 5 per install per day, 200 kept. */
  feedback(body, ip = '?') {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !FB_KEYS.includes(k)) || body.v !== 1 || !/^[a-f0-9]{24}$/.test(body.id || '')) return null;
    const it = this.db.installs[body.id]; const text = validFb(body.t); if (!it || !text) return null;
    const t = this.now(); const fb = (this.db.feedback ||= []);
    if (fb.filter((f) => f.sid === it.sid && t - f.t < DAY).length >= 5) return null;
    fb.push({t, sid: it.sid, ver: it.ver, text}); if (fb.length > 200) fb.splice(0, fb.length - 200);
    this.save(); return {ok: true};
  }
  feedbackList(n = 30) { return (this.db.feedback || []).slice(-n).reverse().map((f) => ({t: f.t, sid: f.sid, ver: f.ver, text: f.text})); }
  isExempt(sid) { return Object.values(this.db.installs).some((i) => i.sid === sid && i.owner); }
  /** New-install DM to the owner: up to 5 per 10 minutes individually, then one batched line. */
  async flush(enabled = true) {
    if (!this.pending.length) return 0;
    const t = this.now(); this.sent = this.sent.filter((x) => t - x < 600000);
    if (!enabled) { this.pending = []; return 0; }
    const batch = this.pending; let n = 0;
    if (batch.length > 5 || this.sent.length + batch.length > 5) {
      if (await this.notify(`🆕 ${batch.length} new Tab installs (${batch.slice(0, 8).map((b) => b.sid).join(', ')}${batch.length > 8 ? ', ...' : ''}). Open the dashboard for details.`)) { this.sent.push(t); this.pending = []; n = batch.length; }
      return n;
    }
    for (const b of batch) { if (await this.notify(`🆕 New Tab install: ${b.sid} (v${b.ver}). Total installs: ${Object.keys(this.db.installs).length}.`)) { this.sent.push(t); n++; this.pending = this.pending.filter((x) => x !== b); } else break; }
    return n;
  }
  summary() {
    const t = this.now(); const list = Object.values(this.db.installs); const cmds = {}; const vers = {}; const envs = {}; const ups = [];
    for (const i of list) { vers[i.ver] = (vers[i.ver] || 0) + 1; if (i.env) envs[i.env] = (envs[i.env] || 0) + 1; if (i.on) ups.push(i.up); for (const [k, n] of Object.entries(i.cmds)) cmds[k] = (cmds[k] || 0) + n; }
    ups.sort((a, b) => a - b);
    return {
      total: list.length, active24h: list.filter((i) => t - i.last < DAY).length, active7d: list.filter((i) => t - i.last < 7 * DAY).length, online: list.filter((i) => i.on && t - i.last < 2 * DAY).length,
      top: Object.entries(cmds).sort((a, b) => b[1] - a[1]).slice(0, 10), versions: Object.entries(vers).sort((a, b) => b[1] - a[1]), hosting: Object.entries(envs).sort((a, b) => b[1] - a[1]), medianUptime: ups.length ? ups[Math.floor(ups.length / 2)] : 0,
      installs: list.sort((a, b) => b.last - a.last).slice(0, 50).map((i) => ({sid: i.sid, ver: i.ver, last: i.last, first: i.first, on: i.on, owner: i.owner, up: i.up, env: i.env || '', fl: (i.flags || []).length, dir: !!(i.dir && i.dir.exp > t && i.dir.act !== 'clear')})),
    };
  }
}
