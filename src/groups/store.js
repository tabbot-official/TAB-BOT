// Per-group storage uses the stable JSON backend; native SQLite probes are disabled.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

export const DEFAULTS = {
  welcome: false,
  goodbye: false,
  antilink: false,
  antispam: false,
  antiflood: false,
  badwords: false,
  aitoxic: false, // P3: AI abuse detection (feature-flagged, rate-limited)
  antisticker: false, // delete stickers from non-admins
  antipromote: false, // demote anyone promoted (owner exempt)
  antimedia: false, // delete all media from non-admins
  welcomeMsg: 'Welcome {user} to {group}! 👋 Type /rules to see the group rules.',
  goodbyeMsg: 'Goodbye {user} 👋',
  rules: '',
  warnLimit: 3,
  warnAction: 'notify', // notify | kick | mute
  warnExpireDays: 30, // warnings older than this stop counting (0 = never)
  muteHours: 6, // length of the 'mute' warn action
  linkMode: 'all', // all | invites (antilink blocks every link or only group invites)
  trusted: [], // member numbers exempt from auto-moderation
  floodLimit: 8, // messages ...
  floodWindow: 10, // ... per this many seconds
  spamRepeat: 3, // identical messages ...
  spamWindow: 30, // ... within this many seconds
};

const dbFile = path.join(config.paths.data, 'groups.sqlite');
const jsonFile = path.join(config.paths.data, 'groups.json');

let impl = null;
export let backend = 'none';

class SqlStore {
  constructor(db) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (gid TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (gid, key));
      CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, gid TEXT NOT NULL, user TEXT NOT NULL, by TEXT, reason TEXT, ts INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS warn_idx ON warnings (gid, user);
      CREATE TABLE IF NOT EXISTS stats (gid TEXT NOT NULL, user TEXT NOT NULL, msgs INTEGER NOT NULL DEFAULT 0, last INTEGER, PRIMARY KEY (gid, user));
      CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, gid TEXT NOT NULL, hhmm TEXT NOT NULL, text TEXT NOT NULL, by TEXT, last_day TEXT);
      CREATE TABLE IF NOT EXISTS bot_admins (num TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS words (gid TEXT NOT NULL, word TEXT NOT NULL, PRIMARY KEY (gid, word));
    `);
    this.q = {
      getSet: db.prepare('SELECT key, value FROM settings WHERE gid = ?'),
      putSet: db.prepare('INSERT INTO settings (gid, key, value) VALUES (?, ?, ?) ON CONFLICT(gid, key) DO UPDATE SET value = excluded.value'),
      addWarn: db.prepare('INSERT INTO warnings (gid, user, by, reason, ts) VALUES (?, ?, ?, ?, ?)'),
      listWarn: db.prepare('SELECT by, reason, ts FROM warnings WHERE gid = ? AND user = ? ORDER BY ts'),
      clearWarn: db.prepare('DELETE FROM warnings WHERE gid = ? AND user = ?'),
      countWarnAll: db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE gid = ?'),
      bump: db.prepare('INSERT INTO stats (gid, user, msgs, last) VALUES (?, ?, 1, ?) ON CONFLICT(gid, user) DO UPDATE SET msgs = msgs + 1, last = excluded.last'),
      top: db.prepare('SELECT user, msgs FROM stats WHERE gid = ? ORDER BY msgs DESC LIMIT ?'),
      tot: db.prepare('SELECT COUNT(*) AS users, COALESCE(SUM(msgs), 0) AS msgs FROM stats WHERE gid = ?'),
      addSch: db.prepare('INSERT INTO schedules (gid, hhmm, text, by) VALUES (?, ?, ?, ?)'),
      listSch: db.prepare('SELECT id, gid, hhmm, text, last_day FROM schedules WHERE gid = ? ORDER BY id'),
      allSch: db.prepare('SELECT id, gid, hhmm, text, last_day FROM schedules'),
      delSch: db.prepare('DELETE FROM schedules WHERE id = ? AND gid = ?'),
      markSch: db.prepare('UPDATE schedules SET last_day = ? WHERE id = ?'),
      listAdm: db.prepare('SELECT num FROM bot_admins'),
      addAdm: db.prepare('INSERT OR IGNORE INTO bot_admins (num) VALUES (?)'),
      delAdm: db.prepare('DELETE FROM bot_admins WHERE num = ?'),
      listWord: db.prepare('SELECT word FROM words WHERE gid = ?'),
      addWord: db.prepare('INSERT OR IGNORE INTO words (gid, word) VALUES (?, ?)'),
      delWord: db.prepare('DELETE FROM words WHERE gid = ? AND word = ?'),
    };
  }
  getSettings(gid) {
    const out = {};
    for (const r of this.q.getSet.all(gid)) { try { out[r.key] = JSON.parse(r.value); } catch { /* skip bad row */ } }
    return out;
  }
  setSetting(gid, key, value) { this.q.putSet.run(gid, key, JSON.stringify(value)); }
  addWarn(gid, user, by, reason) { this.q.addWarn.run(gid, user, by, reason, Date.now()); return this.q.listWarn.all(gid, user).length; }
  listWarns(gid, user) { return this.q.listWarn.all(gid, user); }
  clearWarns(gid, user) { return this.q.clearWarn.run(gid, user).changes; }
  warnTotal(gid) { return this.q.countWarnAll.get(gid).n; }
  bump(gid, user) { this.q.bump.run(gid, user, Date.now()); }
  topUsers(gid, n) { return this.q.top.all(gid, n); }
  totals(gid) { return this.q.tot.get(gid); }
  addSchedule(gid, hhmm, text, by) { return Number(this.q.addSch.run(gid, hhmm, text, by).lastInsertRowid); }
  listSchedules(gid) { return gid ? this.q.listSch.all(gid) : this.q.allSch.all(); }
  delSchedule(gid, id) { return this.q.delSch.run(id, gid).changes; }
  markSchedule(id, day) { this.q.markSch.run(day, id); }
  botAdmins() { return this.q.listAdm.all().map((r) => r.num); }
  addBotAdmin(n) { this.q.addAdm.run(n); }
  delBotAdmin(n) { return this.q.delAdm.run(n).changes; }
  words(gid) { return this.q.listWord.all(gid).map((r) => r.word); }
  addWord(gid, w) { this.q.addWord.run(gid, w); }
  delWord(gid, w) { return this.q.delWord.run(gid, w).changes; }
}

class JsonStore {
  constructor() {
    this.d = { settings: {}, warnings: [], stats: {}, schedules: [], nextSch: 1, admins: [], words: {} };
    try { this.d = { ...this.d, ...JSON.parse(fs.readFileSync(jsonFile, 'utf8')) }; } catch { /* new file */ }
    this.timer = null;
  }
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fs.mkdirSync(path.dirname(jsonFile), { recursive: true }); fs.writeFileSync(jsonFile, JSON.stringify(this.d)); } catch (e) { logger.warn('Saving groups.json failed:', e.message); }
    }, 1500);
    this.timer.unref?.();
  }
  getSettings(gid) { return { ...(this.d.settings[gid] || {}) }; }
  setSetting(gid, key, value) { (this.d.settings[gid] ||= {})[key] = value; this.save(); }
  addWarn(gid, user, by, reason) { this.d.warnings.push({ gid, user, by, reason, ts: Date.now() }); this.save(); return this.listWarns(gid, user).length; }
  listWarns(gid, user) { return this.d.warnings.filter((w) => w.gid === gid && w.user === user); }
  pruneWarns(gid, user, cutoff) { const b = this.d.warnings.length; this.d.warnings = this.d.warnings.filter((w) => !(w.gid === gid && w.user === user && w.ts < cutoff)); if (b !== this.d.warnings.length) this.save(); }
  clearWarns(gid, user) { const b = this.d.warnings.length; this.d.warnings = this.d.warnings.filter((w) => !(w.gid === gid && w.user === user)); this.save(); return b - this.d.warnings.length; }
  warnTotal(gid) { return this.d.warnings.filter((w) => w.gid === gid).length; }
  bump(gid, user) { const g = (this.d.stats[gid] ||= {}); g[user] = (g[user] || 0) + 1; this.save(); }
  topUsers(gid, n) { return Object.entries(this.d.stats[gid] || {}).map(([user, msgs]) => ({ user, msgs })).sort((a, b) => b.msgs - a.msgs).slice(0, n); }
  totals(gid) { const g = Object.values(this.d.stats[gid] || {}); return { users: g.length, msgs: g.reduce((a, b) => a + b, 0) }; }
  addSchedule(gid, hhmm, text, by, opts = {}) { const id = this.d.nextSch++; this.d.schedules.push({ id, gid, hhmm, text, by, last_day: null, dow: opts.dow || null, date: opts.date || null }); this.save(); return id; }
  listSchedules(gid) { return this.d.schedules.filter((s) => !gid || s.gid === gid); }
  delSchedule(gid, id) { const b = this.d.schedules.length; this.d.schedules = this.d.schedules.filter((s) => !(s.id === id && s.gid === gid)); this.save(); return b - this.d.schedules.length; }
  markSchedule(id, day) { const s = this.d.schedules.find((x) => x.id === id); if (s) { s.last_day = day; this.save(); } }
  botAdmins() { return [...this.d.admins]; }
  addBotAdmin(n) { if (!this.d.admins.includes(n)) this.d.admins.push(n); this.save(); }
  delBotAdmin(n) { const b = this.d.admins.length; this.d.admins = this.d.admins.filter((x) => x !== n); this.save(); return b - this.d.admins.length; }
  words(gid) { return [...(this.d.words[gid] || [])]; }
  addWord(gid, w) { const l = (this.d.words[gid] ||= []); if (!l.includes(w)) l.push(w); this.save(); }
  delWord(gid, w) { const l = this.d.words[gid] || []; const i = l.indexOf(w); if (i < 0) return 0; l.splice(i, 1); this.save(); return 1; }
}

export async function initStore() {
  if (impl) return impl;
  fs.mkdirSync(config.paths.data, { recursive: true });
  // Stable JSON backend only. Native SQLite probes disabled on this host.
  if (!impl) { impl = new JsonStore(); backend = 'json'; }
  logger.info(`[groups] storage: ${backend}`);
  return impl;
}

export const store = () => impl;

/** Settings with defaults applied. */
export function settings(gid) {
  return { ...DEFAULTS, ...(impl ? impl.getSettings(gid) : {}) };
}
