// AUTOSTICKER: opt-in per chat - images and short videos come back as stickers.
import { featOn } from '../config/features.js';
import { chatModeOn, setChatMode } from '../utilities/chatmodes.js';

export default {
  name: 'autosticker', aliases: ['asticker'], category: 'Group',
  description: 'Turn images posted here into stickers automatically (opt-in per chat)',
  usage: 'autosticker on | off',
  async run(ctx) {
    if (!featOn('autosticker')) return ctx.reply('Auto-sticker is turned off right now.');
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return ctx.reply('Auto-sticker is ' + (chatModeOn(ctx.jid, 'autosticker') ? 'ON' : 'OFF') + ' in this chat. Use /autosticker on or off.');
    setChatMode(ctx.jid, 'autosticker', v === 'on');
    return ctx.reply(v === 'on' ? '✅ Auto-sticker on in this chat. Post an image and it comes back as a sticker (max 1 per person per 10s).' : '⛔ Auto-sticker off in this chat.');
  },
};
