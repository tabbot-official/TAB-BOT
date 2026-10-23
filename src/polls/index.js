// Poll tracking: stores polls this bot created so votes can be decrypted and tallied, and closes timed polls with a result.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BufferJSON } from '@whiskeysockets/baileys';
import config from '../config/config.js';
import logger from '../utils/logger.js';

const MAX_POLLS = 60;
const file = () => path.join(config.paths.data, 'polls.json');
let polls = null; // id -> { id, jid, name, options, message, votes:{voter:[hash]}, deadline, closed }
const timers = new Map();
const sha = (s) => crypto.createHash('sha256').update(Buffer.from(s)).digest('hex');
const load = () => {
  if (polls) return polls;
  polls = new Map();
  try { for (const [k, v] of JSON.parse(fs.readFileSync(file(), 'utf8'), BufferJSON.reviver)) polls.set(k, v); } catch { /* none */ }
  return polls;
};
let saveT = null;
const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify([...load().entries()], BufferJSON.replacer)); fs.renameSync(file() + '.tmp', file()); } catch { /* best effort */ } }, 1500); saveT.unref?.(); };
export const _reset = () => { polls = null; for (const t of timers.values()) clearTimeout(t); timers.clear(); };

export function register(sent, { jid, name, options, deadline = 0, creator = '' }) {
  const id = sent?.key?.id; if (!id) return null;
  const m = load();
  m.set(id, { id, jid, name, options, message: sent.message, key: sent.key, votes: {}, deadline, closed: false, creator });
  while (m.size > MAX_POLLS) m.delete(m.keys().next().value);
  save();
  return id;
}
/** For baileys getMessage: lets it decrypt votes for our polls. */
export const getPollMessage = (id) => { const p = load().get(id); return p ? p.message : undefined; };

/** Records votes from a messages.update pollUpdates array. Latest vote per voter wins. */
export function applyUpdates(id, pollUpdates) {
  const p = load().get(id); if (!p || p.closed) return false;
  for (const u of pollUpdates || []) {
    const k = u.pollUpdateMessageKey || {};
    const voter = String(k.participant || k.remoteJid || '').split('@')[0].split(':')[0];
    const sel = (u.vote?.selectedOptions || []).map((b) => Buffer.from(b).toString('hex'));
    if (voter) p.votes[voter] = sel.map((h) => h);
  }
  save(); return true;
}
// baileys hashes with sha256 and aggregates via Buffer#toString() (utf8), so keep both hex forms comparable.
export function tally(p) {
  const hex = new Map(p.options.map((o) => [sha(o), o]));
  const counts = Object.fromEntries(p.options.map((o) => [o, []]));
  for (const [voter, sel] of Object.entries(p.votes)) for (const h of sel) { const o = hex.get(h); if (o) counts[o].push(voter); }
  return counts;
}
export function formatResult(p, counts = tally(p)) {
  const total = new Set(Object.values(counts).flat()).size;
  const rows = Object.entries(counts).sort((a, b) => b[1].length - a[1].length);
  const top = rows[0]?.[1].length || 0;
  const bar = (n) => '█'.repeat(Math.round((n / Math.max(1, top)) * 8)).padEnd(8, '░');
  let out = `📊 *${p.name}*\n`;
  for (const [o, v] of rows) out += `${bar(v.length)} ${v.length} - ${o}\n`;
  const winners = rows.filter(([, v]) => top > 0 && v.length === top).map(([o]) => o);
  out += total ? (winners.length === 1 ? `\n🏆 Winner: *${winners[0]}*` : `\n🤝 Tie: ${winners.join(', ')}`) : '\nNo votes yet.';
  return out + `\n👥 ${total} voter${total === 1 ? '' : 's'}`;
}
export const lastPoll = (jid) => [...load().values()].filter((p) => p.jid === jid).at(-1) || null;
export const get = (id) => load().get(id) || null;

export async function closePoll(sock, id) {
  const p = load().get(id); if (!p || p.closed) return false;
  p.closed = true; save(); clearTimeout(timers.get(id)); timers.delete(id);
  try { await sock.sendMessage(p.jid, { text: '⏰ *Poll closed*\n' + formatResult(p) }); } catch (e) { logger.warn('poll close send failed'); }
  return true;
}
export function schedule(sock, id) {
  const p = load().get(id); if (!p || p.closed || !p.deadline) return;
  clearTimeout(timers.get(id));
  const wait = Math.max(1000, Math.min(p.deadline - Date.now(), 2 ** 31 - 1));
  const t = setTimeout(() => closePoll(sock, id), wait); t.unref?.(); timers.set(id, t);
}
/** Call once a socket is connected: re-arms timers for open timed polls (works across restarts). */
export function resume(sock) { for (const p of load().values()) if (!p.closed && p.deadline) schedule(sock, p.id); }

export function parseDuration(s) {
  const m = /^(\d{1,3})\s*(m|min|h|hr)?$/i.exec(String(s || '').trim());
  if (!m) return 0; const n = Number(m[1]); const mins = /^h/i.test(m[2] || '') ? n * 60 : n;
  return mins >= 1 && mins <= 1440 ? mins * 60000 : 0;
}
