import axios from 'axios';
import {safeUrl} from './_memegen.js';
const stamps=new Map();
export default {name:'short',aliases:['shorten','tinyurl'],category:'Tools',description:'Shorten a long link',usage:'short <https://long-link>',minArgs:1,async run(ctx){
 const u=safeUrl(ctx.args[0]);if(!u)return ctx.reply('Send a valid public http(s) link. Example: short https://example.com/very/long/page');
 const now=Date.now();const last=(stamps.get(ctx.sender)||[]).filter(t=>now-t<60000);if(last.length>=5)return ctx.reply('Slow down - max 5 links per minute.');
 try{const r=await axios.get('https://tinyurl.com/api-create.php',{params:{url:u},timeout:15000,proxy:false,maxRedirects:0,responseType:'text'});
  const s=String(r.data).trim();if(!/^https:\/\/tinyurl\.com\/[\w-]+$/.test(s))throw new Error('bad');
  last.push(now);stamps.set(ctx.sender,last);if(stamps.size>5000)stamps.clear();
  return ctx.reply('🔗 '+s+'\n_Shortened with TinyURL. The original link was sent to them._');
 }catch{return ctx.reply('Link shortener is busy right now. Try again in a minute.');}
}};
