import {subs} from '../ops/index.js';
import {cities} from '../weather/service.js';
import {parseClock,who} from '../subs/parse.js';
import {fmtClock} from '../subs/dispatch.js';
import {featOn,featReply} from '../config/features.js';
export default {name:'routine',aliases:['automation','autoroutine'],category:'Productivity',
 description:'One command to set your full daily routine: weather + news + word of the day',
 usage:'routine morning <city> [time like 8am] | routine off | routine status',minArgs:1,
 async run(ctx){
  if(!featOn('automation'))return featReply(ctx,'automation');
  const [a,...rest]=ctx.args;const act=a.toLowerCase();const me=who(ctx);
  const kinds=['weatheralert','newsdigest','wordoftheday'];
  const mineAll=subs.forRecipient(ctx.jid).filter(j=>kinds.includes(j.kind)&&j.owner===me);
  if(act==='off'){let n=0;for(const j of mineAll){if(subs.cancel(j.id))n++;}return ctx.reply(n?'✅ Routine off - all '+n+' daily deliveries cancelled for you here.':'You had no routine set here.');}
  if(act==='status'){return ctx.reply(mineAll.length?'Your daily routine here:\n'+mineAll.map(j=>'• '+j.kind+' at '+fmtClock(j.hh,j.mm)).join('\n'):'No routine set. Try: /routine morning Kolkata 8am');}
  if(act!=='morning'&&act!=='set')return ctx.reply('Usage: /routine morning <city> [time] | /routine status | /routine off');
  let timeArg=null;const words=[...rest];
  if(words.length&&/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(words[words.length-1]))timeArg=words.pop();
  const t=parseClock(timeArg,{hh:8,mm:0});if(!t)return ctx.reply('Could not read that time. Try 8am.');
  const city=words.join(' ').trim();if(city.length<2)return ctx.reply('Which city? Example: /routine morning Kolkata 8am');
  let places;try{places=await cities(city);}catch(e){return ctx.reply('Weather lookup failed. Try again later.');}
  if(!places.length)return ctx.reply('City not found. Try "city, country".');
  const place=places[0];
  for(const j of mineAll)subs.cancel(j.id);
  try{
   subs.add({kind:'weatheralert',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm,payload:{place}});
   subs.add({kind:'newsdigest',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm+2>59?0:t.mm+2,payload:{topic:''}});
   subs.add({kind:'wordoftheday',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm+4>59?0:t.mm+4,payload:{}});
  }catch(e){return ctx.reply('Too many subscriptions on the bot right now. Try later.');}
  return ctx.reply('✅ Morning routine set for '+place.name+' at ~'+fmtClock(t.hh,t.mm)+' (IST), in this chat:\n🌤️ weather alert\n🗞️ news digest (India - change with /newsdigest set)\n📖 word of the day\nOff: /routine off');
 }};
