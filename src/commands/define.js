import {defineWord,formatDefine} from '../fun/define.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(8);
export default {name:'define',aliases:['meaning','dictionary','dict'],category:'Utilities',description:'English word meaning and example',usage:'define <word>',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 8 lookups per minute.');
  let r;try{r=await defineWord(ctx.args.join(' '));}catch{return ctx.reply('Dictionary is busy right now. Try again in a minute.');}
  if(r.error==='BAD')return ctx.reply('Send one English word. Example: define serendipity');
  if(r.error==='NONE')return ctx.reply('No definition found for "'+ctx.args.join(' ').slice(0,40)+'". Check the spelling.');
  return ctx.reply(formatDefine(r));
 }};
