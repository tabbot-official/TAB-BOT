// STATUSREACT: auto-react to contacts' status updates. Owner only, default off.
// Note: reacting implies viewing - the poster can see the bot in their viewers list.
import { featOn } from '../config/features.js';
import { isOn, set } from '../utilities/toggles.js';

export default {
  name: 'statusreact', aliases: ['sreact'], category: 'Owner',
  description: 'Auto-react to status updates (bot appears in viewers list)',
  usage: 'statusreact on | off',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('statusreact')) return ctx.reply('Status reactions are turned off right now.');
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return ctx.reply('Status-react is ' + (isOn('statusreact') ? 'ON' : 'OFF') + '. Note: the bot shows up in the poster\'s viewers list. Use /statusreact on or off.');
    set('statusreact', v === 'on');
    return ctx.reply(v === 'on' ? '✅ Status-react on. New statuses get a small reaction (the bot will show in their viewers list).' : '⛔ Status-react off.');
  },
};
