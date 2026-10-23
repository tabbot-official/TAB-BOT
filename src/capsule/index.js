import crypto from 'node:crypto';
import {Reminders} from '../utilities/reminders.js';

export const MAX_DAYS = 5 * 365;
export const PER_USER = 5;

/** Reminders store without the 90-day cap: time capsules can go up to 5 years ahead. */
export class Capsules extends Reminders {
  create(text, at, recipient = null, owner = null) {
    if (typeof text !== 'string' || !text.trim() || text.length > 700) throw new Error('capsule_text');
    if (!Number.isFinite(at) || at <= this.now() || at - this.now() > MAX_DAYS * 86400000) throw new Error('capsule_time');
    if (this.jobs.length >= 500) throw new Error('capsule_capacity');
    if (recipient !== null && !/^(\d{7,15}@(s\.whatsapp\.net|lid)|[\d-]{10,40}@g\.us)$/.test(recipient)) throw new Error('capsule_recipient');
    const job = {recipient, owner, id: crypto.randomBytes(4).toString('hex'), text, at, state: 'waiting'};
    this.jobs.push(job); this.save(); return job;
  }
}

/** "2027-01-01" (9:00 AM IST), "1y", "6mo", "2w", "30d" -> {at, rest} or null. */
export function parseWhen(args, now = Date.now()) {
  const a = [...args]; const w = (a.shift() || '').toLowerCase();
  let at = null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (m) { const t = Date.parse(`${w}T09:00:00+05:30`); if (!Number.isNaN(t)) at = t; }
  else if ((m = /^(\d{1,3})(y|yr|mo|m|w|d)$/.exec(w))) {
    const n = Number(m[1]); const u = m[2];
    const days = u.startsWith('y') ? n * 365 : u === 'mo' || u === 'm' ? n * 30 : u === 'w' ? n * 7 : n;
    at = now + days * 86400000;
  }
  if (!at) return null;
  return {at, rest: a.join(' ').trim()};
}
