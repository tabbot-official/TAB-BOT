// Mind reader (Akinator-style) using the free AI: the bot asks yes/no questions, then guesses. Sessions live in memory only.
import {askAi} from '../ai/providers.js';

export const MAX_Q = 20; const TTL = 15 * 60000; const HOURLY = 80;
const sessions = new Map(); let calls = [];
export const key = (jid, user) => jid + '|' + String(user || '').split('@')[0].split(':')[0];
export const active = (k) => { const s = sessions.get(k); if (s && Date.now() - s.at > TTL) { sessions.delete(k); return null; } return s || null; };
export const stop = (k) => sessions.delete(k);
export function _reset() { sessions.clear(); calls = []; }

/** Map a free-text answer to yes / no / maybe / probablyNot, or null when it is not an answer. */
export function parseAnswer(t) {
  const s = String(t || '').trim().toLowerCase().replace(/[.!?]+$/g, '');
  if (/^(y|yes|yeah|yep|ya|haan|han|ha|hanji|sahi|correct|right|1)$/.test(s)) return 'yes';
  if (/^(n|no|nope|nah|nahi|nai|na|galat|wrong|2)$/.test(s)) return 'no';
  if (/^(maybe|shayad|sometimes|kabhi kabhi|kuch had tak|probably|3)$/.test(s)) return 'maybe';
  if (/^(idk|dont know|don't know|pata nahi|nahi pata|not sure|unknown|4)$/.test(s)) return 'unknown';
  return null;
}
export function buildPrompt(s, lastWrong = []) {
  const hist = s.h.map((x, i) => `${i + 1}. ${x.q} -> ${x.a}`).join('\n') || '(no questions yet)';
  return 'You are playing a 20-questions guessing game. The player is secretly thinking of a well-known character (cartoon, movie, game, anime), a famous public figure, an animal or an everyday object. ' +
    `The category is: ${s.cat || 'anything'}. Keep everything family-friendly.\nQuestions asked so far and answers:\n${hist}\n` +
    (lastWrong.length ? `Wrong guesses already made (do not repeat): ${lastWrong.join(', ')}\n` : '') +
    `You have asked ${s.h.length} of ${MAX_Q} questions. Ask ONE new short yes/no question that best narrows it down, or if you are fairly sure, make a guess. ` +
    'Reply with exactly one line, either "Q: <question>" or "GUESS: <name>". Use the same language as the player (Hinglish if they write Hinglish). No other text.';
}
export function parseTurn(text) {
  const t = String(text || '').trim();
  let m = /^\W*GUESS:\s*(.{1,80})$/im.exec(t); if (m) return {guess: m[1].trim().replace(/[*_"]/g, '')};
  m = /^\W*Q:\s*(.{3,200})$/im.exec(t); if (m) return {q: m[1].trim()};
  return null;
}
function budget(now = Date.now()) { calls = calls.filter((t) => now - t < 3600000); if (calls.length >= HOURLY) return false; calls.push(now); return true; }

export async function start(k, cat = '', ai = askAi) {
  const s = {h: [], at: Date.now(), cat: String(cat).slice(0, 40), pending: null, wrong: []};
  sessions.set(k, s); return next(k, ai);
}
async function next(k, ai) {
  const s = sessions.get(k); if (!s) return {end: true, text: ''};
  if (!budget()) { sessions.delete(k); return {end: true, text: 'The mind reader is resting right now. Try again later.'}; }
  let turn = null;
  try { turn = parseTurn((await ai(buildPrompt(s, s.wrong))).text); } catch { /* handled below */ }
  if (!turn) { sessions.delete(k); return {end: true, text: 'My crystal ball is cloudy. Try again in a minute.'}; }
  s.at = Date.now();
  if (turn.guess || s.h.length >= MAX_Q) { s.pending = {guess: turn.guess || 'something I cannot name'}; return {text: `🔮 I think it is... *${s.pending.guess}*!\nAm I right? (yes / no)`}; }
  s.pending = {q: turn.q}; return {text: `❓ Q${s.h.length + 1}: ${turn.q}\n(yes / no / maybe / don't know)`};
}
/** Handle one player message in an active session. Returns {text, end?} or null if the text is not part of the game. */
export async function turn(k, text, ai = askAi) {
  const s = active(k); if (!s || !s.pending) return null;
  const a = parseAnswer(text); if (!a) return null;
  if (s.pending.guess) {
    if (a === 'yes') { sessions.delete(k); return {end: true, text: `🎉 Got it in ${s.h.length} questions! Play again with /akinator`}; }
    if (a === 'no') { s.wrong.push(s.pending.guess); if (s.wrong.length >= 3 || s.h.length >= MAX_Q) { sessions.delete(k); return {end: true, text: '😮 You beat me! Tell me who it was next time. Play again with /akinator'}; } s.h.push({q: `Is it ${s.pending.guess}?`, a: 'no'}); return next(k, ai); }
    return null;
  }
  s.h.push({q: s.pending.q, a}); return next(k, ai);
}
