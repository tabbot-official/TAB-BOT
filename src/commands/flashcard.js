import {askAi} from '../ai/providers.js';
import {featOn,featReply} from '../config/features.js';
import {who} from '../subs/parse.js';
const decks=new Map(); // key -> {cards:[{q,a}],i,score:{got,miss},topic}
const key=(ctx)=>ctx.jid+'|'+who(ctx);
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<3600000);if(a.length>=8)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
function parseCards(text){
 const out=[];
 for(const line of String(text||'').split('\n')){
  const m=/^\s*(?:\d+[\).:-]\s*)?Q\s*[:.-]\s*(.+?)\s*(?:\||-{2,}|\bA\s*[:.-])\s*(.+)$/.exec(line);
  if(m)out.push({q:m[1].trim().slice(0,200),a:m[2].trim().slice(0,300)});
 }
 return out.slice(0,12);
}
export default {name:'flashcard',aliases:['flashcards','fc','quizme'],category:'Education',
 description:'Make AI flashcards from any topic or your notes, then quiz yourself',
 usage:'flashcard make <topic or paste notes> | flashcard next | flashcard show | flashcard got | flashcard miss | flashcard score | flashcard stop',minArgs:1,
 async run(ctx){
  if(!featOn('flashcard'))return featReply(ctx,'flashcard');
  const [a,...rest]=ctx.args;const act=a.toLowerCase();const k=key(ctx);const d=decks.get(k);
  if(act==='make'||act==='create'){
   const src=rest.join(' ').trim();
   if(src.length<3)return ctx.reply('Give a topic or paste notes. Example: /flashcard make photosynthesis class 10');
   if(!userLimit(who(ctx)))return ctx.reply('Limit: 8 decks per hour. Try later.');
   const prompt='Create 8 short study flashcards about: '+src.slice(0,3000)+'\nFormat, one per line, exactly: Q: <question> | A: <short answer>\nSimple English, exam-style, no extra text.';
   let cards=[];
   try{const r=await askAi(prompt);cards=parseCards(r.text);}catch(e){return ctx.reply('The AI service is busy. Try again in a minute.');}
   if(cards.length<3)return ctx.reply('Could not build cards from that. Try a clearer topic or paste real notes.');
   decks.set(k,{cards,i:0,score:{got:0,miss:0},topic:src.slice(0,40)});
   return ctx.reply('🃏 Deck ready: '+cards.length+' cards on "'+src.slice(0,40)+'".\n/flashcard next - see question\n/flashcard show - reveal answer\n/flashcard got / miss - mark yourself');
  }
  if(act==='next'){
   if(!d)return ctx.reply('No deck yet. Make one: /flashcard make <topic>');
   if(d.i>=d.cards.length)return ctx.reply('Deck finished! Score: '+d.score.got+' got, '+d.score.miss+' missed. New deck: /flashcard make <topic>');
   return ctx.reply('❓ Card '+(d.i+1)+'/'+d.cards.length+':\n'+d.cards[d.i].q+'\n\n(think, then /flashcard show)');
  }
  if(act==='show'||act==='reveal'){
   if(!d||d.i>=d.cards.length)return ctx.reply('Nothing to reveal. /flashcard next first.');
   return ctx.reply('💡 '+d.cards[d.i].a+'\n\nMark: /flashcard got or /flashcard miss');
  }
  if(act==='got'||act==='miss'){
   if(!d||d.i>=d.cards.length)return ctx.reply('No active card. /flashcard next first.');
   d.score[act==='got'?'got':'miss']++;d.i++;
   if(d.i>=d.cards.length)return ctx.reply('🏁 Deck done! Score: '+d.score.got+'/'+d.cards.length+' correct. Make another: /flashcard make <topic>');
   return ctx.reply((act==='got'?'✅':'❌')+' Noted. Next: /flashcard next');
  }
  if(act==='score'){return ctx.reply(d?'Score on "'+d.topic+'": '+d.score.got+' got, '+d.score.miss+' missed, card '+Math.min(d.i+1,d.cards.length)+'/'+d.cards.length:'No deck yet.');}
  if(act==='stop'){decks.delete(k);return ctx.reply('Deck cleared.');}
  return ctx.reply('Usage: /flashcard make <topic> | /flashcard next | /flashcard show | /flashcard got | /flashcard miss | /flashcard score');
 }};
