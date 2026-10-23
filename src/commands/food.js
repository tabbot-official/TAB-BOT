import {findFood,formatFood} from '../fun/food.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(5);
export default {name:'food',aliases:['nutrition','barcode'],category:'Utilities',description:'Nutrition info for a packaged food (name or barcode)',usage:'food maggi | food 8901058000290',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 5 lookups per minute.');
  const q=ctx.args.join(' ').trim();let p;
  try{p=await findFood(q);}catch{return ctx.reply('Food database is busy right now. Try again in a minute.');}
  if(!p)return ctx.reply('No product found for "'+q.slice(0,40)+'". Try the brand and product name, or the barcode number.');
  const text=formatFood(p);
  try{if(p.image_front_small_url)return await ctx.sock.sendMessage(ctx.jid,{image:{url:p.image_front_small_url},caption:text},{quoted:ctx.msg});}catch{/* text only */}
  return ctx.reply(text);
 }};
