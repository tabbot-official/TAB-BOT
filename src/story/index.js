// Story chain: one collaborative story per group, one sentence at a time. Links, phone numbers and the group's blocked words are refused.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import {screen} from '../confess/index.js';

export const MAX_LINES = 60; export const MAX_LEN = 200;
const file = () => path.join(config.paths.data, 'story.json');
let db = null;
const load = () => { if (db) return db; try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; } return db; };
const save = () => { try { fs.mkdirSync(path.dirname(file()), {recursive: true}); fs.writeFileSync(file() + '.tmp', JSON.stringify(db)); fs.renameSync(file() + '.tmp', file()); } catch { /* best effort */ } };
export const get = (gid) => load()[gid] || null;
export function start(gid, user, opening) {
  const t = String(opening || '').replace(/\s+/g, ' ').trim(); const bad = screen(t); if (bad) return {err: bad};
  if (t.length < 5 || t.length > MAX_LEN) return {err: `Opening line: 5-${MAX_LEN} characters.`};
  load()[gid] = {by: user, lines: [{u: user, t}]}; save(); return {ok: true};
}
export function add(gid, user, text, blockwords = []) {
  const s = get(gid); if (!s) return {err: 'No story running. Start one with /story start <opening line>.'};
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > MAX_LEN) return {err: `One sentence please (2-${MAX_LEN} characters).`};
  if (s.lines.at(-1).u === user) return {err: 'Wait for someone else to add a line first 🙂'};
  if (s.lines.length >= MAX_LINES) return {err: 'The story is full. The starter can end it with /story end.'};
  const bad = screen(t, blockwords); if (bad) return {err: bad};
  s.lines.push({u: user, t}); save(); return {ok: true, n: s.lines.length};
}
export const text = (gid) => (get(gid)?.lines || []).map((l) => l.t).join(' ');
export const end = (gid) => { const t = text(gid); delete load()[gid]; save(); return t; };
export function _reset() { db = {}; }
