import {pick,parseCustom} from '../fun/wyr.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(4);
export default {name:'wouldyourather',aliases:['wyr'],category:'Games',description:'Would-you-rather question with a vote poll',usage:'wyr   (or: wyr tea or coffee)',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 4 questions per minute.');
  const custom=ctx.args?.length?parseCustom(ctx.args):null;
  if(ctx.args?.length&&!custom)return ctx.reply('Custom format: wyr option one or option two\nOr just send wyr for a random question.');
  const [a,b]=custom||pick();
  try{
   await ctx.sock.sendMessage(ctx.jid,{poll:{name:'🤔 Would you rather...',values:[a,b],selectableCount:1}});
  }catch{
   return ctx.reply(`🤔 *Would you rather...*\n\n🅰️ ${a}\n🅱️ ${b}\n\nReply A or B!`);
  }
 }};
