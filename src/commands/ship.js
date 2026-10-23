import {shipScore,verdict,bar,splitNames} from '../fun/ship.js';
const num=(j)=>String(j||'').split('@')[0].split(':')[0];
function ctxInfo(msg){const m=msg.message||{};const w=m.ephemeralMessage?.message||m;for(const v of Object.values(w)){if(v&&typeof v==='object'&&v.contextInfo)return v.contextInfo;}return {};}
export default {name:'ship',aliases:['love','match'],category:'Games',description:'Love compatibility between two people',
 usage:'ship @person1 @person2 | ship @person (with you) | reply ship | ship Name1 & Name2',
 async run(ctx){
  const ci=ctxInfo(ctx.msg);const mentioned=[...new Set((ci.mentionedJid||[]).map(String))];
  let people=[];
  if(mentioned.length>=2)people=mentioned.slice(0,2).map((j)=>({id:num(j),jid:j}));
  else if(mentioned.length===1)people=[{id:num(ctx.senderJid||ctx.sender),jid:ctx.senderJid},{id:num(mentioned[0]),jid:mentioned[0]}];
  else if(ci.participant&&ci.stanzaId)people=[{id:num(ctx.senderJid||ctx.sender),jid:ctx.senderJid},{id:num(ci.participant),jid:ci.participant}];
  if(people.length<2||people[0].id===people[1].id){
   const names=splitNames(ctx.args);
   if(names.length===2&&names[0].toLowerCase()!==names[1].toLowerCase()){const n=shipScore(names[0],names[1]);return ctx.reply(`💘 *${names[0]}* + *${names[1]}*\n${bar(n)} *${n}%*\n${verdict(n)}`);}
   return ctx.reply('Mention two people, mention one, or reply to someone.\nExample: ship @rahul @priya\nOr with names: ship Rahul & Priya');
  }
  const n=shipScore(people[0].id,people[1].id);
  const text=`💘 @${people[0].id} + @${people[1].id}\n${bar(n)} *${n}%*\n${verdict(n)}`;
  return ctx.sock.sendMessage(ctx.jid,{text,mentions:people.map((p)=>p.jid).filter(Boolean)},{quoted:ctx.msg});
 }};
