import {subs,habits} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
import {parseClock,who} from '../subs/parse.js';
import {fmtClock} from '../subs/dispatch.js';
export default {name:'habit',aliases:['habits'],category:'Productivity',
 description:'Track daily habits with streaks and a daily reminder ping',
 usage:'habit add <name> [time like 7am] | habit done <name> | habit list | habit remove <name>',minArgs:1,
 async run(ctx){
  if(!featOn('habit'))return featReply(ctx,'habit');
  const [a,...rest]=ctx.args;const act=a.toLowerCase();const me=who(ctx);const name=rest.join(' ').trim();
  if(act==='list'){const l=habits.list(me);return ctx.reply(l.length?'✅ Your habits:\n'+l.map(h=>'• '+h.name+' - streak '+h.streak+' (best '+(h.best||h.streak)+'), ping '+fmtClock(h.hh,h.mm)).join('\n'):'No habits yet. Add one: /habit add Gym 7am');}
  if(act==='add'){
   let timeArg=null;const words=[...rest];
   if(words.length&&/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(words[words.length-1]))timeArg=words.pop();
   const t=parseClock(timeArg,{hh:7,mm:0});if(!t)return ctx.reply('Could not read that time. Try 7am.');
   const hname=words.join(' ').trim();if(hname.length<2||hname.length>40)return ctx.reply('Habit name: 2-40 characters.');
   if(habits.find(me,hname))return ctx.reply('You already track "'+hname+'".');
   if(habits.list(me).length>=10)return ctx.reply('Max 10 habits per person.');
   let job;try{job=subs.add({kind:'habit',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm,payload:{name:hname}});}catch(e){return ctx.reply('Too many subscriptions on the bot right now. Try later.');}
   habits.add({owner:me,name:hname,hh:t.hh,mm:t.mm,subId:job.id,streak:0,best:0,lastDone:null});
   return ctx.reply('✅ Habit added: "'+hname+'" - daily ping at '+fmtClock(t.hh,t.mm)+' (IST).\nWhen done: /habit done '+hname);
  }
  if(act==='done'){
   if(!name)return ctx.reply('Which habit? /habit done <name>');
   const r=habits.done(me,name);if(!r)return ctx.reply('No habit called "'+name.slice(0,40)+'". List: /habit list');
   if(r.already)return ctx.reply('Already marked done today. Streak: '+r.habit.streak+' days.');
   return ctx.reply('🔥 "'+r.habit.name+'" done! Streak: '+r.habit.streak+' day'+(r.habit.streak===1?'':'s')+' (best: '+r.habit.best+').');
  }
  if(act==='remove'||act==='delete'){
   if(!name)return ctx.reply('Which habit? /habit remove <name>');
   const h=habits.find(me,name);if(!h)return ctx.reply('No habit called "'+name.slice(0,40)+'".');
   if(h.subId)subs.cancel(h.subId);habits.remove(me,name);
   return ctx.reply('🗑️ Habit "'+h.name+'" removed.');
  }
  return ctx.reply('Usage: /habit add <name> [time] | /habit done <name> | /habit list | /habit remove <name>');
 }};
