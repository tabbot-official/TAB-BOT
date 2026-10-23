// Per-user command history. Command NAMES only (never arguments or message text), kept in memory only, so it is gone after a restart.
const MAX = 15, USERS = 2000;
const store = new Map();
export function record(sender, name, now = Date.now()) {
  if (!sender || !name) return;
  const list = store.get(sender) || [];
  list.push({ name, at: now });
  if (list.length > MAX) list.shift();
  store.delete(sender); store.set(sender, list);
  if (store.size > USERS) store.delete(store.keys().next().value);
}
export const recent = (sender) => [...(store.get(sender) || [])].reverse();
export const clear = (sender) => store.delete(sender);
export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
}
export function format(list, prefix = '/', now = Date.now()) {
  if (!list.length) return '🕘 No command history yet. It starts as you use the bot.';
  return '🕘 *Your recent commands*\n' + list.map((h) => `${prefix}${h.name} - ${ago(now - h.at)}`).join('\n') + `\n\n_Only you can see this. It keeps command names only, not what you typed, and resets when the bot restarts. Send ${prefix}history clear to wipe it._`;
}
