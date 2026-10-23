import {replyFailure} from '../recovery/reply.js';
import { fetchPublic } from '../utilities/validation.js';
import { jidToNumber } from '../utils/helpers.js';
import { quiet } from '../recover/index.js';
import logger from '../utils/logger.js';

const isImg = (b) => b.length > 200 && ((b[0] === 0xff && b[1] === 0xd8) || b.slice(1, 4).toString() === 'PNG' || b.slice(8, 12).toString() === 'WEBP');
const reason = (e) => String(e?.message || e?.data || e || '').toLowerCase();

async function pnFor(sock, jid) {
  if (!jid.endsWith('@lid')) return jid;
  try { return (await sock.signalRepository?.lidMapping?.getPNForLID?.(jid)) || jid; } catch { return jid; }
}

async function readUrl(sock, jids) {
  let why = '';
  for (const j of [...new Set(jids)]) {
    for (const kind of ['image', 'preview']) { // 'image' = full resolution, 'preview' = small fallback
      try { const u = await sock.profilePictureUrl(j, kind, 15000); if (u) return { url: u, kind, why }; } catch (err) { why = reason(err); }
    }
  }
  return { url: null, kind: null, why };
}

export default {
  name: 'getpp',
  aliases: ['pp', 'dp'],
  category: 'Recover',
  description: 'Get a profile picture (person or group)',
  usage: 'getpp [number | @mention | reply | group] [hd]',
  async run(ctx) {
    const m = ctx.msg.message || {};
    const info = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo;
    const words = ctx.args.map((a) => String(a).toLowerCase());
    const hd = words.includes('hd'); // send as a document so WhatsApp does not recompress it
    const wantGroup = words.some((w) => w === 'group' || w === 'gc');
    const digits = ctx.args.filter((a) => !/^(hd|group|gc)$/i.test(a)).join('').replace(/\D/g, '');
    const to = ctx.isOwner ? await quiet(ctx) : ctx.jid;
    const say = (text) => ctx.sock.sendMessage(to, { text }, { quoted: ctx.msg });

    let jid; let label;
    if (wantGroup) {
      if (!ctx.isGroup) return say('Use this inside a group to get the group picture: getpp group');
      jid = ctx.jid; label = 'this group';
    } else {
      // Priority: typed number > @mention > replied person > the sender (or the chat in a DM)
      if (digits.length >= 7 && digits.length <= 15) jid = `${digits}@s.whatsapp.net`;
      else if (digits.length) return say('That does not look like a phone number. Use the country code, e.g. getpp 919876543210');
      else jid = info?.mentionedJid?.[0] || info?.participant || (ctx.isGroup ? ctx.senderJid : ctx.jid);
      jid = await pnFor(ctx.sock, jid);
      label = `+${jidToNumber(jid)}`;
      if (jid.endsWith('@s.whatsapp.net') && digits.length) {
        try {
          const r = await ctx.sock.onWhatsApp(jid);
          if (!r?.[0]?.exists) return say(`${label} is not on WhatsApp, so there is no profile picture.`);
          jid = r[0].jid || jid;
        } catch { /* lookup failed: still try the picture */ }
      }
    }

    // Try every form of the id WhatsApp may accept (phone id, own device id, LID).
    const tries = [jid];
    const me = jidToNumber(ctx.sock.user?.id || '');
    if (!wantGroup && me && jidToNumber(jid) === me) tries.unshift(ctx.sock.user.id.replace(/:\d+@/, '@'));
    if (!wantGroup) {
      try { const lid = await ctx.sock.signalRepository?.lidMapping?.getLIDForPN?.(jid); if (lid) tries.push(lid); } catch { /* no mapping */ }
      if (ctx.sock.user?.lid && me && jidToNumber(jid) === me) tries.push(ctx.sock.user.lid.replace(/:\d+@/, '@'));
    }
    const { url, kind, why } = await readUrl(ctx.sock, tries);
    if (!url) {
      logger.info(`[getpp] no picture: ${why.slice(0, 60)}`);
      if (/not-authorized|forbidden|403|401/.test(why)) return say(`${label} hides the profile picture (privacy setting: only contacts can see it).`);
      if (/item-not-found|404|not-found/.test(why) || !why) return say(`${label} has no profile picture set.`);
      return say('Could not read the profile picture right now. Try again in a minute.');
    }
    try {
      const res = await fetchPublic(url, { maxBytes: 10 * 1024 * 1024, timeoutMs: 20000 });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const buf = res.body;
      logger.info(`[getpp] fetched ${buf.length} bytes, mode ${kind}`);
      if (!isImg(buf)) throw new Error('not an image');
      const caption = `Profile picture of ${label}${kind === 'preview' ? ' (low-res, full size unavailable)' : ''}`;
      if (hd) await ctx.sock.sendMessage(to, { document: buf, mimetype: 'image/jpeg', fileName: 'profile.jpg', caption }, { quoted: ctx.msg });
      else await ctx.sock.sendMessage(to, { image: buf, caption }, { quoted: ctx.msg });
    } catch (err) {
      await replyFailure({ ...ctx, reply: (text) => ctx.sock.sendMessage(to, { text }) }, 'getpp', err);
    }
  },
};
