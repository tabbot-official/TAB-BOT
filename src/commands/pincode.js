import {pincodeLookup,formatPincode} from '../fun/india.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(8);
export default {name:'pincode',aliases:['postal','pinlookup'],category:'Utilities',description:'India PIN code details',usage:'pincode 700001',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 8 lookups per minute.');
  let r;try{r=await pincodeLookup(ctx.args[0]);}catch{return ctx.reply('PIN service is busy. Try again in a minute.');}
  if(r.error==='BAD')return ctx.reply('Send a 6-digit Indian PIN code. Example: pincode 700001');
  if(r.error==='NONE')return ctx.reply('No details found for PIN '+ctx.args[0].slice(0,10)+'.');
  return ctx.reply(formatPincode(r));
 }};
