import {scheduled} from '../ops/index.js';
import config from '../config/config.js';
import {parseReminder,formatWhen} from '../utilities/naturalTime.js';
const PER_USER=10;
const who=(ctx)=>String(ctx.senderJid||ctx.sender||'').split(':')[0].split('@')[0];
const mine=(ctx)=>scheduled.jobs.filter((j)=>j.owner===who(ctx)&&j.state==='waiting');
export default {name:'sm',aliases:['schedulemsg','sendlater'],category:'Tools',description:'Schedule a message for later in this chat',
 usage:'sm 6pm happy birthday | sm tomorrow 9am good morning | sm kal 7:30am message | sm list | sm cancel <id>',minArgs:1,
 async run(ctx){
  const p=config.prefix;const [a,...rest]=ctx.args;const act=a.toLowerCase();
  if(act==='list'){const l=mine(ctx).sort((x,y)=>x.at-y.at);return ctx.reply(l.length?'🗓️ Your scheduled messages:\n'+l.map((j)=>`${j.id}: ${formatWhen(j.at)}${j.recipient===ctx.jid?'':' (other chat)'} - ${j.text.slice(0,60)}`).join('\n')+'\n\nCancel: '+p+'sm cancel <id>':'You have no scheduled messages.');}
  if(act==='cancel'||act==='delete'){const id=rest[0];if(!id)return ctx.reply('Usage: '+p+'sm cancel <id> (see '+p+'sm list)');if(!mine(ctx).some((j)=>j.id===id))return ctx.reply('No scheduled message of yours with that id.');scheduled.cancel(id);return ctx.reply('✅ Scheduled message cancelled.');}
  const r=parseReminder(ctx.args);
  if(!r)return ctx.reply('Tell me when and what. Examples:\n'+p+'sm 30m be there soon\n'+p+'sm 6pm happy birthday!\n'+p+'sm tomorrow 9am good morning\n'+p+'sm kal 7:30am meeting yaad hai?\n'+p+'sm monday 10am team call');
  if(r.error==='min')return ctx.reply('Minimum is 1 minute.');
  if(r.error==='time')return ctx.reply('I could not read the time. Try: 30m, 2h, 6pm, 18:30, tomorrow 9am, monday 10am.');
  if(r.error==='text')return ctx.reply('What should I send? Example: '+p+'sm 6pm happy birthday!');
  if(r.text.length>1000)return ctx.reply('Message: max 1000 characters.');
  if(r.at-Date.now()>90*86400000)return ctx.reply('Max 90 days ahead.');
  if(mine(ctx).length>=PER_USER)return ctx.reply('You already have '+PER_USER+' scheduled messages. Cancel one first ('+p+'sm list).');
  try{const j=scheduled.create(r.text,r.at,ctx.jid,who(ctx));return ctx.reply(`✅ Message scheduled for ${formatWhen(r.at)}\n"${r.text.slice(0,200)}"\nid: ${j.id}\n_It will be sent in this ${ctx.isGroup?'group':'chat'}. Cancel: ${p}sm cancel ${j.id}_`);}
  catch(e){return ctx.reply('Could not schedule: too many scheduled items on the bot right now. Try later.');}
 }};
