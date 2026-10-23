// Short-lived, RAM-only log of recent chat text, used by /summary. Never written to disk.
const MAX_PER_CHAT = 300;
const MAX_CHATS = 150;
const TTL_MS = 24 * 3600 * 1000;
const logs = new Map(); // jid -> [{t, who, text}]

export function record(jid, who, text, now = Date.now()) {
  if (!jid || !text) return;
  let a = logs.get(jid);
  if (!a) { a = []; logs.set(jid, a); if (logs.size > MAX_CHATS) logs.delete(logs.keys().next().value); }
  else { logs.delete(jid); logs.set(jid, a); } // LRU touch
  a.push({ t: now, who: String(who || 'Someone').slice(0, 30), text: String(text).replace(/\s+/g, ' ').slice(0, 300) });
  if (a.length > MAX_PER_CHAT) a.splice(0, a.length - MAX_PER_CHAT);
}
export function recent(jid, n = 100, now = Date.now()) {
  const a = (logs.get(jid) || []).filter((x) => now - x.t < TTL_MS);
  return a.slice(-Math.max(1, Math.min(MAX_PER_CHAT, n)));
}
export const _reset = () => logs.clear();
