// Watches incoming messages: remembers recent chats, statuses and view-once media,
// and sends deleted items to the owner's own chat ("message yourself").
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { jidToNumber } from '../utils/helpers.js';
import * as store from './store.js';

store.init();
const seenShapes = new Set();

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];
const MEDIA = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };

/** Unwraps wrappers and reports whether the message is view-once. */
export function unwrap(message) {
  let m = message;
  let viewOnce = false;
  for (let i = 0; i < 5 && m; i++) {
    const w = WRAPPERS.find((k) => m[k]);
    if (!w) break;
    if (w.startsWith('viewOnce')) viewOnce = true;
    m = m[w].message;
  }
  if (m) for (const k of Object.keys(MEDIA)) if (m[k]?.viewOnce) viewOnce = true;
  return { m: m || null, viewOnce };
}

export const selfJid = (sock) => `${jidToNumber(sock.user?.id || '')}@s.whatsapp.net`;

function describe(msg, m) {
  for (const [k, type] of Object.entries(MEDIA)) {
    if (m[k]) {
      const n = m[k];
      return { type, mime: n.mimetype || '', text: n.caption || '', size: Number(n.fileLength?.low ?? n.fileLength ?? 0), ptt: !!n.ptt, fileName: n.fileName || '' };
    }
  }
  const text = m.conversation || m.extendedTextMessage?.text || '';
  return text ? { type: 'text', text } : null;
}

async function fetchMedia(sock, msg, size) {
  if (size && size > store.LIMITS.maxFile) return null;
  try {
    return await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
  } catch (err) {
    logger.debug?.(`[recover] media download failed: ${err.message}`);
    return null;
  }
}

async function chatLabel(sock, jid) {
  if (!jid.endsWith('@g.us')) return 'private chat';
  try { return `group "${(await sock.groupMetadata(jid)).subject}"`; } catch { return 'a group'; }
}

/** Sends one stored entry to a chat. */
export async function sendEntry(sock, jid, e, caption = '') {
  const buf = store.readFile(e);
  const cap = [caption, e.text && e.type !== 'text' ? e.text : ''].filter(Boolean).join('\n');
  if (e.type === 'text') return sock.sendMessage(jid, { text: [caption, e.text].filter(Boolean).join('\n\n') });
  if (!buf) return sock.sendMessage(jid, { text: `${caption}\n(${e.type} could not be saved: too big or not available)` });
  if (e.type === 'image') return sock.sendMessage(jid, { image: buf, caption: cap });
  if (e.type === 'video') return sock.sendMessage(jid, { video: buf, caption: cap });
  if (e.type === 'audio') {
    await sock.sendMessage(jid, { audio: buf, mimetype: e.mime || 'audio/ogg; codecs=opus', ptt: !!e.ptt });
    return caption ? sock.sendMessage(jid, { text: caption }) : null;
  }
  if (e.type === 'sticker') { await sock.sendMessage(jid, { sticker: buf }); return caption ? sock.sendMessage(jid, { text: caption }) : null; }
  return sock.sendMessage(jid, { document: buf, mimetype: e.mime || 'application/octet-stream', fileName: e.fileName || 'file', caption: cap });
}

export const whoLine = (e) => `${e.name || 'Unknown'} (+${e.who || '?'})`;
const clock = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: process.env.BOT_TZ || 'Asia/Calcutta' });

export const onRevokeKey = (sock, key) => onRevoke(sock, key);

async function onRevoke(sock, key) {
  const e = store.get(key.id);
  if (!e || e.deleted) return;
  const s = store.getSettings();
  if (e.kind === 'status') {
    if (!s.status) return;
    store.markDeleted(e.id);
    await sendEntry(sock, selfJid(sock), e, `Deleted status\nFrom: ${whoLine(e)}\nPosted: ${clock(e.ts)}`);
    return;
  }
  const isGroup = e.chat.endsWith('@g.us');
  if (!s.antidelete || (isGroup && !s.groups)) return;
  store.markDeleted(e.id);
  await sendEntry(sock, selfJid(sock), e, `Deleted message\nFrom: ${whoLine(e)}\nIn: ${await chatLabel(sock, e.chat)}\nSent: ${clock(e.ts)}`);
  logger.info('[recover] deleted message restored');
}

/** Called for every incoming message. Never throws. */
export async function observe(sock, msg) {
  try {
    const { m, viewOnce } = unwrap(msg.message);
    if (!m || !msg.key?.id) return;
    const jid = msg.key.remoteJid || '';
    const proto = m.protocolMessage;
    if (proto && (proto.type === 0 || proto.type === 'REVOKE') && proto.key?.id) return await onRevoke(sock, proto.key);
    if (msg.key.fromMe) return;
    const s = store.getSettings();
    const isStatus = jid === 'status@broadcast';
    const isGroup = jid.endsWith('@g.us');
    let kind = 'msg';
    if (isStatus) { if (!s.status) return; kind = 'status'; }
    else if (viewOnce) { if (!s.vo) return; kind = 'vo'; }
    else if (!s.antidelete || (isGroup && !s.groups) || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
    const d = describe(msg, m);
    if (!d) {
      // Helps diagnose what WhatsApp really delivered (shape only, no content), once per kind.
      const ignore = ['reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'pollUpdateMessage', 'editedMessage', 'pinInChatMessage', 'keepInChatMessage'];
      if (Object.keys(m).some((k) => ignore.includes(k))) return;
      const shape = Object.keys(m).filter((k) => k !== 'messageContextInfo').join(',').slice(0, 80);
      const tag = `${kind}:${shape}`;
      if (!seenShapes.has(tag) && seenShapes.size < 40) { seenShapes.add(tag); logger.info(`[recover] unsupported ${kind} message shape: ${shape || 'empty'}`); }
      return;
    }
    const raw = isStatus || isGroup ? msg.key.participantAlt || msg.key.participant : msg.key.remoteJidAlt || msg.key.remoteJid;
    const buf = d.type === 'text' ? null : await fetchMedia(sock, msg, d.size);
    store.add({ id: msg.key.id, kind, chat: jid, who: jidToNumber(raw || ''), name: msg.pushName || '', fromMe: false, ...d, size: undefined }, buf);
    if (kind === 'vo') logger.info(`[recover] view-once ${d.type} saved`);
    else if (kind === 'status') logger.info(`[recover] status ${d.type} saved`);
  } catch (err) {
    logger.warn(`[recover] observe failed: ${err.message}`);
  }
}

/** Where recovered items go: the owner's own chat. Also hides the command typed in someone else's chat. */
export async function quiet(ctx) {
  const self = selfJid(ctx.sock);
  if (ctx.msg.key.fromMe && ctx.jid !== self) {
    await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key }).catch(() => {});
    return self;
  }
  return ctx.jid;
}
