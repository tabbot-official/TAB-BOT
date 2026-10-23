import {pickRoast} from '../fun/roast.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(4),lastIdx=new Map();
export default {name:'roastme',aliases:['roast'],category:'Games',description:'A light, friendly roast (only for you)',usage:'roastme',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Easy! Even roasts need a cooldown. Try again in a minute.');
  const m=ctx.msg?.message||{};const w=m.ephemeralMessage?.message||m;let ci={};for(const v of Object.values(w)){if(v&&typeof v==='object'&&v.contextInfo){ci=v.contextInfo;break;}}
  const others=(ci.mentionedJid||[]).length>0||Boolean(ci.participant&&ci.stanzaId);
  const prefix=others?'I only roast whoever asks for it (no roasting others). So, you:\n\n':'';
  let r=pickRoast(Math.random()),tries=0;while(r===lastIdx.get(ctx.sender)&&tries++<5)r=pickRoast(Math.random());
  lastIdx.set(ctx.sender,r);if(lastIdx.size>2000)lastIdx.clear();
  return ctx.reply('🔥 '+prefix+r+'\n\n_Just for fun, love you 😄_');
 }};
