import {startGame,endGame,getGame,topScores,play,TURN_MS} from '../fun/wordchain.js';
const tag=(id)=>'@'+id;
const jidOf=(id)=>id+'@s.whatsapp.net';
export function board(r){
  if(!r.ranking.length)return 'No words were played.';
  return r.ranking.slice(0,5).map(([u,p],i)=>`${['🥇','🥈','🥉','4.','5.'][i]} ${tag(u)} - ${p} pts`).join('\n');
}
export function summary(r,timedOut){
  return `🏁 *Word Chain over*${timedOut?' (nobody answered in '+TURN_MS/1000+'s)':''}\nWords played: ${r.moves}\n${board(r)}${r.survivor?`\n⭐ ${tag(r.survivor)} got +5 for the last word`:''}`;
}
const mentionsOf=(r)=>[...new Set([...r.ranking.map(([u])=>u),r.survivor].filter(Boolean))].map(jidOf);
export default {name:'wordchain',aliases:['wc','shabdkhel'],category:'Games',description:'Group word chain game: next word starts with the last letter',usage:'wordchain start | stop | top',
 async run(ctx){
  const sub=(ctx.args[0]||'').toLowerCase();
  if(!ctx.isGroup)return ctx.reply('Word Chain is a group game. Use it inside a group.');
  if(sub==='top'){const t=topScores(ctx.jid);return t.length?ctx.sock.sendMessage(ctx.jid,{text:'🏆 *Word Chain - group leaderboard*\n'+t.map(([u,p],i)=>`${i+1}. ${tag(u)} - ${p} pts`).join('\n'),mentions:t.map(([u])=>jidOf(u))},{quoted:ctx.msg}):ctx.reply('No Word Chain scores in this group yet. Start one: wordchain start');}
  if(sub==='stop'||sub==='end'){
   const g=getGame(ctx.jid);if(!g)return ctx.reply('No Word Chain is running. Start one: wordchain start');
   if(!ctx.isOwner&&g.starter!==String(ctx.sender))return ctx.reply('Only the person who started the game (or the owner) can stop it.');
   const r=endGame(ctx.jid);return ctx.sock.sendMessage(ctx.jid,{text:summary(r,false),mentions:mentionsOf(r)},{quoted:ctx.msg});
  }
  if(getGame(ctx.jid))return ctx.reply('A Word Chain is already running here. Current word: *'+getGame(ctx.jid).word+'*');
  const g=startGame(ctx.jid,String(ctx.sender),{onTimeout:async(r)=>{await ctx.sock.sendMessage(ctx.jid,{text:summary(r,true),mentions:mentionsOf(r)});}});
  return ctx.reply(`🔤 *Word Chain started!*\nFirst word: *${g.word}*\nSend a word that starts with *${g.word.slice(-1).toUpperCase()}* (just type it, no command).\nRules: real English words, 3+ letters, no repeats, you cannot play twice in a row. ${TURN_MS/1000}s with no answer ends the game.\nPoints = word length. Stop: wordchain stop`);
 }};
/** Called by the message handler for plain group messages. Never throws. */
export async function wordchainPlain({sock,msg,jid,sender,text}){
  try{
   if(!getGame(jid))return;
   const w=String(text||'').trim();if(!/^[A-Za-z]{3,20}$/.test(w))return;
   const r=await play(jid,String(sender),w);
   if(r.skip)return;
   const emoji=r.ok?'✅':'❌';
   await sock.sendMessage(jid,{react:{text:emoji,key:msg.key}});
   if(!r.ok&&r.reason==='TURN')await sock.sendMessage(jid,{text:'Let someone else play this one.'},{quoted:msg});
  }catch{/* game chatter must never break the bot */}
}
