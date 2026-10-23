import axios from 'axios';
import config from '../config/config.js';
import {esc,memeUrl} from './_memegen.js';
let cache={t:0,ids:[]};const stamps=new Map();
async function templates(){if(Date.now()-cache.t<6*3600e3&&cache.ids.length)return cache.ids;const r=await axios.get('https://api.memegen.link/templates',{timeout:15000,proxy:false,maxRedirects:0});cache={t:Date.now(),ids:r.data.map(x=>x.id)};return cache.ids;}
export default {name:'meme',aliases:['memegen'],category:'Image',description:'Make a meme with top and bottom text',usage:'meme [template] top text | bottom text  (meme list for templates)',minArgs:1,async run(ctx){
 const p=config.prefix;const raw=ctx.args.join(' ');
 const now=Date.now();const last=(stamps.get(ctx.sender)||[]).filter(t=>now-t<60000);if(last.length>=4)return ctx.reply('Slow down - max 4 memes per minute.');
 let ids;try{ids=await templates();}catch{return ctx.reply('Meme service is busy. Try again in a minute.');}
 if(/^(list|templates)$/i.test(raw)){const pop=['drake','doge','fry','success','buzz','rollsafe','spongebob','stonks','pigeon','fine','cmm','mini-keanu'].filter(x=>ids.includes(x));return ctx.reply('Popular templates: '+pop.join(', ')+'\nTotal '+ids.length+'. Use: '+p+'meme drake top | bottom\nOr just '+p+'meme top | bottom for a random one.');}
 let id=null,rest=raw;const first=ctx.args[0].toLowerCase();if(ids.includes(first)){id=first;rest=ctx.args.slice(1).join(' ');}
 if(!id)id=['drake','doge','fry','success','buzz','rollsafe','spongebob','stonks','fine','cmm'].filter(x=>ids.includes(x)).sort(()=>Math.random()-.5)[0]||ids[0];
 const [top,bottom]=rest.split('|').map(s=>s.trim());
 if(!top&&!bottom)return ctx.reply('Usage: '+p+'meme [template] top text | bottom text');
 if((top||'').length>80||(bottom||'').length>80)return ctx.reply('Each line: max 80 characters.');
 try{const url=memeUrl(id,top||' ',bottom||' ');const r=await axios.get(url,{responseType:'arraybuffer',timeout:25000,maxContentLength:3e6,proxy:false,maxRedirects:0});
  last.push(now);stamps.set(ctx.sender,last);if(stamps.size>5000)stamps.clear();
  await ctx.sock.sendMessage(ctx.jid,{image:Buffer.from(r.data),caption:'Template: '+id+' (memegen.link)'},{quoted:ctx.msg});
 }catch{return ctx.reply('Could not make the meme right now. Try again or use another template ('+p+'meme list).');}
}};
