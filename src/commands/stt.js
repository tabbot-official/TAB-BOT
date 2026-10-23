import {downloadMediaMessage} from '@whiskeysockets/baileys';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {createJobDir,removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {makeLimiter,transcribeAudio} from '../services/publicAi.js';
const limiter=makeLimiter('STT','STT_PER_HOUR',40);
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<60000);if(a.length>=2)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
const MAX_SECONDS=120,MAX_BYTES=8*1048576;
function unwrap(m){let x=m||{};for(let i=0;i<4;i++){const n=x.ephemeralMessage?.message||x.viewOnceMessage?.message||x.viewOnceMessageV2?.message||x.documentWithCaptionMessage?.message;if(!n)break;x=n;}return x;}
export function findAudio(msg){
  const direct=unwrap(msg.message);
  if(direct.audioMessage)return {node:direct.audioMessage,message:{key:msg.key,message:direct}};
  const ci=direct.extendedTextMessage?.contextInfo||direct.audioMessage?.contextInfo;
  const q=unwrap(ci?.quotedMessage);
  if(q.audioMessage&&ci?.stanzaId)return {node:q.audioMessage,message:{key:{remoteJid:msg.key.remoteJid,id:ci.stanzaId,participant:ci.participant,fromMe:false},message:q}};
  return null;
}
export function toWav(input,output){return new Promise((resolve,reject)=>{const p=spawn(config.tools?.ffmpeg||'ffmpeg',['-nostdin','-y','-i',input,'-t',String(MAX_SECONDS),'-vn','-ar','16000','-ac','1','-f','wav',output],{stdio:['ignore','ignore','ignore']});const t=setTimeout(()=>p.kill('SIGKILL'),30000);p.on('error',reject);p.on('close',c=>{clearTimeout(t);c===0?resolve():reject(new Error('ffmpeg '+c));});});}
export default {name:'stt',aliases:['transcribe','voice2text'],category:'AI',description:'Voice note to text (free public AI)',usage:'stt (reply to a voice note)',
async run(ctx){
  let dir;
  try{
    const a=findAudio(ctx.msg);
    if(!a)return ctx.reply('Reply to a voice note or audio with '+config.prefix+'stt');
    if(Number(a.node.fileLength)>MAX_BYTES)return ctx.reply('Audio is too big (max 8MB).');
    if(Number(a.node.seconds)>600)return ctx.reply('Audio is too long. Only the first '+MAX_SECONDS+' seconds can be transcribed.');
    if(!userLimit(ctx.sender))return ctx.reply('Limit: 2 requests per minute. Try again shortly.');
    if(!limiter.ok())return ctx.reply('Speech to text is busy or turned off right now. Try again in a minute.');
    await downloadQueue.add(ctx.sender,async()=>{
      dir=await createJobDir();
      const inp=path.join(dir,'in.audio'),wav=path.join(dir,'a.wav');
      const buf=await downloadMediaMessage(a.message,'buffer',{}, {logger,reuploadRequest:ctx.sock.updateMediaMessage});
      if(!buf?.length||buf.length>MAX_BYTES)return ctx.reply('Audio is too big (max 8MB).');
      await fs.writeFile(inp,buf);
      try{await toWav(inp,wav);}catch{return ctx.reply('Could not read that audio.');}
      let text;
      const wavBuf=await fs.readFile(wav);
      try{text=await limiter.run(()=>transcribeAudio(wavBuf,{timeoutMs:60000}));}
      catch(e){logger.warn('stt failed: '+(e?.message||'error'));return ctx.reply('Speech to text failed (free AI service is busy). Try again in a minute.');}
      if(!text)return ctx.reply('No speech found in that audio.');
      await ctx.reply('*Transcript*\n'+text.slice(0,3500)+'\n\n_Transcribed by a free public AI service (Whisper on Hugging Face). Audio was sent to it._');
    });
  }catch(e){logger.warn('stt error: '+(e?.message||'error'));await ctx.reply('Audio processing failed.');}
  finally{await removeJobDir(dir);}
}};
