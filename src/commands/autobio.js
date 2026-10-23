// AUTOBIO: rotate the bot bio every 30 min. Owner only, default off.
import { featOn } from '../config/features.js';
import { isOn, set } from '../utilities/toggles.js';

export default {
  name: 'autobio', aliases: ['bio'], category: 'Owner',
  description: 'Rotate the bot bio automatically every 30 min',
  usage: 'autobio on | off',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('autobio')) return ctx.reply('Auto-bio is turned off right now.');
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return ctx.reply('Auto-bio is ' + (isOn('autobio') ? 'ON' : 'OFF') + '. Use /autobio on or /autobio off.');
    set('autobio', v === 'on');
    return ctx.reply(v === 'on' ? '✅ Auto-bio on. The bio refreshes every 30 minutes.' : '⛔ Auto-bio off. Bio stays as is.');
  },
};
