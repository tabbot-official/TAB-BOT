// AUTOREACT: opt-in per chat - the bot reacts to messages here. Anyone in a group can switch it.
import { featOn } from '../config/features.js';
import { chatModeOn, setChatMode } from '../utilities/chatmodes.js';

export default {
  name: 'autoreact', aliases: ['areact'], category: 'Group',
  description: 'Auto-react to messages in this chat (opt-in per chat)',
  usage: 'autoreact on | off',
  async run(ctx) {
    if (!featOn('autoreact')) return ctx.reply('Auto-react is turned off right now.');
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return ctx.reply('Auto-react is ' + (chatModeOn(ctx.jid, 'autoreact') ? 'ON' : 'OFF') + ' in this chat. Use /autoreact on or off.');
    setChatMode(ctx.jid, 'autoreact', v === 'on');
    return ctx.reply(v === 'on' ? '✅ Auto-react on in this chat (a small reaction now and then).' : '⛔ Auto-react off in this chat.');
  },
};
