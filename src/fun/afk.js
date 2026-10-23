// AFK store: who is away in which chat, since when, and why. In-memory only -
// being AFK is a moment, not a record.
const away = new Map(); // `${chat}:${user}` -> { reason, since, name }
const notified = new Map(); // `${chat}:${user}` -> last notice time
// Normalize to the bare number so jids (919999@s.whatsapp.net, 919999:5@s.whatsapp.net) and plain numbers match.
const key = (chat, user) => chat + ':' + String(user || '').split('@')[0].split(':')[0];

export function setAfk(chat, user, name, reason) {
  away.set(key(chat, user), { reason, since: Date.now(), name });
  if (away.size > 2000) away.clear();
}
export function clearAfk(chat, user) {
  const k = key(chat, user);
  const had = away.get(k);
  away.delete(k); notified.delete(k);
  return had;
}
export function getAfk(chat, user) { return away.get(key(chat, user)); }
export function shouldNotify(chat, user, now = Date.now()) {
  const k = key(chat, user);
  const last = notified.get(k) || 0;
  if (now - last < 60_000) return false;
  notified.set(k, now);
  if (notified.size > 5000) notified.clear();
  return true;
}
export function afkLine(a) {
  const mins = Math.max(1, Math.round((Date.now() - a.since) / 60000));
  const when = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm';
  return `💤 ${a.name} is away (${when} ago)${a.reason ? ': ' + a.reason : ''}`;
}
