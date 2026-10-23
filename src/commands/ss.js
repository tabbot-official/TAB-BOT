import {normalizeUrl,takeScreenshot,SsError} from '../fun/screenshot.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(3);let busy=0;
export default {name:'ss',aliases:['screenshot','webss'],category:'Tools',description:'Screenshot of a website',usage:'ss <website link>',minArgs:1,
 async run(ctx){
  let url;try{url=normalizeUrl(ctx.args[0]);}catch(e){return ctx.reply(e instanceof SsError?e.message:'Invalid link.');}
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 3 screenshots per minute.');
  if(busy>=2)return ctx.reply('Busy with other screenshots. Try again in a moment.');
  busy++;
  try{
   const png=await takeScreenshot(url);
   await ctx.sock.sendMessage(ctx.jid,{image:png,caption:'🌐 '+url.slice(0,200)+'\n_Screenshot taken by a third-party service (thum.io); the link was sent to it._'},{quoted:ctx.msg});
  }catch(e){return ctx.reply(e instanceof SsError&&e.code==='SERVICE'?'Could not take the screenshot right now (the site may block bots, or the free service is busy). Try again later.':'Could not take the screenshot. Try again.');}
  finally{busy--;}
 }};
