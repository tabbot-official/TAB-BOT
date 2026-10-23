import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

export const TURN_MS = 60000;
const SEEDS = ['planet', 'garden', 'monkey', 'orange', 'bridge', 'castle', 'friend', 'winter', 'rocket', 'silver', 'jungle', 'market', 'pencil', 'island', 'turtle', 'summer', 'candle', 'forest', 'guitar', 'butter', 'dragon', 'cookie', 'flower', 'travel', 'rabbit'];
const games = new Map();
const lifetime = { loaded: false, data: {} };
const scoreFile = () => path.join(config.paths.data, 'wordchain-scores.json');
function loadLife() { if (lifetime.loaded) return; lifetime.loaded = true; try { lifetime.data = JSON.parse(fs.readFileSync(scoreFile(), 'utf8')) || {}; } catch { lifetime.data = {}; } }
function saveLife() { try { fs.mkdirSync(path.dirname(scoreFile()), { recursive: true }); fs.writeFileSync(scoreFile() + '.tmp', JSON.stringify(lifetime.data)); fs.renameSync(scoreFile() + '.tmp', scoreFile()); } catch { /* scores are best effort */ } }

export async function isRealWord(word, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=1`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return true; // fail open: never punish players for a service outage
    const j = await r.json();
    return Array.isArray(j) && j.length > 0 && String(j[0].word).toLowerCase() === word;
  } catch { return true; }
}
export const getGame = (jid) => games.get(jid) || null;
export function startGame(jid, starterId, { seed = SEEDS[Math.floor(Math.random() * SEEDS.length)], onTimeout } = {}) {
  if (games.has(jid)) return null;
  const g = { word: seed, used: new Set([seed]), last: null, scores: new Map(), starter: starterId, moves: 0, timer: null, onTimeout };
  arm(jid, g);
  games.set(jid, g);
  return g;
}
function arm(jid, g) {
  clearTimeout(g.timer);
  g.timer = setTimeout(() => { const r = endGame(jid, true); if (r && g.onTimeout) Promise.resolve(g.onTimeout(r)).catch(() => {}); }, TURN_MS);
  g.timer.unref?.();
}
export function endGame(jid, timedOut = false) {
  const g = games.get(jid); if (!g) return null;
  clearTimeout(g.timer); games.delete(jid);
  const bonus = timedOut && g.last ? 5 : 0;
  if (bonus) g.scores.set(g.last, (g.scores.get(g.last) || 0) + bonus);
  loadLife(); const life = (lifetime.data[jid] ||= {});
  for (const [u, p] of g.scores) life[u] = (life[u] || 0) + p;
  if (g.scores.size) saveLife();
  const ranking = [...g.scores].sort((a, b) => b[1] - a[1]);
  return { moves: g.moves, ranking, survivor: bonus ? g.last : null, lastWord: g.word };
}
/** Returns {ok, points, next} | {skip:true} (ignore silently) | {ok:false, reason}. */
export async function play(jid, playerId, rawWord, { check = isRealWord } = {}) {
  const g = games.get(jid); if (!g) return { skip: true };
  const w = String(rawWord || '').trim().toLowerCase();
  if (!/^[a-z]{3,20}$/.test(w)) return { skip: true };
  const need = g.word[g.word.length - 1];
  if (w[0] !== need) return { skip: true };
  if (g.last === playerId) return { ok: false, reason: 'TURN' };
  if (g.used.has(w)) return { ok: false, reason: 'USED' };
  if (!(await check(w))) return { ok: false, reason: 'INVALID' };
  const cur = games.get(jid);
  if (cur !== g || g.used.has(w) || g.word[g.word.length - 1] !== need) return { skip: true }; // state moved while checking
  g.used.add(w); g.word = w; g.last = playerId; g.moves++;
  const pts = w.length; g.scores.set(playerId, (g.scores.get(playerId) || 0) + pts);
  arm(jid, g);
  return { ok: true, points: pts, next: w[w.length - 1].toUpperCase() };
}
export function topScores(jid, n = 5) { loadLife(); return Object.entries(lifetime.data[jid] || {}).sort((a, b) => b[1] - a[1]).slice(0, n); }
export const _reset = () => { for (const g of games.values()) clearTimeout(g.timer); games.clear(); lifetime.loaded = true; lifetime.data = {}; };
