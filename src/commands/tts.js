import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import { parseRequest, speak, rateCheck, TtsError } from '../tts/index.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

export default {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'AI',
  description: 'Turn text into a voice message',
  usage: 'tts [language] [male|female|voice] <text>',
  async run(ctx) {
    const m = ctx.msg.message || {};
    const info = m.extendedTextMessage?.contextInfo;
    const q = info?.quotedMessage;
    const quoted = q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '';
    const req = parseRequest(ctx.args, quoted);
    if (!req.text) {
      const p = config.prefix;
      return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:p,command:'tts [language] [male|female|voice] <text>'}));
    }
    if (!ctx.isOwner) {
      const wait = rateCheck(ctx.sender);
      if (wait) return ctx.reply(t(ctx,'cooldown',{seconds:wait}));
    }
    try {
      await ctx.sock.sendPresenceUpdate?.('recording', ctx.jid).catch(() => {});
      const out = await speak(req);
      await ctx.sock.sendMessage(ctx.jid, { audio: out.buf, mimetype: out.mimetype, ptt: out.ptt }, { quoted: ctx.msg });
      logger.info(`[tts] voice note sent; language ${out.lang}, provider ${out.provider}`);
    } catch (err) {
      await replyFailure(ctx,'tts',err);
    } finally {
      await ctx.sock.sendPresenceUpdate?.('paused', ctx.jid).catch(() => {});
    }
  },
};
