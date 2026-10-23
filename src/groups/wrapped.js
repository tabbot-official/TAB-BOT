// Chat wrapped: pure summary of a group's recent activity (counts only, never message text).
const MEDAL = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
export function summarize({days, hours}) {
  const keys = Object.keys(days).sort();
  const per = {}; let total = 0; const dayTot = {};
  for (const k of keys) { let t = 0; for (const [u, c] of Object.entries(days[k])) { per[u] = (per[u] || 0) + c; t += c; } dayTot[k] = t; total += t; }
  const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([user, msgs]) => ({user, msgs}));
  const busyDay = keys.length ? keys.reduce((a, b) => (dayTot[b] > dayTot[a] ? b : a)) : null;
  const max = Math.max(...hours); const busyHour = max > 0 ? hours.indexOf(max) : null;
  const people = Object.keys(per).length;
  return {total, people, top, busyDay, busyDayMsgs: busyDay ? dayTot[busyDay] : 0, busyHour, activeDays: keys.length, avg: keys.length ? Math.round(total / keys.length) : 0};
}
const hr = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
export function render(s, subject, span) {
  if (!s.total) return {text: 'Not enough activity tracked yet. Chat a bit and try again later.', mentions: []};
  const lines = [`🎬 *${subject} - Wrapped (last ${span} days)*`, '', `💬 ${s.total} messages from ${s.people} people`, `📅 ${s.activeDays} active days, about ${s.avg}/day`];
  if (s.busyDay) lines.push(`🔥 Busiest day: ${s.busyDay} (${s.busyDayMsgs} msgs)`);
  if (s.busyHour !== null) lines.push(`⏰ Peak hour: ${hr(s.busyHour)}`);
  lines.push('', '🏆 *Top chatters*');
  const mentions = [];
  s.top.forEach((t, i) => { lines.push(`${MEDAL[i]} @${t.user.split('@')[0]} - ${t.msgs}`); mentions.push(t.user.includes('@') ? t.user : t.user + '@s.whatsapp.net'); });
  return {text: lines.join('\n'), mentions};
}
