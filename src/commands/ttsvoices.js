import {t,preference} from '../i18n/index.js';
import config from '../config/config.js';
import { LANGS } from '../tts/voices.js';
import { providerNames } from '../tts/index.js';

export default {
  name: 'ttsvoices',
  aliases: ['voices'],
  category: 'AI',
  description: 'List voice languages and voices',
  usage: 'ttsvoices [language]',
  async run(ctx) {
    const p = config.prefix;
    if(preference(ctx)!=='eng'){const rows=Object.entries(LANGS).map(([c,l])=>`${c}: ${l.name}\n${l.female||'-'} / ${l.male||'-'}`);await ctx.reply(t(ctx,'desc_ttsvoices')+'\n'+rows.join('\n')+'\n'+t(ctx,'usage')+`: ${p}tts <code> [male|female] <text>\n500 chars; 5/min`);return;}
    const code = (ctx.args[0] || '').toLowerCase();
    if (code && LANGS[code]) {
      const l = LANGS[code];
      return ctx.reply(`${l.name} (${code})\nFemale: ${l.female || 'default only'}\nMale: ${l.male || 'default only'}\n\nUse: ${p}tts ${code} male <text> or ${p}tts ${code} female <text>`);
    }
    const rows = Object.entries(LANGS).map(([c, l]) => `${c} - ${l.name}${l.male ? '' : ' (one voice)'}`);
    await ctx.reply(`Voice languages\n\n${rows.join('\n')}\n\nUse: ${p}tts <code> <text>\nExample: ${p}tts hi Namaste dosto\nChoose a voice: ${p}tts en male Hello\nNamed voices: neerja, prabhat, sonia, ryan, aria, jenny, guy, davis\nProviders: ${providerNames().join(', ')}\nLimit: 500 characters, 5 voice notes per minute.`);
  },
};
