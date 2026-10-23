import {userMemory} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
export default {name:'remember',aliases:['myinfo','forget'],category:'AI',
 description:'Tab remembers things about you - view, add, or wipe your memory',
 usage:'remember <fact to save> | myinfo (see your memory) | forget (wipe everything)',
 async run(ctx){
  if(!featOn('memory'))return featReply(ctx,'memory');
  const me=String(ctx.senderJid||ctx.sender||'').split(':')[0].split('@')[0];
  const sub=ctx.commandName==='myinfo'?'myinfo':ctx.commandName==='forget'?'forget':(ctx.args[0]||'').toLowerCase();
  if(ctx.commandName==='forget'||sub==='forget'||sub==='wipe'){
   return ctx.reply(userMemory.wipe(me)?'🧹 Done - I forgot everything about you.':'I had nothing saved about you.');
  }
  if(ctx.commandName==='myinfo'||sub==='myinfo'||sub==='list'){
   const f=userMemory.facts(me);
   return ctx.reply(f.length?'🧠 *What I remember about you:*\n'+f.map((x,i)=>(i+1)+'. '+x).join('\n')+'\n\nWipe all: /forget':'I do not remember anything about you yet. Teach me: /remember I love biryani');
  }
  const fact=ctx.args.join(' ').trim();
  if(!fact)return ctx.reply('Usage: /remember <something about you>\nExample: /remember my birthday is 17 May\nSee memory: /myinfo - Wipe: /forget');
  return ctx.reply(userMemory.addFact(me,fact)?'🧠 Noted, I will remember that.':'I already know that.');
 }};
