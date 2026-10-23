import {reminders} from '../ops/index.js';
import config from '../config/config.js';
import {parseReminder,formatWhen} from '../utilities/naturalTime.js';
import {subs} from '../ops/index.js';
import {fmtClock} from '../subs/dispatch.js';
const PER_USER=5;
const who=(ctx)=>String(ctx.senderJid||ctx.sender||'').split(':')[0].split('@')[0];
const mine=(ctx)=>reminders.jobs.filter((j)=>j.owner===who(ctx)&&j.state==='waiting');
export default {name:'remind',aliases:['reminder','remindme'],category:'Utilities',description:'Set one-time or recurring reminders in plain words, English or Hinglish',
 usage:'remind 30m drink water | remind 6pm call mom | remind roz 7am gym (daily) | remind har friday 6pm report | remind list | remind recurring | remind cancel <id>',minArgs:1,
 async run(ctx){
  const p=config.prefix;const [a,...rest]=ctx.args;const act=a.toLowerCase();
  if(act==='list'){const l=mine(ctx).sort((x,y)=>x.at-y.at);return ctx.reply(l.length?'⏰ Your reminders:\n'+l.map((j)=>`${j.id}: ${formatWhen(j.at)} - ${j.text.slice(0,80)}`).join('\n')+'\n\nCancel: '+p+'remind cancel <id>':'You have no active reminders.');}
  if(act==='cancel'||act==='delete'){const id=rest[0];if(!id)return ctx.reply('Usage: '+p+'remind cancel <id> (see '+p+'remind list)');if(!mine(ctx).some((j)=>j.id===id))return ctx.reply('No reminder of yours with that id.');reminders.cancel(id);return ctx.reply('✅ Reminder cancelled.');}
  // Recurring: "roz 7am gym", "daily 6pm water", "har monday 9am meeting", "every friday 6pm report"
  const DAYS={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
  const rec=/^(roz|daily|every\s+day|har\s+roz|har\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b\s*/i.exec(ctx.args.join(' '));
  if(rec){
   const rest1=ctx.args.join(' ').slice(rec[0].length);
   const dayName=(rec[2]||rec[3]||'').toLowerCase();
   const weekdays=dayName?[DAYS[dayName]]:null;
   const r2=parseReminder(rest1.split(' '));
   if(!r2||r2.error==='time')return ctx.reply('Tell me the time too. Examples:\n'+p+'remind roz 7am gym\n'+p+'remind har friday 6pm report\n'+p+'remind roz shaam 7 baje dinner');
   if(r2.error||!r2.text)return ctx.reply('What should I repeat? Example: '+p+'remind roz 7am gym');
   const d=new Date(r2.at);const hh=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}).format(d));const mm=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',minute:'2-digit'}).format(d));
   const mySubs=subs.forRecipient(to).filter(j=>j.kind==='reminder'&&j.owner===who(ctx));
   if(mySubs.length>=3)return ctx.reply('You already have 3 recurring reminders here. Cancel one first: '+p+'remind recurring');
   try{subs.add({kind:'reminder',recipient:to,owner:who(ctx),hh,mm,weekdays,payload:{text:(ctx.isGroup?'@'+who(ctx)+': ':'')+r2.text}});}catch(e){return ctx.reply('Too many subscriptions on the bot right now. Try later.');}
   return ctx.reply('\u2705 Recurring reminder set: '+(weekdays?'every '+dayName:'every day')+' at '+fmtClock(hh,mm)+' (IST)\n"'+r2.text+'"\nManage: '+p+'remind recurring');
  }
  if(act==='recurring'){
   const mySubs=subs.forRecipient(ctx.jid).filter(j=>j.kind==='reminder'&&j.owner===who(ctx));
   if(!rest[0])return ctx.reply(mySubs.length?'\u23f0 Your recurring reminders here:\n'+mySubs.map(j=>j.id+': '+(j.weekdays?'weekly':'daily')+' '+fmtClock(j.hh,j.mm)+' - '+j.payload.text.slice(0,50)).join('\n')+'\nCancel: '+p+'remind recurring cancel <id>':'No recurring reminders here. Set one: '+p+'remind roz 7am gym');
   if(rest[0]==='cancel'&&rest[1])return ctx.reply(subs.cancel(rest[1],ctx.jid)?'\u2705 Recurring reminder cancelled.':'No recurring reminder of yours with that id.');
   return ctx.reply('Usage: '+p+'remind recurring | '+p+'remind recurring cancel <id>');
  }
  const r=parseReminder(ctx.args);
  if(!r)return ctx.reply('Tell me when and what. Examples:\n'+p+'remind 30m drink water\n'+p+'remind 6pm call mom\n'+p+'remind tomorrow 9am gym\n'+p+'remind monday 10am meeting');
  if(r.error==='min')return ctx.reply('Minimum is 1 minute.');
  if(r.error==='time')return ctx.reply('I could not read the time. Try: 30m, 2h, 6pm, 18:30, tomorrow 9am, monday 10am.');
  if(r.error==='text')return ctx.reply('What should I remind you about? Example: '+p+'remind 6pm call mom');
  if(r.text.length>300)return ctx.reply('Reminder text: max 300 characters.');
  if(r.at-Date.now()>90*86400000)return ctx.reply('Max 90 days ahead.');
  if(mine(ctx).length>=PER_USER)return ctx.reply('You already have '+PER_USER+' active reminders. Cancel one first ('+p+'remind list).');
  const to=ctx.jid;const text=ctx.isGroup?`@${who(ctx)}: ${r.text}`:r.text;
  try{const j=reminders.create(text,r.at,to,who(ctx));return ctx.reply(`✅ Reminder set for ${formatWhen(r.at)}\n"${r.text}"\nid: ${j.id}`+(ctx.isGroup?'\n_It will be posted in this group._':''));}
  catch(e){return ctx.reply('Could not save the reminder: it may be too many reminders on the bot right now. Try again later.');}
 }};
