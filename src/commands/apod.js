import {getApod,formatApod} from '../fun/apod.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(3);
export default {name:'apod',aliases:['nasa','spacepic'],category:'Utilities',description:'NASA Astronomy Picture of the Day',usage:'apod',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 3 per minute.');
  let a;try{a=await getApod();}catch{return ctx.reply('NASA is not responding right now. Try again later.');}
  if(a.error==='LIMIT')return ctx.reply('NASA daily request limit reached. Try again later (the owner can add NASA_API_KEY for a higher limit).');
  const text=formatApod(a);
  if(a.type==='image'){try{return await ctx.sock.sendMessage(ctx.jid,{image:{url:a.hd||a.url},caption:text},{quoted:ctx.msg});}catch{try{return await ctx.sock.sendMessage(ctx.jid,{image:{url:a.url},caption:text},{quoted:ctx.msg});}catch{/* text */}}}
  return ctx.reply(text+(a.url?'\n'+a.url:''));
 }};
