import {downloadMediaMessage} from '@whiskeysockets/baileys';
import {featOn,featReply} from '../config/features.js';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir,removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {cohereVision,geminiVision} from '../ai/providers.js';
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<60000);if(a.length>=2)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
export default {name:'vision',aliases:['look','imgask','photoq'],category:'AI',
 description:'Ask any question about a photo (AI vision)',
 usage:'vision <question> (send or reply to a photo)',minArgs:1,
 async run(ctx){
  if(!featOn('vision'))return featReply(ctx,'vision');
  let dir;
  try{
    const media=findMedia(ctx.msg);
    if(!media||media.type!=='image'||media.animated)return ctx.reply('Send or reply to a photo with your question. Example: /vision what is written here?');
    if(Number(media.node.fileLength)>10*1048576)return ctx.reply('Photo is too big (max 10MB).');
    if(!userLimit(ctx.sender))return ctx.reply('Limit: 2 vision questions per minute. Try again shortly.');
    const question=ctx.args.join(' ').trim().slice(0,500);
    if(!question)return ctx.reply('What should I look for? Example: /vision is this plant healthy?');
    await downloadQueue.add(ctx.sender,async()=>{
      dir=await createJobDir();
      const input=path.join(dir,'input');
      const stream=await downloadMediaMessage(media.message,'stream',{},{logger,reuploadRequest:ctx.sock.updateMediaMessage});
      await saveImageStream(stream,input);
      const jpeg=await sharp(input,{limitInputPixels:16e6,failOn:'error'}).rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:88}).toBuffer();
      let out=null,via='';
      try{const r=await cohereVision(jpeg,'Answer this question about the image in clear, simple English, under 120 words: '+question);out=r.text;via='Cohere Aya Vision';}
      catch(e){logger.warn('vision cohere failed: '+(e?.message||'error'));
        try{const r=await geminiVision(jpeg,'Answer this question about the image in clear, simple English, under 120 words: '+question);out=r.text;via='Gemini';}
        catch(e2){logger.warn('vision gemini failed: '+(e2?.message||'error'));}
      }
      if(!out)return ctx.reply('The AI vision service is busy right now. Try again in a minute.');
      await ctx.reply('👁️ '+out.slice(0,2500)+'\n\n_Photo read by '+via+' (free tier)._');
    });
  }catch(e){logger.warn('vision error: '+(e?.message||'error'));await ctx.reply('Could not read that photo. Try a clearer one.');}
  finally{await removeJobDir(dir);}
 }};
