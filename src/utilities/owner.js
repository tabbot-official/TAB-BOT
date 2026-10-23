import {isSudo} from '../permissions/index.js';
/** PN and LID are different namespaces. Strip device suffixes, never compare bare digits. */
const typedJid=value=>typeof value==='string'&&/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(value)?value.replace(/:\d+@/,'@'):null;
export function selfChat(ctx){
 if(!ctx.isOwner||ctx.isGroup||!ctx.msg?.key?.fromMe)return false;
 const own=new Set([typedJid(ctx.sock?.user?.id),typedJid(ctx.sock?.user?.lid),typedJid(ctx.sock?.pairedOwner?.id),typedJid(ctx.sock?.pairedOwner?.lid)].filter(Boolean));
 const destination=typedJid(ctx.jid);
 if(destination&&own.has(destination))return true;
 // Only use the provider's alternate destination for this very same message/chat.
 if(ctx.msg.key.remoteJid!==ctx.jid)return false;
 const alternate=typedJid(ctx.msg.key.remoteJidAlt);
 return !!alternate&&own.has(alternate);
}
export function privateOperator(ctx){return selfChat(ctx)||(!ctx.isGroup&&isSudo(ctx)&&!ctx.msg?.key?.fromMe&&ctx.msg?.key?.remoteJid===ctx.jid&&/^\d+@(lid|s\.whatsapp\.net)$/.test(ctx.jid));}

/** Destination comes only from the authenticated socket, never command args or disk. */
export function ownerChatJid(sock){
 const id=typedJid(sock?.pairedOwner?.id)||typedJid(sock?.user?.id);
 if(!id?.endsWith('@s.whatsapp.net'))throw Error('Authenticated owner self-chat unavailable');
 return id;
}
const privateCommands=new Set(['number','update','system','usage','errors','listsudo','password','remind','truecaller']);
/** Keep operation targets intact, but keep owner-command output out of contact/group chats. */
export function ownerCommandContext(ctx,cmd){
 if(ctx.operator)return ctx; // an operator's owner-command output goes back to their own DM, never to the owner's chat
 if(!cmd.ownerOnly&&cmd.name!=='status')return ctx;
 const to=ownerChatJid(ctx.sock),original=ctx.jid;
 const sock=new Proxy(ctx.sock,{get(target,key){if(key==='sendMessage')return async(jid,body,options)=>{
  if(jid!==original)return target.sendMessage(jid,body,options);
  const clean={...options};delete clean.quoted;
  return target.sendMessage(to,body,clean);
 };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const next={...ctx,sock,reply:content=>ctx.sock.sendMessage(to,{text:content}),commandOrigin:{jid:original,isGroup:ctx.isGroup}};
 if(ctx.isOwner&&privateCommands.has(cmd.name)){
  next.jid=to;next.isGroup=false;
  next.msg={...ctx.msg,key:{...ctx.msg?.key,remoteJid:to,remoteJidAlt:undefined,fromMe:true}};
 }
 return next;
}
