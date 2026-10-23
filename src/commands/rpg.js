// RPG: hunt monsters, earn gold, buy weapons, level up.
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { hero, saveHero, WEAPONS, xpNeed, gainXp, topHeroes } from '../fun/rpg.js';

const who = (ctx) => (ctx.senderJid || ctx.sender || '').split('@')[0].split(':')[0];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const MOBS = [
  { n: 'Slime', hp: 14, dmg: [2, 5], gold: [6, 14], xp: 12 },
  { n: 'Goblin', hp: 24, dmg: [4, 8], gold: [10, 22], xp: 20 },
  { n: 'Wolf', hp: 32, dmg: [6, 11], gold: [16, 30], xp: 30 },
  { n: 'Bandit', hp: 45, dmg: [8, 14], gold: [24, 44], xp: 45 },
  { n: 'Ogre', hp: 70, dmg: [12, 20], gold: [40, 75], xp: 70 },
  { n: 'Dragon Whelp', hp: 110, dmg: [16, 28], gold: [80, 140], xp: 120 },
];
const bar = (v, m) => '▓'.repeat(Math.round((v / m) * 10)) + '░'.repeat(10 - Math.round((v / m) * 10));

export default {
  name: 'rpg', aliases: ['hunt', 'adventure'], category: 'Games',
  description: 'Mini RPG: hunt, earn gold, buy weapons, level up',
  usage: 'rpg | rpg hunt | rpg heal | rpg shop | rpg buy <n> | rpg top',
  async run(ctx) {
    if (!featOn('rpg')) return ctx.reply('The RPG is turned off right now.');
    const u = who(ctx);
    const h = hero(u);
    const sub = (ctx.args[0] || 'me').toLowerCase();
    if (sub === 'me') {
      const w = WEAPONS[h.weapon];
      return ctx.reply(`⚔️ *Your hero* - level ${h.level}\nHP ${bar(h.hp, h.maxHp)} ${h.hp}/${h.maxHp}\nXP: ${h.xp}/${xpNeed(h)} · Gold: ${h.gold} 🪙 · Potions: ${h.potions} 🧪\nWeapon: ${w.name} (${w.dmg[0]}-${w.dmg[1]} dmg) · Wins: ${h.wins}\n\nHunt: ${config.prefix}rpg hunt · Heal (potion): ${config.prefix}rpg heal · Shop: ${config.prefix}rpg shop`);
    }
    if (sub === 'top') {
      const top = topHeroes(8);
      if (!top.length) return ctx.reply('No heroes yet.');
      return ctx.reply('🏆 *Top heroes:*\n' + top.map(([id, x], i) => `${i + 1}. @${id} - lvl ${x.level} (${x.wins} wins)`).join('\n'), { mentions: top.map(([id]) => id + '@s.whatsapp.net') });
    }
    if (sub === 'shop') {
      return ctx.reply('🛒 *Weapon shop* (your gold: ' + h.gold + ')\n' + WEAPONS.map((w, i) => `${i + 1}. ${w.name} - ${w.dmg[0]}-${w.dmg[1]} dmg - ${w.cost} 🪙${i === h.weapon ? ' (yours)' : ''}`).join('\n') + '\n\nBuy: ' + config.prefix + 'rpg buy <number> · Potion (30 🪙): ' + config.prefix + 'rpg buypotion');
    }
    if (sub === 'buy') {
      const i = Number(ctx.args[1]) - 1;
      const w = WEAPONS[i];
      if (!w) return ctx.reply('No such weapon. See ' + config.prefix + 'rpg shop');
      if (i <= h.weapon) return ctx.reply('You already have that or better.');
      if (h.gold < w.cost) return ctx.reply(`Not enough gold (need ${w.cost} 🪙).`);
      h.gold -= w.cost; h.weapon = i; saveHero();
      return ctx.reply(`🗡️ You bought the *${w.name}*! (${w.dmg[0]}-${w.dmg[1]} dmg)`);
    }
    if (sub === 'buypotion') {
      if (h.gold < 30) return ctx.reply('A potion costs 30 🪙.');
      h.gold -= 30; h.potions++; saveHero();
      return ctx.reply('🧪 Potion bought. You have ' + h.potions + '.');
    }
    if (sub === 'heal') {
      if (h.hp >= h.maxHp) return ctx.reply('You are already at full health.');
      if (h.potions < 1) return ctx.reply('No potions left. Buy one for 30 🪙: ' + config.prefix + 'rpg buypotion');
      h.potions--; h.hp = Math.min(h.maxHp, h.hp + 25); saveHero();
      return ctx.reply(`🧪 +25 HP. Now ${h.hp}/${h.maxHp}.`);
    }
    if (sub === 'hunt') {
      const cd = 90000;
      if (Date.now() - h.lastHunt < cd) return ctx.reply('Rest a moment - next hunt in ' + Math.ceil((cd - (Date.now() - h.lastHunt)) / 1000) + 's.');
      h.lastHunt = Date.now();
      if (h.hp < 10) { saveHero(); return ctx.reply('You are too weak to hunt (HP under 10). Heal first: ' + config.prefix + 'rpg heal'); }
      const mob = MOBS[Math.min(MOBS.length - 1, Math.floor(Math.random() * (1 + h.level / 2)))];
      const w = WEAPONS[h.weapon];
      let mhp = mob.hp + h.level * 3, log = [`👹 A wild *${mob.n}* appears (${mhp} HP)!`];
      while (mhp > 0 && h.hp > 0) {
        const hit = rnd(...w.dmg);
        mhp -= hit;
        if (mhp <= 0) break;
        const bite = rnd(...mob.dmg);
        h.hp -= bite;
      }
      if (h.hp > 0) {
        const gold = rnd(...mob.gold), ups = gainXp(h, mob.xp);
        h.gold += gold; h.wins++;
        log.push(`⚔️ You won! +${gold} 🪙, +${mob.xp} XP` + (ups ? `\n🎉 LEVEL UP! You are now level ${h.level} (HP restored to ${h.hp})` : ''));
      } else {
        h.hp = 1;
        log.push('💀 You barely escaped with 1 HP. Heal before the next hunt!');
      }
      saveHero();
      return ctx.reply(log.join('\n'));
    }
    return ctx.reply('Try: ' + config.prefix + 'rpg, hunt, heal, shop, buy, buypotion, top');
  },
};
