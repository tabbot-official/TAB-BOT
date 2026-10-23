import { recent, clear, format } from '../utils/history.js';
import config from '../config/config.js';
export default {
  name: 'history', aliases: ['recentcmds', 'myhistory'], category: 'General',
  description: 'Your own recent commands',
  usage: 'history | history clear',
  minArgs: 0,
  async run(ctx) {
    if ((ctx.args[0] || '').toLowerCase() === 'clear') { clear(ctx.sender); return ctx.reply('🧹 Your command history is cleared.'); }
    return ctx.reply(format(recent(ctx.sender), config.prefix));
  },
};
