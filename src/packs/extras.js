import { economy as realEconomy } from '../economy/index.js';
import { playerJid } from '../economy/identity.js';
import { bucket } from './_store.js';
// Extras: XP and levels, virtual shop and inventory, jobs, quote of the day, daily digest. Virtual coins only, no real money.
export const SHOP = [
  { id: 'cookie', name: 'Cookie', price: 20, text: 'A warm virtual cookie.' },
  { id: 'coffee', name: 'Coffee', price: 35, text: 'Fuel for the next job.' },
  { id: 'hat', name: 'Cool Hat', price: 120, text: 'Looks good in your inventory.' },
  { id: 'trophy', name: 'Trophy', price: 400, text: 'Bragging rights.' },
  { id: 'crown', name: 'Crown', price: 1500, text: 'For the richest in chat.' },
];
export const JOBS = [
  { id: 'cleaner', name: 'Cleaner', level: 1, pay: [8, 15], line: 'You cleaned the office' },
  { id: 'courier', name: 'Courier', level: 2, pay: [14, 26], line: 'You delivered 12 parcels' },
  { id: 'barista', name: 'Barista', level: 3, pay: [22, 38], line: 'You made 30 coffees' },
  { id: 'coder', name: 'Coder', level: 5, pay: [40, 70], line: 'You fixed a stubborn bug' },
  { id: 'chef', name: 'Chef', level: 7, pay: [60, 100], line: 'You ran the dinner rush' },
];
export const QUOTES = [
  'Small steps every day add up to big results. - Unknown', 'Well done is better than well said. - Benjamin Franklin',
  'The best way to predict the future is to create it. - Peter Drucker', 'Do something today that your future self will thank you for. - Unknown',
  'It always seems impossible until it is done. - Nelson Mandela', 'Start where you are. Use what you have. Do what you can. - Arthur Ashe',
  'Quality is not an act, it is a habit. - Will Durant', 'Whether you think you can or you think you cannot, you are right. - Henry Ford',
  'The only way to do great work is to love what you do. - Steve Jobs', 'Action is the foundational key to all success. - Pablo Picasso',
  'Energy and persistence conquer all things. - Benjamin Franklin', 'Fall seven times, stand up eight. - Japanese proverb',
];
export const levelOf = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;
export const xpFor = (lvl) => (lvl - 1) ** 2 * 50;
const day = () => new Date().toISOString().slice(0, 10);
const bar = (p) => '#'.repeat(Math.round(p * 10)).padEnd(10, '.');
export function makeExtras(economy, now = () => Date.now(), rand = Math.random) {
  const jidOf = (ctx) => { try { return playerJid(ctx); } catch { return null; } };
  const NEED = 'This needs a verified phone-number identity, so it is not available for this account.';
  const xp = (ctx) => bucket(ctx, 'xp');
  const addXp = (ctx, n) => { const b = xp(ctx); b.xp = (b.xp || 0) + n; b.name = String(ctx.msg?.pushName || '').slice(0, 20); return b.xp; };
  const inv = (ctx) => bucket(ctx, 'inventory');
  const cmd = (name, description, usage, fn, minArgs = 0) => ({
    name, category: 'Extras', description, usage, aliases: [], minArgs, pack: true, web: false, ownerOnly: false, group: false, image: false,
    tests: [['', null, (o) => typeof o === 'string' && o.length > 0 && !/undefined|NaN/.test(o)]], fn: null,
    async run(ctx) { if ((ctx.args || []).length < minArgs) return ctx.reply(`Usage: /${usage}`); try { await ctx.reply(String(await fn(ctx, ctx.args || [])).slice(0, 3500)); } catch (e) { await ctx.reply(`Could not run ${name}: ${e.message}`); } },
  });
  return [
    // Tab: renamed from 'level' (taken by .rankcard's alias, which only works in groups); this one works in DMs too.
    cmd('mylevel', 'Your XP and level', 'mylevel', (ctx) => { const x = xp(ctx).xp || 0, l = levelOf(x), a = xpFor(l), b = xpFor(l + 1); return `Level ${l}\nXP: ${x} (${b - x} to level ${l + 1})\n[${bar((x - a) / (b - a))}]\nEarn XP with /work, /qotd and /buy.`; }),
    cmd('xpboard', 'Top XP players (this bot)', 'xpboard', () => { const out = []; try { const d = JSON.parse(JSON.stringify(bucketAll())); for (const [k, v] of Object.entries(d)) if (k.startsWith('user:xp:') && v.xp) out.push([v.name || 'Player ' + k.slice(-4), v.xp]); } catch { /* none */ } out.sort((a, b) => b[1] - a[1]); return out.length ? out.slice(0, 10).map(([n, x], i) => `${i + 1}. ${n} - ${x} XP (level ${levelOf(x)})`).join('\n') : 'No XP earned yet. Try /work or /qotd.'; }),
    cmd('shop', 'Virtual shop items', 'shop', () => `Virtual shop (coins are not real money)\n${SHOP.map((i) => `${i.id} - ${i.name}: ${i.price} coins. ${i.text}`).join('\n')}\nBuy with /buy <id>`),
    cmd('buy', 'Buy a shop item with virtual coins', 'buy <item id>', (ctx, a) => {
      const jid = jidOf(ctx); if (!jid) return NEED; const it = SHOP.find((i) => i.id === a[0].toLowerCase()); if (!it) return 'No such item. See /shop';
      economy.transaction((s) => { const u = s.users[economy.id(jid)]; if (!u || u.balance < it.price) throw new Error(`Not enough coins (need ${it.price})`); u.balance -= it.price; });
      const b = inv(ctx); b[it.id] = (b[it.id] || 0) + 1; addXp(ctx, 5); return `Bought ${it.name} for ${it.price} coins. See /inventory`;
    }, 1),
    cmd('inventory', 'Items you own', 'inventory', (ctx) => { const b = inv(ctx); const l = SHOP.filter((i) => b[i.id] > 0).map((i) => `${i.name} x${b[i.id]}`); return l.length ? `Your inventory:\n${l.join('\n')}` : 'Your inventory is empty. Browse /shop'; }),
    cmd('workjobs', 'Jobs you can do with /work', 'workjobs', (ctx) => { const l = levelOf(xp(ctx).xp || 0); return `Jobs (your level ${l})\n${JOBS.map((j) => `${j.id} - ${j.name}, pays ${j.pay[0]}-${j.pay[1]}, needs level ${j.level}${j.level > l ? ' (locked)' : ''}`).join('\n')}\nStart one with /work <id>`; }),
    cmd('work', 'Do a job to earn coins and XP (1 hour cooldown)', 'work <job id>', (ctx, a) => {
      const jid = jidOf(ctx); if (!jid) return NEED; const j = JOBS.find((x) => x.id === a[0].toLowerCase()); if (!j) return 'No such job. See /workjobs';
      const l = levelOf(xp(ctx).xp || 0); if (l < j.level) return `You need level ${j.level} for ${j.name}. You are level ${l}.`;
      const b = bucket(ctx, 'work'); const wait = 3600000 - (now() - (b.at || 0)); if (b.at && wait > 0) return `You are tired. Try again in ${Math.ceil(wait / 60000)} minutes.`;
      const pay = j.pay[0] + Math.floor(rand() * (j.pay[1] - j.pay[0] + 1));
      economy.transaction((s) => { const id = economy.id(jid); const u = s.users[id] ||= { balance: 0, dailyAt: 0, earnAt: 0, earned: 0, transfers: 0, payAt: 0, payDay: 0, payCount: 0, achievements: [] }; u.balance = Math.min(s.rules.maxBalance, u.balance + pay); });
      b.at = now(); addXp(ctx, 10); return `${j.line} and earned ${pay} coins and 10 XP.`;
    }, 1),
    cmd('qotd', 'Quote of the day (first read each day gives 5 XP)', 'qotd', (ctx) => { const d = day(); const n = Math.floor(Date.parse(d) / 86400000); const q = QUOTES[n % QUOTES.length]; const b = bucket(ctx, 'qotd'); let extra = ''; if (b.day !== d) { b.day = d; addXp(ctx, 5); extra = '\n+5 XP'; } return `Quote of the day\n${q}${extra}`; }),
    cmd('digest', 'Your daily digest: level, coins, items, quote', 'digest', (ctx) => {
      const x = xp(ctx).xp || 0; const jid = jidOf(ctx); let coins = 'n/a'; try { if (jid) coins = economy.user(jid).balance; } catch { /* hidden */ }
      const items = Object.values(inv(ctx)).reduce((s, v) => s + (+v || 0), 0); const n = Math.floor(Date.parse(day()) / 86400000);
      return `Digest for ${day()}\nLevel ${levelOf(x)} (${x} XP)\nCoins: ${coins}\nItems owned: ${items}\nQuote: ${QUOTES[n % QUOTES.length]}`;
    }),
  ];
}
import { allBuckets } from './_store.js';
const bucketAll = () => allBuckets();
export default makeExtras(realEconomy);
