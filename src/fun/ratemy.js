import crypto from 'node:crypto';
const OPENERS = ['Okay okay', 'Not bad', 'Interesting', 'Alright', 'Hmm'];
const LOW = ['Needs a little more oomph, but I believe in you.', 'A solid start. Retake it with better light.', 'Has potential. Try another angle!'];
const MID = ['Pretty good, would not scroll past.', 'Nice one, I would like this.', 'Looks good, the vibe is there.'];
const HIGH = ['This one is a banger!', 'Frame it. Seriously.', 'Top tier, no notes.'];
/** Playful rating built on the AI caption. Score is stable for the same caption, always 5-10 (kind, never harsh). */
export function rateFromCaption(caption) {
  const c = String(caption || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!c) throw new Error('no caption');
  const h = crypto.createHash('sha256').update(c.toLowerCase()).digest();
  const score = 5 + (h[0] % 6);
  const pool = score >= 9 ? HIGH : score >= 7 ? MID : LOW;
  return `📸 *${score}/10*\n${OPENERS[h[1] % OPENERS.length]}, the AI sees: "${c}".\n${pool[h[2] % pool.length]}`;
}
