import {downloadMediaMessage} from '@whiskeysockets/baileys';
import {replyFailure} from '../recovery/reply.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {speak, rateCheck, parseRequest} from '../tts/index.js';
import {getCached} from '../utils/msgCache.js';
import {chunkText, pdfToText, MAX_NOTES} from '../readaloud/index.js';

const unwrap = (m) => m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.documentWithCaptionMessage?.message || m;
const isPdf = (d) => d && (/pdf/i.test(d.mimetype || '') || /\.pdf$/i.test(d.fileName || ''));

function findPdf(msg) {
  const direct = unwrap(msg.message) || {};
  if (isPdf(direct.documentMessage)) return { node: direct.documentMessage, message: msg };
  const ci = direct.extendedTextMessage?.contextInfo || direct.documentMessage?.contextInfo;
  const q = unwrap(ci?.quotedMessage);
  if (isPdf(q?.documentMessage)) return { node: q.documentMessage, message: { key: { remoteJid: msg.key.remoteJid, id: ci.stanzaId, participant: ci.participant, fromMe: false }, message: q } };
  if (ci?.stanzaId) { const c = getCached(ci.stanzaId); if (c && isPdf(c.message?.documentMessage)) return { node: c.message.documentMessage, message: { key: c.key, message: c.message } }; }
  return null;
}

export default {
  name: 'readaloud',
  aliases: ['readpdf', 'pdf2voice', 'listen'],
  category: 'AI',
  description: 'Read a PDF or long text aloud as voice notes',
  usage: 'readaloud [language] (reply to a PDF or text, or send a PDF with this caption)',
  async run(ctx) {
    try {
      if (!ctx.isOwner) { const wait = rateCheck(ctx.sender); if (wait) return ctx.reply(`Please wait ${wait}s before the next one.`); }
      const pdf = findPdf(ctx.msg);
      let text = ''; let note = '';
      if (pdf) {
        if (Number(pdf.node.fileLength) > 5 * 1048576) return ctx.reply('That PDF is too big (max 5 MB).');
        await ctx.reply('📖 Reading the PDF...');
        const buf = await downloadMediaMessage(pdf.message, 'buffer', {}, {logger, reuploadRequest: ctx.sock.updateMediaMessage});
        const r = await pdfToText(buf);
        text = r.text; note = r.pages > r.read ? ` (first ${r.read} of ${r.pages} pages)` : '';
        if (!/[\p{L}\p{N}]/u.test(text)) return ctx.reply('This PDF has no readable text (it may be a scan or images). Try /ocr on a photo of the page.');
      } else {
        const q = unwrap(ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage);
        const quoted = q?.conversation || q?.extendedTextMessage?.text || '';
        text = ctx.args.length > 1 || (ctx.args.length === 1 && !quoted && ctx.args[0].length > 12) ? ctx.args.join(' ') : quoted || ctx.args.join(' ');
      }
      // optional language word first (same as /tts), applied to every part
      const probe = parseRequest(ctx.args, ' ');
      const lang = pdf ? probe.lang : (probe.lang && ctx.args.length > 1 ? probe.lang : undefined);
      const chunks = chunkText(text);
      if (!chunks.length) return ctx.reply(`Reply to a PDF or text with ${config.prefix}readaloud, or send a PDF with it as the caption.`);
      const parts = chunks.slice(0, MAX_NOTES);
      if (chunks.length > MAX_NOTES) await ctx.reply(`Reading the first ${MAX_NOTES} parts${note}. Send the next section as text to continue.`);
      else if (note) await ctx.reply(`Reading${note}.`);
      await ctx.sock.sendPresenceUpdate?.('recording', ctx.jid).catch(() => {});
      for (const part of parts) {
        const out = await speak({text: part, lang: lang || undefined});
        await ctx.sock.sendMessage(ctx.jid, {audio: out.buf, mimetype: out.mimetype, ptt: out.ptt}, {quoted: ctx.msg});
      }
    } catch (err) {
      logger.warn('readaloud error: ' + String(err?.message || err).slice(0, 80));
      await replyFailure(ctx, 'tts', err);
    } finally { await ctx.sock.sendPresenceUpdate?.('paused', ctx.jid).catch(() => {}); }
  },
};
