import {rt} from '../i18n/runtime.js';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const graphemes = (t) => (typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].length : [...t].length);

export default {
  name: 'setprefix',
  aliases: ['prefix'],
  category: 'General',
  description: 'Change the command prefix (any symbol, number, letter or emoji)',
  usage: 'setprefix <new prefix> (or "reset")',
  ownerOnly: true,
  async run(ctx) {
    const raw = ctx.args.join(' ').trim();
    if (!raw) return ctx.reply(rt(ctx,'prefix_help',{prefix:config.prefix}));
    const next = /^(reset|default)$/i.test(raw) ? (process.env.PREFIX || '/').trim() || '/' : raw;
    if (/\s/.test(next)) return ctx.reply(rt(ctx,'prefix_spaces'));
    if (graphemes(next) > 3 || next.length > 12) return ctx.reply(rt(ctx,'prefix_length'));
    try {
      fs.mkdirSync(config.paths.data, { recursive: true });
      const file=path.join(config.paths.data,'prefix.json');
      fs.writeFileSync(file+'.tmp',JSON.stringify({prefix:next}));
      fs.renameSync(file+'.tmp',file);
    } catch {throw new Error('Settings store unavailable; prefix not changed');}
    config.prefix=next;
    const warn = /^[A-Za-z0-9]+$/.test(next) ? rt(ctx,'prefix_warning',{prefix:next}) : '';
    await ctx.reply(rt(ctx,'prefix_saved',{prefix:next,warning:warn}));
  },
};
