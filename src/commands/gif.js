import {searchGif} from '../fun/gif.js';
const hits=new Map();
const ok=(u)=>{const n=Date.now();const a=(hits.get(u)||[]).filter(t=>n-t<60000);if(a.length>=5)return false;hits.set(u,[...a,n]);if(hits.size>3000)hits.clear();return true;};
export default {name:'gif',aliases:['giphy'],category:'Tools',description:'Search and send a GIF',usage:'gif <search text>',minArgs:1,
 async run(ctx){
  if(!ok(ctx.sender))return ctx.reply('Slow down - max 5 GIF searches per minute.');
  const q=(ctx.args||[]).join(' ').trim();
  let r;try{r=await searchGif(q);}catch{return ctx.reply('GIF service is busy. Try again in a minute.');}
  if(r.error==='NO_KEY')return ctx.reply('GIF search is not set up yet. The owner needs to add GIPHY_API_KEY (free key from developers.giphy.com) to the bot settings.');
  if(r.error==='BAD_KEY')return ctx.reply('GIF search key was rejected. The owner should check GIPHY_API_KEY.');
  if(r.error==='NONE')return ctx.reply('No GIFs found for "'+q.slice(0,50)+'". Try another word.');
  try{await ctx.sock.sendMessage(ctx.jid,{video:{url:r.url},gifPlayback:true,caption:'via GIPHY'},{quoted:ctx.msg});}
  catch{return ctx.reply('Could not send that GIF. Try again.');}
 }};
