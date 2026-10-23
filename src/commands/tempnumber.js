import {getNumber,getMessages,ageMinutes,COUNTRIES} from '../fun/tempnumber.js';
import {findCodes} from '../fun/tempmail.js';
import {makeRate} from '../fun/limiter.js';
const createRate=makeRate(4,3600000),readRate=makeRate(10);
const sessions=new Map();
const WARN='⚠️ These are PUBLIC numbers: anyone can read every SMS, so never use them for anything important. Big platforms (WhatsApp, Instagram, Telegram, Google...) block these numbers, so codes from them usually will not arrive. Works only for small sites.';
export default {name:'tempnumber',aliases:['tnum','tempnum','fakenumber'],category:'Tools',description:'Public temporary phone number to receive SMS (small sites only)',usage:'tempnumber [country: us ca au de fr nl es se pl nz] | tempnumber inbox | tempnumber new',
 async run(ctx){
  const u=String(ctx.sender),a=(ctx.args||[]).map((x)=>x.toLowerCase()),sub=a[0]||'';
  const s=sessions.get(u);
  if(sub==='inbox'||sub==='check'||sub==='refresh'){
   if(!s)return ctx.reply('You have no number yet. Get one: tempnumber');
   if(!readRate(u))return ctx.reply('Slow down - max 10 checks per minute.');
   let r;try{r=await getMessages(s);}catch{return ctx.reply('Could not read messages right now. Try again in a minute, or get another number: tempnumber new');}
   if(!r.messages.length)return ctx.reply(`📭 No SMS on ${s.number} yet.\nWaiting for a message? Try again in 30-60 seconds.`);
   const fresh=r.messages.filter((m)=>ageMinutes(m.when)<=180);
   const list=(fresh.length?fresh:r.messages.slice(0,3)).slice(0,6);
   const note=fresh.length?'':'\n_No recent SMS. These are old messages sent to this public number. Your code has not arrived yet._';
   return ctx.reply(`📬 *SMS on ${s.number}*\n\n`+list.map((m)=>{const c=findCodes(m.text)[0];return `• from *${m.from.slice(0,20)}* (${m.when})\n  ${m.text.slice(0,160)}${c?`\n  🔑 code: ${c}`:''}`;}).join('\n\n')+note);
  }
  const country=(sub&&sub!=='new')?sub:(a[1]||'us');
  if(sub&&sub!=='new'&&!COUNTRIES.includes(sub))return ctx.reply('Use: tempnumber [us|ca|au|de|fr|nl|es|se|pl|nz] | tempnumber inbox | tempnumber new');
  if(s&&!sub)return ctx.reply(`📱 Your temp number: ${s.number}\nCheck SMS: tempnumber inbox\nNew number: tempnumber new\n${WARN}`);
  if(!createRate(u))return ctx.reply('You can get 4 numbers per hour. Use your current one: tempnumber inbox');
  let n;try{n=await getNumber(COUNTRIES.includes(country)?country:'us');}catch{return ctx.reply('No number service is available right now. Try again in a few minutes.');}
  sessions.set(u,n);if(sessions.size>1000)sessions.delete(sessions.keys().next().value);
  return ctx.reply(`📱 *Your temp number*\n${n.number}\n\nUse it on a small site, then check: tempnumber inbox\n${WARN}`);
 }};
