import {downloadMediaMessage} from '@whiskeysockets/baileys';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir,removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {makeLimiter,ocrImage} from '../services/publicAi.js';
import {cohereVision} from '../ai/providers.js';
const limiter=makeLimiter('OCR','OCR_PER_HOUR',40);
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<60000);if(a.length>=2)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
export default {name:'ocr',aliases:['readtext','img2text'],category:'Image',description:'Read text from a photo (free public AI)',usage:'ocr (send or reply to a photo)',
async run(ctx){
  let dir;
  try{
    const media=findMedia(ctx.msg);
    if(!media||media.type!=='image'||media.animated)return ctx.reply('Send or reply to a photo with '+config.prefix+'ocr');
    if(Number(media.node.fileLength)>10*1048576)return ctx.reply('Photo is too big (max 10MB).');
    if(!userLimit(ctx.sender))return ctx.reply('Limit: 2 requests per minute. Try again shortly.');
    if(!limiter.ok())return ctx.reply('Text reading is busy or turned off right now. Try again in a minute.');
    await downloadQueue.add(ctx.sender,async()=>{
      dir=await createJobDir();
      const input=path.join(dir,'input');
      const stream=await downloadMediaMessage(media.message,'stream',{}, {logger,reuploadRequest:ctx.sock.updateMediaMessage});
      await saveImageStream(stream,input);
      const jpeg=await sharp(input,{limitInputPixels:16e6,failOn:'error'}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:90}).toBuffer();
      let text;
      try{
        try{text=await limiter.run(()=>cohereVision(jpeg,'Read ALL text in this image exactly as written, preserving line breaks. If there is no text, reply with nothing.',{timeoutMs:60000}).then(r=>r.text));}
        catch(e1){logger.warn('ocr cohere failed, trying HF: '+(e1?.message||'error'));text=await limiter.run(()=>ocrImage(jpeg,{timeoutMs:60000}));}
      }
      catch(e){logger.warn('ocr failed: '+(e?.message||'error'));return ctx.reply('Text reading failed (free AI service is busy). Try again in a minute.');}
      if(!text)return ctx.reply('No text found in that photo.');
      await ctx.reply(text.slice(0,3500)+'\n\n_Read by AI vision (free tier). Your photo was sent to a free AI service._');
    });
  }catch(e){logger.warn('ocr error: '+(e?.message||'error'));await ctx.reply('Image processing failed.');}
  finally{await removeJobDir(dir);}
}};
