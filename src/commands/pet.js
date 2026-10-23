// PETS: adopt and care for a virtual pet.
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { KINDS, getPet, adopt, free, feed, play, level } from '../fun/pets.js';

const bar = (v) => '▓'.repeat(Math.round(v / 10)) + '░'.repeat(10 - Math.round(v / 10));
const who = (ctx) => (ctx.senderJid || ctx.sender || '').split('@')[0].split(':')[0];

export default {
  name: 'pet', aliases: ['pets', 'mypet'], category: 'Fun',
  description: 'Adopt and care for a virtual pet',
  usage: 'pet adopt <cat|dog|fox|panda|penguin|rabbit> [name] | pet feed | pet play | pet status | pet release',
  async run(ctx) {
    if (!featOn('pets')) return ctx.reply('Pets are turned off right now.');
    const u = who(ctx);
    const [sub, ...rest] = ctx.args;
    const pet = getPet(u);
    if (sub === 'adopt') {
      if (pet) return ctx.reply(`You already have ${KINDS[pet.kind].emoji} *${pet.name}*. Release them first with ${config.prefix}pet release`);
      const kind = (rest[0] || '').toLowerCase();
      if (!KINDS[kind]) return ctx.reply('Pick a pet: ' + Object.entries(KINDS).map(([k, v]) => v.emoji + ' ' + k).join(', '));
      const name = rest.slice(1).join(' ').trim().slice(0, 16) || kind[0].toUpperCase() + kind.slice(1);
      adopt(u, kind, name.replace(/[^\w ]/g, ''));
      return ctx.reply(`🎉 You adopted ${KINDS[kind].emoji} *${name}*! Keep them fed and happy: ${config.prefix}pet feed, ${config.prefix}pet play`);
    }
    if (!pet) return ctx.reply(`You have no pet yet. Adopt one: ${config.prefix}pet adopt cat`);
    const k = KINDS[pet.kind];
    if (sub === 'feed') { feed(u); return ctx.reply(`🍖 ${pet.name} enjoyed the ${k.food}! Hunger ${bar(getPet(u).hunger)}`); }
    if (sub === 'play') { play(u); return ctx.reply(`🎾 ${pet.name} had fun! Happiness ${bar(getPet(u).happy)}`); }
    if (sub === 'release') { free(u); return ctx.reply(`👋 ${pet.name} waved goodbye and went to a lovely farm.`); }
    const mood = pet.hunger < 25 ? 'hungry 😿' : pet.happy < 25 ? 'bored 🥱' : pet.happy > 80 && pet.hunger > 60 ? 'thriving ✨' : 'content 🙂';
    return ctx.reply(`${k.emoji} *${pet.name}* (level ${level(pet)})\nHunger    ${bar(pet.hunger)} ${pet.hunger}%\nHappiness ${bar(pet.happy)} ${pet.happy}%\nMood: ${mood}\nXP: ${pet.xp}`);
  },
};
