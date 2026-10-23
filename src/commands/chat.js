import config from '../config/config.js';
import { getMode, setChat } from '../chatmodes/index.js';
export default {
  name: 'chat', aliases: ['aichat'], category: 'AI', requiredLevel: 'admin',
  description: 'Sticky AI chat: Tab answers here without a command',
  usage: 'chat on|off|status', minArgs: 0,
  async run(ctx) {
    const a = (ctx.args[0] || 'status').toLowerCase();
    const p = config.prefix;
    if (a === 'on') { setChat(ctx.jid, true); return ctx.reply(ctx.isGroup ? `🤖 AI chat is ON. Mention me, reply to me or start with "${config.botName}" and I will answer. Turn off: ${p}chat off` : `🤖 AI chat is ON. Just write to me normally. Turn off: ${p}chat off`); }
    if (a === 'off') { setChat(ctx.jid, false); return ctx.reply('🤖 AI chat is OFF in this chat.'); }
    return ctx.reply(`🤖 AI chat here: ${getMode(ctx.jid).chat ? 'ON' : 'OFF'}\nUse ${p}chat on or ${p}chat off`);
  },
};
