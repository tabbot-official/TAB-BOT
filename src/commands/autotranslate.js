import config from '../config/config.js';
import { LANGS } from './translate.js';
import { getMode, setTranslate } from '../chatmodes/index.js';
export default {
  name: 'autotranslate', aliases: ['autotr', 'livetranslate'], category: 'AI', requiredLevel: 'admin',
  description: 'Auto-translate every message in this chat',
  usage: 'autotranslate <language>|off|status', minArgs: 0,
  async run(ctx) {
    const a = (ctx.args[0] || 'status').toLowerCase();
    const p = config.prefix;
    if (a === 'off') { setTranslate(ctx.jid, null); return ctx.reply('🌐 Auto-translate is OFF in this chat.'); }
    if (a === 'status') { const m = getMode(ctx.jid); return ctx.reply(m.tr ? `🌐 Auto-translate: messages are translated to ${m.tr}.\nTurn off: ${p}autotranslate off` : `🌐 Auto-translate is OFF.\nTurn on: ${p}autotranslate english (or hindi, spanish, ...)`); }
    const lang = LANGS[a];
    if (!lang) return ctx.reply(`Unknown language. Try: ${p}autotranslate english\nLanguages: ${[...new Set(Object.values(LANGS))].join(', ')}.`);
    setTranslate(ctx.jid, lang);
    return ctx.reply(`🌐 Auto-translate is ON. Messages in other languages will be translated to ${lang} (free Google Gemini; text is sent to it). Turn off: ${p}autotranslate off`);
  },
};
