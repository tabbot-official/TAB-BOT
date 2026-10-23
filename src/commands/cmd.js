import config from '../config/config.js';
import {add, remove, list, MAX_PER_CHAT} from '../custom/index.js';

export default {
  name: 'cmd', aliases: ['customcmd', 'mycmd'], category: 'Group', requiredLevel: 'admin',
  description: 'Admins: make your own text commands for this chat (like /rules)',
  usage: 'cmd add <name> <reply> | del <name> | list', minArgs: 0,
  async run(ctx) {
    const p = config.prefix; const sub = (ctx.args[0] || 'list').toLowerCase();
    if (sub === 'add') {
      const err = add(ctx.jid, (ctx.args[1] || '').replace(/^[\/.!#]/, ''), ctx.args.slice(2).join(' '), (n) => !!ctx.commands?.get?.(n));
      return ctx.reply(err || `✅ Done. Anyone here can now type ${p}${ctx.args[1].replace(/^[\/.!#]/, '').toLowerCase()}. ({user} in the reply becomes the sender's name.)`);
    }
    if (sub === 'del' || sub === 'remove') return ctx.reply(remove(ctx.jid, (ctx.args[1] || '').replace(/^[\/.!#]/, '')) ? 'Removed.' : 'No such custom command.');
    const l = list(ctx.jid);
    await ctx.reply(l.length ? `🧩 Custom commands here (${l.length}/${MAX_PER_CHAT}):\n${l.map((x) => p + x).join(', ')}` : `No custom commands yet.\nExample: ${p}cmd add rules Be kind, no spam, no links.`);
  },
};
