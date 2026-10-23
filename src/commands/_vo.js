import { downloadMediaMessage } from '@whiskeysockets/baileys';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { jidToNumber } from '../utils/helpers.js';
import { get, list } from '../recover/store.js';
import { sendEntry, whoLine, quiet, unwrap } from '../recover/index.js';

const MEDIA = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' };

/** The contextInfo of the command message (any message type, inside ephemeral/view-once wrappers too). */
export function replyInfo(message) {
  const { m } = unwrap(message || {});
  if (!m) return null;
  for (const v of Object.values(m)) {
    const ci = v && typeof v === 'object' ? v.contextInfo : null;
    if (ci && (ci.stanzaId || ci.quotedMessage)) return ci;
  }
  return null;
}

/**
 * The media inside a quoted message, for every Baileys v7 shape: viewOnceMessage, viewOnceMessageV2,
 * viewOnceMessageV2Extension (voice notes), ephemeralMessage, and a bare image/video/audio with viewOnce:true.
 */
export function quotedMedia(quoted) {
  const { m, viewOnce } = unwrap(quoted || {});
  if (!m) return null;
  for (const [k, type] of Object.entries(MEDIA)) if (m[k]) return { field: k, type, node: m[k], viewOnce: viewOnce || !!m[k].viewOnce };
  return null;
}

const noun = (type) => ({ audio: 'voice note', image: 'photo', video: 'video' }[type] || type);
const useCmd = (type) => `${config.prefix}${type === 'audio' ? 'vvn' : 'vv'}`;

/** Shared logic for /vv and /vvn: reply to a view-once, or take the latest one saved. */
export async function recoverViewOnce(ctx, types, label, { download = downloadMediaMessage } = {}) {
  const to = await quiet(ctx);
  const info = replyInfo(ctx.msg.message);
  let e = info?.stanzaId ? get(info.stanzaId) : null;
  if (e && e.kind !== 'vo') e = null;
  // Not saved (bot was offline, or it arrived before recovery was on): take it straight from the quoted message.
  if (!e && info?.quotedMessage) {
    const q = quotedMedia(info.quotedMessage);
    if (q) {
      if (!types.includes(q.type)) return ctx.sock.sendMessage(to, { text: `That one is a ${noun(q.type)}. Use ${useCmd(q.type)} for it.` });
      const n = q.node;
      const entry = { type: q.type, mime: n.mimetype || '', text: n.caption || '', ptt: !!n.ptt, who: jidToNumber(info.participant || ctx.jid || ''), name: '' };
      let buf = null;
      try {
        const fake = { key: { remoteJid: info.remoteJid || ctx.jid, id: info.stanzaId || '', participant: info.participant, fromMe: false }, message: { [q.field]: n } };
        buf = await download(fake, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
      } catch (err) { logger.warn(`[vv] quoted download failed: ${err.message}`); }
      if (!buf || !buf.length) return ctx.sock.sendMessage(to, { text: `Could not download that ${label}. WhatsApp may no longer have the file (it was already opened or is too old).` });
      return sendEntry(ctx.sock, to, entry, `View-once from ${whoLine(entry)}`, buf);
    }
  }
  if (!e) e = list((x) => x.kind === 'vo' && types.includes(x.type))[0] || null;
  if (!e) return ctx.sock.sendMessage(to, { text: `No ${label} saved yet. Reply to the view-once with ${config.prefix}${types.includes('audio') ? 'vvn' : 'vv'}, or I save view-once items that arrive while I am online.` });
  if (!types.includes(e.type)) return ctx.sock.sendMessage(to, { text: `That one is a ${noun(e.type)}. Use ${useCmd(e.type)} for it.` });
  await sendEntry(ctx.sock, to, e, `View-once from ${whoLine(e)}`);
}
