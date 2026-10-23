// NUMEROLOGY: life-path number from a date of birth (offline, just for fun).
import config from '../config/config.js';
import { featOn } from '../config/features.js';

const sumDigits = (n) => { while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = String(n).split('').reduce((a, d) => a + Number(d), 0); return n; };
const MEAN = {
  1: ['The Leader', 'independent, driven, original'],
  2: ['The Peacemaker', 'gentle, diplomatic, cooperative'],
  3: ['The Creator', 'expressive, social, artistic'],
  4: ['The Builder', 'practical, loyal, hardworking'],
  5: ['The Explorer', 'free-spirited, curious, adaptable'],
  6: ['The Nurturer', 'caring, responsible, protective'],
  7: ['The Thinker', 'analytical, quiet, deep'],
  8: ['The Achiever', 'ambitious, organized, strong'],
  9: ['The Humanitarian', 'kind, generous, idealistic'],
  11: ['Master Intuitive', 'insightful, inspiring, sensitive'],
  22: ['Master Builder', 'visionary, practical, big dreams'],
  33: ['Master Teacher', 'selfless, healing, uplifting'],
};

export default {
  name: 'numerology', aliases: ['lifepath'], category: 'Fun',
  description: 'Your numerology life-path number from your birth date',
  usage: 'numerology DD-MM-YYYY',
  async run(ctx) {
    if (!featOn('numerology')) return ctx.reply('Numerology is turned off right now.');
    const m = (ctx.args[0] || '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!m) return ctx.reply('Give your birth date. Example: ' + config.prefix + 'numerology 15-08-2002');
    const [, d, mo, y] = m.map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return ctx.reply('That date does not look right.');
    const n = sumDigits(Number(String(d).padStart(2, '0') + String(mo).padStart(2, '0') + y));
    const [title, traits] = MEAN[n] || ['?', ''];
    return ctx.reply(`🔢 *Life path ${n} - ${title}*\n${traits}\n\n(birth date ${d}-${mo}-${y}; just for fun!)`);
  },
};
