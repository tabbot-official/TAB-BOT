import {subs} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
import {wordForDay} from '../subs/words.js';
import {parseClock,who} from '../subs/parse.js';
import {fmtClock} from '../subs/dispatch.js';
export default {name:'wordoftheday',aliases:['wotd','dailyword'],category:'Education',
 description:'One useful English word with meaning and example, every day',
 usage:'wordoftheday (today\'s word) | wordoftheday on [9am] | wordoftheday off',
 async run(ctx){
  if(!featOn('wordoftheday'))return featReply(ctx,'wordoftheday');
  const me=who(ctx);const a=(ctx.args[0]||'').toLowerCase();
  const mineList=subs.forRecipient(ctx.jid).filter(j=>j.kind==='wordoftheday'&&j.owner===me);
  if(a==='off'||a==='stop'){let n=0;for(const j of mineList){if(subs.cancel(j.id))n++;}return ctx.reply(n?'✅ Word of the day turned off for you here.':'It was not on for you here.');}
  if(a==='on'||a==='start'){
   const t=parseClock(ctx.args[1],{hh:9,mm:0});if(!t)return ctx.reply('Could not read that time. Try 9am.');
   for(const j of mineList)subs.cancel(j.id);
   try{subs.add({kind:'wordoftheday',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm,payload:{}});}catch(e){return ctx.reply('Too many subscriptions on the bot right now. Try later.');}
   return ctx.reply('✅ Word of the day on: daily at '+fmtClock(t.hh,t.mm)+' (IST) in this chat.\nTurn off: /wordoftheday off');
  }
  return ctx.reply(wordForDay()+'\n\nDaily delivery: /wordoftheday on [time]');
 }};
