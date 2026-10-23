import {checkGrammar,formatGrammar} from '../fun/grammar.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(5);
export function quotedText(msg){
  const m=msg?.message||{};const w=m.ephemeralMessage?.message||m;
  for(const v of Object.values(w)){const q=v&&typeof v==='object'?v.contextInfo?.quotedMessage:null;if(q)return q.conversation||q.extendedTextMessage?.text||q.imageMessage?.caption||q.videoMessage?.caption||'';}
  return '';
}
export default {name:'grammar',aliases:['fixtext','proofread'],category:'Utilities',description:'Fix grammar and spelling (reply to a message or type text)',usage:'grammar <text>  (or reply to a message)',
 async run(ctx){
  const text=((ctx.args||[]).join(' ').trim())||quotedText(ctx.msg).trim();
  if(!text)return ctx.reply('Send text after the command, or reply to a message with grammar.');
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 5 checks per minute.');
  let r;try{r=await checkGrammar(text);}catch{return ctx.reply('Grammar service is busy. Try again in a minute.');}
  if(r.error==='LIMIT')return ctx.reply('Grammar service is at its limit right now. Try again in a minute.');
  return ctx.reply(formatGrammar(r)+'\n\n_Checked by LanguageTool (the text was sent to their server)._');
 }};
