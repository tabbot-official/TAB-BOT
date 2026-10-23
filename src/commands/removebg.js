import {downloadMediaMessage} from '@whiskeysockets/baileys';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir,removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {makeLimiter,removeBackground} from '../services/publicAi.js';
const limiter=makeLimiter('REMOVEBG','REMOVEBG_PER_HOUR',60);
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<60000);if(a.length>=3)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
export default {name:'removebg',aliases:['rmbg','bgremove'],category:'Image',description:'Remove a photo background (free public AI)',usage:'removebg (send or reply to a photo)',
async run(ctx){
  let dir;
  try{
    const media=findMedia(ctx.msg);
    if(!media||media.type!=='image'||media.animated)return ctx.reply('Send or reply to a static photo with '+config.prefix+'removebg');
    if(Number(media.node.fileLength)>10*1048576)return ctx.reply('Photo is too big (max 10MB).');
    if(!userLimit(ctx.sender))return ctx.reply('Limit: 3 requests per minute. Try again shortly.');
    if(!limiter.ok())return ctx.reply('Background removal is busy or turned off right now. Try again in a minute.');
    await downloadQueue.add(ctx.sender,async()=>{
      dir=await createJobDir();
      const input=path.join(dir,'input');
      const stream=await downloadMediaMessage(media.message,'stream',{}, {logger,reuploadRequest:ctx.sock.updateMediaMessage});
      await saveImageStream(stream,input);
      const jpeg=await sharp(input,{limitInputPixels:16e6,failOn:'error'}).rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true}).jpeg({quality:92}).toBuffer();
      let png;
      try{png=await limiter.run(()=>removeBackground(jpeg,{timeoutMs:40000}));}
      catch(e){logger.warn('removebg failed: '+(e?.message||'error'));return ctx.reply('Background removal failed (free AI service is busy). Try again in a minute.');}
      const out=await sharp(png,{limitInputPixels:4096*4096}).png().toBuffer();
      await ctx.sock.sendMessage(ctx.jid,{document:out,mimetype:'image/png',fileName:'no-background.png',caption:'Background removed (transparent PNG). Processed on a free public AI service (BRIA RMBG on Hugging Face).'},{quoted:ctx.msg});
    });
  }catch(e){logger.warn('removebg error: '+(e?.message||'error'));await ctx.reply('Image processing failed.');}
  finally{await removeJobDir(dir);}
}};
