import crypto from 'node:crypto';
const TZ = process.env.BOT_TZ || 'Asia/Calcutta';
export const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', {timeZone: TZ});
const TITLES = ['Main Character Energy', 'Chill Panda', 'Chaos Goblin', 'Sunshine Mode', 'Midnight Thinker', 'Walking Meme', 'Calm Ocean', 'Hyper Puppy', 'Quiet Genius', 'Cricket Captain Mode', 'Chai-Powered Legend', 'Sleepy Cat', 'Lucky Star', 'Plot Twist', 'Boss Level'];
const TIPS = ['Drink some water, hero.', 'Text someone you have not talked to in a while.', 'Good day to start that thing you keep postponing.', 'Take a 10 minute walk, it will help.', 'Say thanks to someone today.', 'Avoid arguments, save your energy.', 'Listen to your favourite song.', 'Eat something nice, you deserve it.', 'Your luck is high, try something new.', 'Call your family, they will love it.'];
/** Deterministic per person per day, so the same person gets the same vibe all day. */
export function vibe(user, day = dayKey()) {
  const h = crypto.createHash('sha256').update(String(user) + '|' + day + '|vibe').digest();
  const pct = (i) => 10 + (h[i] % 91);
  return {energy: pct(0), chill: pct(1), chaos: pct(2), luck: pct(3), title: TITLES[h[4] % TITLES.length], tip: TIPS[h[5] % TIPS.length]};
}
const bar = (n) => '█'.repeat(Math.round(n / 10)) + '░'.repeat(10 - Math.round(n / 10));
export function render(name, v) {
  return [`✨ *Vibe check: ${name}*`, `🏷️ ${v.title}`, '', `⚡ Energy  ${bar(v.energy)} ${v.energy}%`, `😌 Chill   ${bar(v.chill)} ${v.chill}%`, `🌪️ Chaos   ${bar(v.chaos)} ${v.chaos}%`, `🍀 Luck    ${bar(v.luck)} ${v.luck}%`, '', `💡 ${v.tip}`, '_For fun only. Changes every day._'].join('\n');
}
/** Group mood from today's message volume against the 7-day average (counts only). */
export function groupMood(todayMsgs, avgMsgs) {
  if (!avgMsgs || todayMsgs < 5) return {label: 'Sleepy 😴', note: 'Very quiet today.'};
  const r = todayMsgs / avgMsgs;
  if (r > 1.6) return {label: 'On fire 🔥', note: 'Way busier than usual.'};
  if (r > 1.05) return {label: 'Lively 😄', note: 'A bit busier than usual.'};
  if (r > 0.6) return {label: 'Chill 😌', note: 'A normal day.'};
  return {label: 'Calm 🌿', note: 'Quieter than usual.'};
}
