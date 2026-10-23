import {t} from '../i18n/index.js';
import config from '../config/config.js';

export default {
  name: 'help',
  aliases: ['h'],
  category: 'General',
  description: 'Explain how to use the bot or one command',
  usage: 'help [command]',
  async run(ctx) {
    const p = config.prefix;
    const wanted = ctx.args[0]?.replace(p, '').toLowerCase();
    if (wanted) {
      const cmd = ctx.commands.get(wanted);
      if (!cmd || cmd.hidden) return ctx.reply(t(ctx,'unknown'));
      const aliases = cmd.aliases?.length ? `\n${t(ctx,'aliases')}: ${cmd.aliases.map((a) => p + a).join(', ')}` : '';
      return ctx.reply(`*${p}${cmd.name}*\n${t(ctx,'desc_'+cmd.name)==='desc_'+cmd.name?cmd.description:t(ctx,'desc_'+cmd.name)}\n\n${t(ctx,'usage')}: ${p}${cmd.usage}${aliases}`);
    }
    await ctx.reply(t(ctx,'help_intro',{prefix:p}));
  },
};
