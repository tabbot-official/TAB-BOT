import config from '../config/config.js';
import logger from '../utils/logger.js';
import { makeRate } from '../fun/limiter.js';
import { addStickerExif } from '../utils/imageTools.js';
import { circleAvatar } from '../xxqc/engine.js';
import { renderLiveSticker } from '../xxqc/wa.js';
import { jidToNumber } from '../utils/helpers.js';
import { fetchPublic } from '../utilities/validation.js';

const rate = makeRate(6);
const USAGE = 'Usage: xxqc Your text here\nExample: xxqc Stay hungry, stay foolish 🔥\nSends an animated live WhatsApp-chat sticker.\nReply to someone\'s message with xxqc to quote them.';

export function parseXxqc(args) {
  const flags = { time: false, num: false }; const rest = [];
  for (const a of args || []) { if (/^--time$/i.test(a)) flags.time = true; else if (/^--num$/i.test(a)) flags.num = true; else rest.push(a); }
  return { flags, text: rest.join(' ').replace(/\s+$/g, '').trim() };
}

function quotedOf(msg) {
  const m = msg?.message || {};
  const ci = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo;
  const q = ci?.quotedMessage;
  if (!q) return null;
  const text = q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '';
  return { text, jid: ci.participant || null };
}

/** WhatsApp-style header status: real presence when WhatsApp reports it (short wait), otherwise honest context defaults. */
async function activityStatus(ctx, jid, isSelf) {
  const lastSeen = (t) => { const d = new Date(t * 1000); const hm = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Calcutta' }).toLowerCase(); const same = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Calcutta' }) === new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Calcutta' }); return `last seen ${same ? 'today' : 'yesterday'} at ${hm}`; };
  let found = null;
  try {
    const sock = ctx.sock;
    const onUp = (u) => { const p = u?.presences?.[jid]; if (p) found = p; };
    sock.ev.on('presence.update', onUp);
    try { await sock.presenceSubscribe(jid); await new Promise((r) => setTimeout(r, 1500)); } finally { sock.ev.off('presence.update', onUp); }
  } catch { /* presence unavailable */ }
  const pr = found?.lastKnownPresence;
  if (pr === 'composing') return 'typing...';
  if (pr === 'recording') return 'recording audio...';
  if (pr === 'available') return 'online';
  if (pr === 'unavailable') return found?.lastSeen ? lastSeen(found.lastSeen) : 'last seen recently';
  return isSelf ? 'online' : 'last seen recently';
}

export default {
  name: 'xxqc',
  aliases: ['xqc', 'textsticker'],
  category: 'Image',
  description: 'Turn your text into a styled sticker with your name and picture',
  usage: 'xxqc Your text here  (or reply to a message)',
  async run(ctx) {
    let { text, flags } = parseXxqc(ctx.args);
    const quoted = quotedOf(ctx.msg);
    let who = ctx.senderJid || ctx.sender; let name = ctx.msg?.pushName;
    if (!text && quoted?.text) { text = quoted.text.slice(0, 700); if (quoted.jid) { who = quoted.jid; name = null; } }
    if (!text) return ctx.reply(USAGE);
    if (!rate(ctx.sender)) return ctx.reply('Slow down - max 6 text stickers per minute.');
    try {
      let avatar = null;
      const jid = String(who || '').includes('@') ? who : `${String(who || '').replace(/\D/g, '')}@s.whatsapp.net`;
      try { let url = null; for (const kind of ['image', 'preview']) { try { url = await ctx.sock.profilePictureUrl(jid, kind, 8000); if (url) break; } catch { /* try next size */ } } if (url) { const r = await fetchPublic(url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 6000 }); if (r.status === 200) avatar = await circleAvatar(r.body); } } catch { /* default avatar */ }
      const digits = jid.endsWith('@lid') ? '' : String(jidToNumber(jid) || '').replace(/\D/g, '');
      const number = digits.length >= 7 && digits.length <= 15 ? digits : '';
      const cleanName = String(name || '').replace(/[\u0000-\u001F]/g, '').trim();
      const usable = cleanName && !/^\d{1,6}$/.test(cleanName) ? cleanName : '';
      const shown = usable || (number ? '+' + number.slice(0, 2) + '••••••' + number.slice(-2) : 'WhatsApp User');
      const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Calcutta' });
      const brand = String(process.env.XXQC_BRAND ?? config.botName ?? '').toLowerCase() === 'off' ? '' : (process.env.XXQC_BRAND || config.botName || '');
      const status = await activityStatus(ctx, jid, jid === String(ctx.senderJid || ctx.sender || ''));
      const info = { name: shown, number: flags.num && usable ? number : '', time, brand, status, avatarDataUri: avatar, seed: number || shown };
      const webp = await renderLiveSticker(text, info);
      await ctx.sock.sendMessage(ctx.jid, { sticker: addStickerExif(webp, 'Tab', 'xxqc') }, { quoted: ctx.msg });
      logger.info(`[xxqc] sticker ok ${Math.round(webp.length / 1024)} KB`);
    } catch (err) {
      logger.warn(`[xxqc] failed: ${err?.message || err}`);
      await ctx.reply('Could not create that sticker right now. Try shorter text or try again.');
    }
  },
};
