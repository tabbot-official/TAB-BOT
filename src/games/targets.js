import {phoneJid} from '../permissions/sender-identity.js';
// No @mention: a swipe-reply picks the quoted author; in a 1:1 chat started from the owner's own phone, the other person is the opponent. Never a guessed number.
export function implicitOpponent(ctx, m) {
  const ci = m?.extendedTextMessage?.contextInfo;
  const quoted = ci?.participant;
  const me = String(ctx.sock?.user?.id || '').split(':')[0].split('@')[0];
  const notBot = (id) => id && String(id).split(':')[0].split('@')[0] !== me;
  if (quoted && notBot(quoted)) return [quoted];
  if (!ctx.isGroup && ctx.msg?.key?.fromMe) { const other = ctx.msg.key.remoteJidAlt || ctx.msg.key.remoteJid; if (/@(s\.whatsapp\.net|lid)$/.test(other || '') && notBot(other)) return [other]; }
  return [];
}
export async function challengePlayers(ctx){const message=ctx.msg?.message;const m=message?.ephemeralMessage?.message||message?.viewOnceMessage?.message||message;let raw=m?.extendedTextMessage?.contextInfo?.mentionedJid||[];if(!raw.length)raw=implicitOpponent(ctx,m);if(!raw.length)throw new Error('Mention the player you want to challenge, or swipe-reply to one of their messages. In a private chat with someone, send the command from your own phone there.');const sender=ctx.senderJid||phoneJid(ctx.sender+'@s.whatsapp.net');if(!sender)throw new Error('Your player identity could not be verified.');const players=[sender];for(const id of raw){let pn=phoneJid(id);if(!pn&&/^\d+@lid$/.test(id))pn=phoneJid(await ctx.sock.signalRepository?.lidMapping?.getPNForLID(id));if(!pn)throw new Error('A mentioned player could not be verified.');if(pn===sender)throw new Error('You cannot challenge yourself.');if(players.includes(pn))throw new Error('Duplicate player mention.');players.push(pn);}if(ctx.isGroup){const meta=await ctx.sock.groupMetadata(ctx.jid);const members=new Set();for(const p of meta.participants||[]){let pn=phoneJid(p.phoneNumber)||phoneJid(p.id);if(!pn&&/^\d+@lid$/.test(p.id||''))pn=phoneJid(await ctx.sock.signalRepository?.lidMapping?.getPNForLID(p.id));if(pn)members.add(pn);}if(players.some(p=>!members.has(p)))throw new Error('All players must be current members of this group.');}return players;}
