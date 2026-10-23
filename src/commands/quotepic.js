import {randomQuote,quoteSvg} from '../fun/quotepic.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(4);
export default {name:'quotepic',aliases:['quoteimg','qpic'],category:'Image',description:'Motivational quote as a nice image',usage:'quotepic   (or: quotepic Your own text | Author)',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 4 quote images per minute.');
  let q,a;
  const raw=(ctx.args||[]).join(' ').trim();
  if(raw){const [t,...rest]=raw.split('|');q=t.trim().slice(0,220);a=(rest.join('|').trim()||'').slice(0,40);if(q.length<3)return ctx.reply('Quote too short.');}
  else [q,a]=randomQuote();
  try{
   const {default:sharp}=await import('sharp');
   const png=await sharp(Buffer.from(quoteSvg(q,a?'- '+a:''))).png({compressionLevel:9}).toBuffer();
   return await ctx.sock.sendMessage(ctx.jid,{image:png,caption:'✨'},{quoted:ctx.msg});
  }catch{return ctx.reply('Could not create the image right now. Try again.');}
 }};
