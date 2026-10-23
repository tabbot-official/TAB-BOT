import crypto from 'node:crypto';
/** Same pair always gets the same score, whichever order they are written in. */
export function shipScore(a, b) {
  const key = [String(a).toLowerCase().trim(), String(b).toLowerCase().trim()].sort().join('|');
  const h = crypto.createHash('sha256').update('ship:' + key).digest();
  return h.readUInt16BE(0) % 101;
}
const TIERS = [
  [0, '💔 Not a match. Better as friends - or strangers.'],
  [21, '😬 Rough odds. It would take real effort.'],
  [41, '🙂 There is a spark. Needs some time.'],
  [61, '😍 Looking good! Plenty of chemistry.'],
  [81, '💞 Soulmates! Book the wedding hall.'],
  [96, '💍 Written in the stars. Made for each other!'],
];
export const verdict = (n) => [...TIERS].reverse().find(([min]) => n >= min)[1];
export const bar = (n) => '█'.repeat(Math.round(n / 10)) + '░'.repeat(10 - Math.round(n / 10));
export function splitNames(args) {
  const text = (args || []).join(' ').replace(/@\d+/g, ' ').trim();
  const parts = text.split(/\s*(?:&|\+|\||\bx\b|\band\b|\bwith\b|\u2764\ufe0f?|\u2665\ufe0f?)\s*/i).map((x) => x.trim()).filter(Boolean);
  return parts.slice(0, 2).map((x) => x.slice(0, 30));
}
