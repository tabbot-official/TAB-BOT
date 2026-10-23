import {ifscLookup,formatIfsc} from '../fun/india.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(8);
export default {name:'ifsc',aliases:['bankbranch'],category:'Utilities',description:'Bank branch details from an IFSC code',usage:'ifsc SBIN0000001',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 8 lookups per minute.');
  let r;try{r=await ifscLookup(ctx.args[0]);}catch{return ctx.reply('IFSC service is busy. Try again in a minute.');}
  if(r.error==='BAD')return ctx.reply('An IFSC has 11 characters, like SBIN0000001.');
  if(r.error==='NONE')return ctx.reply('No branch found for that IFSC.');
  return ctx.reply(formatIfsc(r));
 }};
