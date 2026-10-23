import { operatorIdentity } from '../permissions/operators.js';
import {resolveSenderIdentity,ownerIdentity} from '../permissions/sender-identity.js';
import {takeApkChoice} from '../commands/apk/selection.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { jidToNumber } from '../utils/helpers.js';
import { handleCommand, parseCommand, registry } from './commandHandler.js';
import { handleStatus } from './statusHandler.js';
import { cacheMessage } from '../utils/msgCache.js';
import { observe } from '../recover/index.js';
import { attachGroups, groupsReady } from '../groups/index.js';
import { moderate } from '../groups/moderation.js';
import { maybeAutoReply } from '../autoreply/index.js';
import { maybeChatMode } from '../chatmodes/index.js';
import { record as logChat } from '../chatlog/index.js';
import { wordchainPlain } from '../commands/wordchain.js';
import { typeracePlain } from '../commands/typerace.js';
import { featOn } from '../config/features.js';
import { chatModeOn } from '../utilities/chatmodes.js';
import { award as rankAward } from '../fun/rank.js';
import { findMedia, downloadMedia, toSticker } from '../utils/imageTools.js';
import { getRace as typeraceActive } from '../fun/typerace.js';
import { clearAfk, getAfk, shouldNotify, afkLine } from '../fun/afk.js';
import { getGame as wordchainActive } from '../fun/wordchain.js';

const processed = new Set();
const botSent = new Set(); // ids of messages this bot sent itself
const MAX_SENT = 500;

/** Wraps sock.sendMessage so the bot can recognise (and ignore) its own replies. */
export function trackOutgoing(sock) {
  try { attachGroups(sock); } catch (err) { logger.error('Group module failed to attach:', err); }
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const noCache=!!args[2]?.jarvisNoCache;
    if(noCache){args[2]={...args[2]};delete args[2].jarvisNoCache;}
    const res = await original(...args);
    if(!noCache)cacheMessage(res);
    if (res?.key?.id) {
      botSent.add(res.key.id);
      if (botSent.size > MAX_SENT) botSent.delete(botSent.values().next().value);
    }
    return res;
  };
}
const MAX_PROCESSED = 2000;

/** Unwraps ephemeral/view-once/edited wrappers and returns the plain text of a message. */
export function extractText(message) {
  if (!message) return '';
  const m =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message?.protocolMessage?.editedMessage ||
    message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

export function classify(msg) {
  const jid = msg.key.remoteJid || '';
  if (jid === 'status@broadcast') return 'status';
  if (msg.key.fromMe) return 'self';
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return 'ignore';
  return 'private';
}

function senderOf(msg, kind) {
  const raw = kind === 'group' ? msg.key.participantAlt || msg.key.participant : msg.key.remoteJidAlt || msg.key.remoteJid;
  return raw || msg.key.remoteJid;
}

// Chats Tab never reads or answers (the owner's assistant chat). Override with IGNORE_NUMBERS=digits,comma-separated.
const IGNORED = () => String(process.env.IGNORE_NUMBERS ?? '16508702892').split(',').map((x) => x.replace(/\D/g, '')).filter(Boolean);
export function isIgnoredChat(msg) {
  const list = IGNORED(); if (!list.length) return false;
  const k = msg?.key || {};
  return [k.remoteJid, k.remoteJidAlt, k.participant, k.participantAlt].some((j) => { const n = String(j || '').split('@')[0].split(':')[0].replace(/\D/g, ''); return n && list.includes(n); });
}

export async function handleMessage(sock, msg) {
  try {
    if (!msg?.message || !msg.key?.id) return;
    if (isIgnoredChat(msg)) return;
    if(msg.key.fromMe&&botSent.has(msg.key.id))return;
    cacheMessage(msg);
    observe(sock, msg).catch(() => {});
    const kind = classify(msg);
    if (kind === 'status') return handleStatus(sock, msg);
    if (kind === 'ignore') return;
    // Messages sent by the bot itself are never processed. Messages typed by the
    // owner from the linked phone also arrive as fromMe, so those are allowed through
    // (only when they are commands and were not produced by this bot).
    if (kind === 'self' && botSent.has(msg.key.id)) return;
    if (kind === 'group' && !config.allowGroups) return;

    const dedupeId = `${msg.key.remoteJid}:${msg.key.id}`;
    if (processed.has(dedupeId)) return;
    processed.add(dedupeId);
    if (processed.size > MAX_PROCESSED) processed.delete(processed.values().next().value);

const text = extractText(msg.message);
    if (kind === 'group' && !msg.key.fromMe) {
      // Optional moderation and activity counting; never blocks or crashes command handling.
      await groupsReady().catch(() => {});
      const owners = [config.ownerNumber, jidToNumber(sock.user?.id || '')].filter(Boolean);
      const who = jidToNumber(msg.key.participantAlt || msg.key.participant || '');
      await moderate(sock, msg, owners.includes(who));
      // AFK: welcome back the sender if they were away; answer mentions of away members.
      if (featOn('afk')) {
        try {
          const back = clearAfk(msg.key.remoteJid, who);
          if (back) await sock.sendMessage(msg.key.remoteJid, { text: '👋 Welcome back, ' + (back.name || who) + '! You were away.' }, { quoted: msg }).catch(() => {});
          const ci = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo;
          const mentions = [...(ci?.mentionedJid || []), ci?.participant].filter(Boolean).map(jidToNumber);
          for (const m of new Set(mentions)) {
            if (m === who) continue;
            const a = getAfk(msg.key.remoteJid, m);
            if (a && shouldNotify(msg.key.remoteJid, m)) await sock.sendMessage(msg.key.remoteJid, { text: afkLine(a) }, { quoted: msg }).catch(() => {});
          }
        } catch { /* AFK must never break handling */ }
      // XP for /rankcard (1 award per member per minute, groups only).
      try { if (featOn('rankcard') && who) rankAward(msg.key.remoteJid, who); } catch { /* never block */ }
      // AUTOREACT: opt-in per chat; one reaction at most every 3s per chat.
      try {
        if (featOn('autoreact') && chatModeOn(msg.key.remoteJid, 'autoreact')) {
          const now2 = Date.now();
          if (now2 - (globalThis.__lastAutoReact?.[msg.key.remoteJid] || 0) > 3000) {
            globalThis.__lastAutoReact = { ...(globalThis.__lastAutoReact || {}), [msg.key.remoteJid]: now2 };
            const pool = ['❤️', '😂', '👍', '🔥', '😮', '👏', '😍', '💯'];
            await sock.sendMessage(msg.key.remoteJid, { react: { text: pool[Math.floor(Math.random() * pool.length)], key: msg.key } }).catch(() => {});
          }
        }
      } catch { /* never block */ }
      // AUTOSTICKER: opt-in per chat; images/short videos come back as stickers (max 1 per member per 10s).
      try {
        if (featOn('autosticker') && chatModeOn(msg.key.remoteJid, 'autosticker')) {
          const dm = msg.message?.ephemeralMessage?.message || msg.message || {};
          if (!dm.imageMessage && !dm.videoMessage) throw null; // only the sender's own media
          const found = findMedia(msg);
          if (found && ['image', 'video'].includes(found.type)) {
            const k2 = msg.key.remoteJid + '|' + who;
            const now3 = Date.now();
            if (now3 - (globalThis.__lastAutoSticker?.[k2] || 0) > 10000) {
              globalThis.__lastAutoSticker = { ...(globalThis.__lastAutoSticker || {}), [k2]: now3 };
              const buf = await downloadMedia(sock, found);
              if (buf && buf.length <= 8 * 1024 * 1024) {
                const webp = await toSticker(buf, { animated: found.type === 'video' });
                await sock.sendMessage(msg.key.remoteJid, { sticker: webp }, { quoted: msg }).catch(() => {});
              }
            }
          }
        }
      } catch { /* never block */ }
      }
    }
    // ownershell-yesno: verified owner DM confirms staged destructive actions
    if (!msg.key.fromMe && text && kind === 'private') {
      const t = String(text).trim();
      if (/^(yes|no)$/i.test(t)) {
        try {
          const sh = await import('../utilities/ownershell.js');
          if (sh.getPending()) {
            const identity = await resolveSenderIdentity(sock, msg, kind);
            const jid2 = msg.key.remoteJid;
            const opNum = operatorIdentity(identity, kind);
            const gate = { operator: opNum || undefined, isOwner: !!opNum || ownerIdentity(identity, kind, config.ownerNumber, sock.user?.id || ''), isGroup: jid2.endsWith('@g.us'), jid: jid2, sender: identity.phoneNumber || jidToNumber(identity.senderJid), msg };
            if (sh.isVerifiedOwnerDM(gate) && (sh.getPending().by || 'owner') === sh.actorOf(gate)) {
              if (/^no$/i.test(t)) {
                sh.clearPending();
                await sock.sendMessage(jid2, { text: 'Cancelled. Nothing was changed.' }, { quoted: msg });
              } else {
                const p = sh.getPending(); sh.clearPending();
                await sock.sendMessage(jid2, { text: 'Confirmed - running ' + p.cmds.length + ' action(s) now...' }, { quoted: msg });
                const { backup, backupFailed, results } = await sh.runStaged(p);
                if (backupFailed) {
                  await sock.sendMessage(jid2, { text: 'Aborted - the safety backup could not be created, so nothing was run. Check disk space, then try again.' }, { quoted: msg });
                  return;
                }
                const done = 'Done. Backup: ' + (backup || 'none needed (no existing files were touched)') + '\n' +
                  results.map((r, i) => (i + 1) + '. $ ' + r.cmd.slice(0, 60) + ' -> exit ' + r.code).join('\n');
                const outs = results.map((r) => r.out).filter(Boolean).join('\n---\n').slice(0, 2500);
                await sock.sendMessage(jid2, { text: done + (outs ? '\n\n' + outs : '') }, { quoted: msg });
              }
              return;
            }
          }
        } catch { /* never block normal messages */ }
      }
    }
    if (text && !msg.key.fromMe) {
      try {
        const sessions = await import('../utils/sessions.js');
        if (sessions.has(msg.key.remoteJid, msg.key.participant || msg.key.remoteJid) && await sessions.route(sock, msg, text)) return;
      } catch { /* sessions never block normal messages */ }
    }
    let parsed = parseCommand(text);
    if (!parsed && !msg.key.fromMe && text && (kind === 'group' || kind === 'private')) logChat(msg.key.remoteJid, msg.pushName || jidToNumber(senderOf(msg, kind)), text);
    if (!parsed && !msg.key.fromMe && text && (kind === 'group' || kind === 'private')) { try { if (featOn('memory')) { const { userMemory } = await import('../ops/index.js'); userMemory.learn(jidToNumber(senderOf(msg, kind)), text, msg.pushName); } } catch {} }
    if(!parsed){const senderJid=kind==='self'?sock.user?.id||msg.key.remoteJid:senderOf(msg,kind);const choice=takeApkChoice(msg.key.remoteJid,jidToNumber(senderJid),text);if(choice)parsed={name:'apk',args:[choice.packageName]};}
    if (!parsed && kind === 'group' && wordchainActive(msg.key.remoteJid)) { const id = await resolveSenderIdentity(sock, msg, kind); await wordchainPlain({ sock, msg, jid: msg.key.remoteJid, sender: id.phoneNumber || jidToNumber(id.senderJid), text }); return; }
    if (!parsed && kind === 'group' && typeraceActive(msg.key.remoteJid)) { const id = await resolveSenderIdentity(sock, msg, kind); await typeracePlain({ sock, msg, jid: msg.key.remoteJid, sender: id.phoneNumber || jidToNumber(id.senderJid), text }); return; }
    if (!parsed) { if (kind === 'group' || kind === 'private') { if (await maybeChatMode(sock, msg, kind, text)) return; await maybeAutoReply(sock, msg, kind, text); } return; } // normal chatter and bare URLs are ignored

    const jid = msg.key.remoteJid;
    const identity = await resolveSenderIdentity(sock,msg,kind);
    const senderJid = identity.senderJid;
    const sender = identity.phoneNumber || jidToNumber(senderJid);
    if (kind === 'self') msg.fromOwnPhone = true;
    const ctx = {
      sock,
      msg,
      jid,
      sender,
      senderJid,
      text,
      args: [],
      isGroup: jid.endsWith('@g.us'),
      operator: operatorIdentity(identity, kind) || undefined,
      isOwner: !!operatorIdentity(identity, kind) || ownerIdentity(identity,kind,config.ownerNumber,sock.user?.id || ''),
      commands: registry,
      reply: (content, opts) => sock.sendMessage(jid, { text: content, ...(opts || {}) }, { quoted: msg }),
    };
    await handleCommand(ctx, parsed);
  } catch (err) {
    logger.error('Message handling failed:', err);
  }
}
