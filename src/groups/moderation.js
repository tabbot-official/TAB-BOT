import {rt} from '../i18n/runtime.js';
// Optional auto-moderation. Every feature is OFF until a group admin turns it on.
import validator from 'validator';
import logger from '../utils/logger.js';
import { record as recordActivity } from './activity.js';
import { store, settings } from './store.js';
import { out } from './limiter.js';
import { getMeta, botMember, isAdminP, levelOf, findMember, num, LEVEL } from './perms.js';
import { classifyFree } from '../ai/providers.js';
import { featOn } from '../config/features.js';

const recent = new Map(); // gid:user -> [{t, text}]
const notified = new Map(); // gid:user -> last notice time
const aiHits = new Map(); // gid -> [timestamps] (P3 rate limit)

const URL_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/)\S+/i;
export function hasLink(text, whitelist = []) {
  if (!text) return false;
  const all = text.match(new RegExp(URL_RE.source, 'gi'));
  if (!all) return false;
  const wl = (Array.isArray(whitelist) ? whitelist : []).map((d) => String(d).toLowerCase());
  for (const m of all) {
    const raw = m.replace(/[.,;!?)]+$/, '');
    const isInvite = /chat\.whatsapp\.com\//i.test(raw);
    const isLink = isInvite || validator.isURL(raw, { require_protocol: false }) || /^https?:\/\//i.test(raw);
    if (!isLink) continue;
    if (isInvite) return true;
    let host = '';
    try { host = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* keep empty */ }
    if (host && wl.some((d) => host === d || host.endsWith('.' + d))) continue;
    return true;
  }
  return false;
}

/** Stable id for a media message (same file = same hash), so repeated stickers/images count as spam. */
export function mediaKey(message) {
  const m = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message || {};
  const n = m.stickerMessage || m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage;
  const h = n?.fileSha256;
  if (!h) return '';
  return 'media:' + (Buffer.isBuffer(h) || h instanceof Uint8Array ? Buffer.from(h).toString('base64') : String(h));
}

export function textOf(message) {
  const m = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message || {};
  return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '').trim();
}

const STRIKE_WINDOW_MS = 45_000;
async function strike(sock, msg, gid, memberId, reason, s, canDelete) {
  const st = store();
  if (canDelete) await out.schedule(() => sock.sendMessage(gid, { delete: msg.key })).catch((e) => logger.warn(`[groups] delete failed: ${String(e.message).slice(0, 80)}`));
  else logger.info("[groups] cannot delete (bot is not admin)");
  const key = `${gid}:${memberId}`;
  const last = notified.get(key) || 0;
  // One burst = one strike: extra offending messages inside the window are only deleted.
  if (Date.now() - last < STRIKE_WINDOW_MS) return;
  if (notified.size > 5000) notified.clear();
  notified.set(key, Date.now());
  const days = Number(s.warnExpireDays) || 0;
  if (days > 0 && st.pruneWarns) st.pruneWarns(gid, memberId, Date.now() - days * 86400e3);
  const count = st.addWarn(gid, memberId, 'auto', reason);
  const ctx={jid:gid,isGroup:true,sender:memberId};const tag = `@${num(memberId)}`;
  const reasonText=rt(ctx,reason);
  let text = rt(ctx,'moderation_warning',{user:tag,reason:reasonText,count,limit:s.warnLimit});
  if (count >= s.warnLimit) {
    if (s.warnAction === 'kick' && canDelete) {
      await out.schedule(() => sock.groupParticipantsUpdate(gid, [memberId], 'remove')).catch((e) => logger.warn(`[groups] auto remove failed: ${e.message}`));
      st.clearWarns(gid, memberId);
      text = rt(ctx,'moderation_removed',{user:tag,limit:s.warnLimit});
    } else if (s.warnAction === 'mute') {
      const hours = Number(s.muteHours) || 6;
      st.setSetting(gid, 'penalties', { ...(s.penalties || {}), [num(memberId)]: Date.now() + hours * 3600e3 });
      st.clearWarns(gid, memberId);
      text = `🔇 ${tag} reached ${s.warnLimit} warnings. Their messages will be removed for ${hours} h.`;
    } else {
      text = rt(ctx,'moderation_review',{user:tag,limit:s.warnLimit});
    }
  }
  await out.schedule(() => sock.sendMessage(gid, { text, mentions: [memberId] })).catch(() => {});
}

/** Called for every group message that is not from the bot. Never throws. */
export async function moderate(sock, msg, isOwner) {
  try {
    const gid = msg.key.remoteJid;
    const s = settings(gid);
    const st = store();
    if (!st) return;
    const text = textOf(msg.message);
    const sender = msg.key.participant || msg.key.participantAlt;
    if (!sender) return;

    const meta = await getMeta(sock, gid);
    if (!meta) return;
    const member = findMember(meta, msg.key.participant, msg.key.participantAlt);
    const memberId = member?.id || sender;
    st.bump(gid, num(memberId));
    recordActivity(gid, num(memberId));

    const isAdminUser = levelOf(sock, meta, msg, isOwner) >= LEVEL.groupAdmin;
    const me = botMember(sock, meta);
    const canDelete = isAdminP(me);
    // Members on a timed "mute" penalty (warnaction mute): their messages are removed until it ends.
    const until = s.penalties?.[num(memberId)] || 0;
    if (until && !isAdminUser) {
      if (until > Date.now()) { if (canDelete) await out.schedule(() => sock.sendMessage(gid, { delete: msg.key })).catch(() => {}); return; }
      const rest = { ...s.penalties }; delete rest[num(memberId)]; st.setSetting(gid, 'penalties', rest);
    }
    if (!(s.antilink || s.antiinvite || s.antispam || s.antiflood || s.badwords || s.aitoxic || s.antisticker || s.antimedia)) return;
    if (isAdminUser) return; // admins are exempt
    if (Array.isArray(s.trusted) && s.trusted.includes(num(memberId))) return; // trusted members are exempt

    const k = `${gid}:${num(memberId)}`;
    const now = Date.now();
    const list = (recent.get(k) || []).filter((x) => now - x.t < 60_000);
    const spamKey = text || mediaKey(msg.message);
    list.push({ t: now, text: spamKey });
    recent.set(k, list);
    if (recent.size > 3000) recent.clear();

    // ANTISTICKER / ANTIMEDIA: drop stickers (or any media) from non-admins.
    const mm = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message || {};
    const isSticker = !!mm.stickerMessage;
    const isMedia = isSticker || !!mm.imageMessage || !!mm.videoMessage || !!mm.audioMessage || !!mm.documentMessage;
    if (s.antimedia && isMedia) return strike(sock, msg, gid, memberId, 'moderation_media', s, canDelete);
    if (s.antisticker && isSticker) return strike(sock, msg, gid, memberId, 'moderation_sticker', s, canDelete);
    if (s.antiinvite && /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(text)) return strike(sock, msg, gid, memberId, 'moderation_links', s, canDelete);
    if (s.antilink && s.linkMode !== 'invites' && hasLink(text, s.linkWhitelist)) return strike(sock, msg, gid, memberId, 'moderation_links', s, canDelete);
    if (s.badwords) {
      const lower = text.toLowerCase();
      const words = st.words(gid);
      if (words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(lower))) {
        return strike(sock, msg, gid, memberId, 'moderation_words', s, canDelete);
      }
    }
    if (s.antispam && spamKey) {
      const same = list.filter((x) => x.text === spamKey && now - x.t < s.spamWindow * 1000).length;
      if (same >= s.spamRepeat) return strike(sock, msg, gid, memberId, 'moderation_repeat', s, canDelete);
    }
    if (s.antiflood) {
      const burst = list.filter((x) => now - x.t < s.floodWindow * 1000).length;
      if (burst > s.floodLimit) return strike(sock, msg, gid, memberId, 'moderation_fast', s, canDelete);
    }
    // P3: AI abuse detection. Off unless a group admin turns /aitoxic on. Free classifiers only,
    // rate-limited per group (max 20 checks/hour, min 3s apart) so it never burns quota.
    if (s.aitoxic && featOn('automod') && text.length >= 20 && text.length <= 500) {
      const hits = (aiHits.get(gid) || []).filter((t) => now - t < 3600e3);
      const recentHit = hits.length && now - hits[hits.length - 1] < 3000;
      if (hits.length < 20 && !recentHit) {
        hits.push(now); aiHits.set(gid, hits);
        if (aiHits.size > 2000) aiHits.clear();
        try {
          const verdict = await classifyFree(
            'You are a strict group-chat moderator. Reply with exactly one word: YES if the message is abusive, hateful, harassing, or severe personal insults (in any language, including Hinglish); otherwise NO.',
            text, { timeoutMs: 12000 });
          if (verdict && /^\s*yes/i.test(verdict)) {
            logger.info(`[groups] AI moderation strike in ${gid} for: ${text.slice(0, 60)}`);
            return strike(sock, msg, gid, memberId, 'moderation_toxic', s, canDelete);
          }
        } catch (e) { logger.warn(`[groups] AI moderation failed: ${String(e.message).slice(0, 80)}`); }
      }
    }
  } catch (err) {
    logger.warn(`[groups] moderation error: ${String(err.message).slice(0, 100)}`);
  }
}
