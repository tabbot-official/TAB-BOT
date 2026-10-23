// Secret Santa: per-group signup, random derangement draw, private DMs. Assignments are kept only so a failed DM can be re-sent.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

export const MAX_PLAYERS = 40;
const file = () => path.join(config.paths.data, 'santa.json');
let db = null;
const load = () => { if (db) return db; try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; } return db; };
const save = () => { try { fs.mkdirSync(path.dirname(file()), {recursive: true}); fs.writeFileSync(file() + '.tmp', JSON.stringify(db)); fs.renameSync(file() + '.tmp', file()); } catch { /* best effort */ } };
export const get = (gid) => load()[gid] || null;
export function open(gid, note = '') { load()[gid] = {state: 'open', note: String(note).slice(0, 200), players: [], pairs: {}, at: Date.now()}; save(); return load()[gid]; }
export function join(gid, jid, name) {
  const g = get(gid); if (!g || g.state !== 'open') return 'closed';
  if (g.players.some((p) => p.jid === jid)) return 'already';
  if (g.players.length >= MAX_PLAYERS) return 'full';
  g.players.push({jid, name: String(name || '').slice(0, 30)}); save(); return 'ok';
}
export function leave(gid, jid) { const g = get(gid); if (!g || g.state !== 'open') return false; const n = g.players.length; g.players = g.players.filter((p) => p.jid !== jid); save(); return g.players.length < n; }
export function cancel(gid) { const had = !!get(gid); delete load()[gid]; save(); return had; }
/** Random derangement: nobody draws themselves. Needs 3+ players. */
export function derange(list, rnd = Math.random) {
  const n = list.length; if (n < 3) return null;
  for (let tries = 0; tries < 1000; tries++) {
    const a = [...list]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.every((x, i) => x !== list[i])) return a;
  }
  const a = [...list.slice(1), list[0]]; return a; // a rotation is always a valid derangement
}
export function draw(gid, rnd = Math.random) {
  const g = get(gid); if (!g || g.state !== 'open') return null;
  const jids = g.players.map((p) => p.jid); const d = derange(jids, rnd); if (!d) return null;
  g.pairs = Object.fromEntries(jids.map((j, i) => [j, d[i]])); g.state = 'drawn'; save(); return g;
}
export const label = (g, jid) => { const p = g.players.find((x) => x.jid === jid); return (p?.name ? p.name + ' ' : '') + '(+' + String(jid).split('@')[0].split(':')[0] + ')'; };
export function _reset() { db = {}; }
