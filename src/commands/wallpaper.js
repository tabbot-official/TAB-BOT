import {findWallpaper} from '../fun/wallpaper.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(4);
export default {name:'wallpaper',aliases:['wall','wp'],category:'Image',description:'HD wallpapers by topic (safe-for-work)',usage:'wallpaper <topic>  e.g. wallpaper mountains',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 4 wallpapers per minute.');
  const q=ctx.args.join(' ').trim();
  let w;try{w=await findWallpaper(q);}catch{return ctx.reply('Wallpaper service is busy. Try again in a minute.');}
  if(!w)return ctx.reply('No wallpapers found for "'+q.slice(0,40)+'". Try a simpler word like nature, space, cars.');
  try{await ctx.sock.sendMessage(ctx.jid,{image:{url:w.url},caption:`🖼️ ${q.slice(0,40)} - ${w.resolution}\n${w.page}`},{quoted:ctx.msg});}
  catch{return ctx.reply('Could not send that wallpaper. Try again.');}
 }};
