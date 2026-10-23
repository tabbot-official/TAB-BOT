import {createMailbox,listInbox,readMail,findCodes,getSession,setSession,dropSession} from '../fun/tempmail.js';
import {makeRate} from '../fun/limiter.js';
const createRate=makeRate(3,3600000),readRate=makeRate(12);
const WARN='⚠️ Anyone who knows this address can read its mail. Do not use it for anything important. Mailbox lasts only a short while.';
export default {name:'tempmail',aliases:['tmail','tempemail'],category:'Tools',description:'Temporary email address with inbox (no sending)',usage:'tempmail | tempmail inbox | tempmail read <n> | tempmail new | tempmail delete',
 async run(ctx){
  const u=String(ctx.sender),sub=(ctx.args[0]||'').toLowerCase();
  const make=async()=>{
   if(!createRate(u))return ctx.reply('You can create 3 temp mailboxes per hour. Use your current one: tempmail inbox');
   let s;try{s=await createMailbox();}catch{return ctx.reply('All temp mail services are busy right now. Try again in a few minutes.');}
   setSession(u,s);return ctx.reply(`📧 *Your temp email*\n${s.address}\n\nUse it to sign up, then check mail with: tempmail inbox\n${WARN}`);
  };
  if(sub==='new')return make();
  if(sub==='delete'||sub==='del')return ctx.reply(dropSession(u)?'🗑️ Temp mailbox forgotten. Make a new one with: tempmail new':'You have no temp mailbox.');
  const s=getSession(u);
  if(!sub){return s?ctx.reply(`📧 Your temp email:\n${s.address}\nCheck mail: tempmail inbox\n${WARN}`):make();}
  if(!s)return ctx.reply('You have no temp mailbox yet. Create one: tempmail');
  if(!readRate(u))return ctx.reply('Slow down - max 12 inbox checks per minute.');
  try{
   if(sub==='inbox'||sub==='check'||sub==='refresh'){
    const l=await listInbox(s);
    if(!l.length)return ctx.reply(`📭 Inbox is empty for ${s.address}\nMail can take up to a minute. Try again shortly.`);
    const codes=l.slice(0,5).map((m)=>findCodes(m.subject+' '+m.preview)[0]);
    return ctx.reply(`📬 *Inbox - ${s.address}*\n\n`+l.slice(0,8).map((m,i)=>`${i+1}. *${m.subject.slice(0,70)}*\n   from ${m.from.slice(0,50)}${codes[i]?`\n   🔑 code: ${codes[i]}`:''}`).join('\n\n')+'\n\nRead one: tempmail read <number>');
   }
   if(sub==='read'||sub==='open'){
    const n=parseInt(ctx.args[1],10);const l=await listInbox(s);
    if(!(n>=1&&n<=l.length))return ctx.reply('Pick a mail number from: tempmail inbox');
    const m=await readMail(s,l[n-1].id);const codes=findCodes(m.subject+' '+m.body);
    const body=m.body.length>1500?m.body.slice(0,1500)+'…':m.body;
    return ctx.reply(`✉️ *${m.subject.slice(0,100)}*\nFrom: ${m.from}\n${codes.length?'🔑 Code: '+codes.join(', ')+'\n':''}\n${body||'(empty message)'}`);
   }
   return ctx.reply('Use: tempmail | tempmail inbox | tempmail read <n> | tempmail new | tempmail delete');
  }catch{return ctx.reply('Could not reach the mail service right now. Try again in a minute.');}
 }};
