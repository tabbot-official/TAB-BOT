import {downloadMediaMessage} from '@whiskeysockets/baileys';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir,removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {makeLimiter} from '../services/publicAi.js';
const users=new Map();
function userLimit(key,u,max,now=Date.now()){const k=key+':'+u;const a=(users.get(k)||[]).filter(t=>now-t<60000);if(a.length>=max)return false;users.set(k,[...a,now]);if(users.size>5000)users.clear();return true;}
// Shared runner for photo -> (text | image) commands backed by a free public AI service.
export function imageAiCommand({name,aliases=[],description,perMinute=2,perHourDefault=40,maxSide=1024,gpu=false,service,work,format}){
  const ENV=name.toUpperCase();
  const limiter=makeLimiter(ENV,ENV+'_PER_HOUR',perHourDefault);
  return {name,aliases,category:'Image',description,usage:name+' (send or reply to a photo)',
  async run(ctx){
    let dir;
    try{
      const media=findMedia(ctx.msg);
      if(!media||media.type!=='image'||media.animated)return ctx.reply('Send or reply to a photo with '+config.prefix+name);
      if(Number(media.node.fileLength)>10*1048576)return ctx.reply('Photo is too big (max 10MB).');
      if(!userLimit(name,ctx.sender,perMinute))return ctx.reply('Limit: '+perMinute+' requests per minute. Try again shortly.');
      if(!limiter.ok())return ctx.reply('This feature is busy or turned off right now. Try again in a minute.');
      await downloadQueue.add(ctx.sender,async()=>{
        dir=await createJobDir();
        const input=path.join(dir,'input');
        const stream=await downloadMediaMessage(media.message,'stream',{}, {logger,reuploadRequest:ctx.sock.updateMediaMessage});
        await saveImageStream(stream,input);
        const jpeg=await sharp(input,{limitInputPixels:16e6,failOn:'error'}).rotate().resize(maxSide,maxSide,{fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:90}).toBuffer();
        let out;
        try{out=await limiter.run(()=>work(jpeg,{timeoutMs:60000}));}
        catch(e){
          logger.warn(name+' failed: '+(e?.message||'error'));
          if(e?.quota)return ctx.reply('The free AI daily limit for this feature is used up. Try again later (it resets daily).');
          return ctx.reply('Failed (the free AI service is busy). Try again in a minute.');
        }
        const note='\n\n_Processed by a free public AI service ('+service+'). Your photo was sent to it._';
        if(typeof out==='string')return ctx.reply(out.slice(0,3000)+note);
        const png=await sharp(out,{limitInputPixels:4096*4096}).jpeg({quality:92}).toBuffer();
        await ctx.sock.sendMessage(ctx.jid,{image:png,caption:format+' ('+service+'). Photo was processed on a free public AI service.'},{quoted:ctx.msg});
      });
    }catch(e){logger.warn(name+' error: '+(e?.message||'error'));await ctx.reply('Image processing failed.');}
    finally{await removeJobDir(dir);}
  }};
}
