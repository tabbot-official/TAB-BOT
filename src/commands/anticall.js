// ANTICALL: auto-reject calls to the bot number with a polite notice.
// Owner only, default off.
import { featOn } from '../config/features.js';
import { isOn, set } from '../utilities/toggles.js';

export default {
  name: 'anticall', aliases: ['nocalls'], category: 'Owner',
  description: 'Auto-reject incoming calls with a notice',
  usage: 'anticall on | off',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('anticall')) return ctx.reply('Anti-call is turned off right now.');
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return ctx.reply('Anti-call is ' + (isOn('anticall') ? 'ON' : 'OFF') + '. Use /anticall on or /anticall off.');
    set('anticall', v === 'on');
    return ctx.reply(v === 'on' ? '✅ Anti-call on. Calls get rejected with a notice (your calls are never blocked).' : '⛔ Anti-call off.');
  },
};
