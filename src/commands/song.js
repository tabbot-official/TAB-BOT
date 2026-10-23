import {downloadMediaMessage} from '@whiskeysockets/baileys';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {createJobDir,removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
const MAX_BYTES=16*1048576;
const users=new Map();let hourly=[];let installing=null;
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<60000);if(a.length>=2)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
function hourOk(now=Date.now()){hourly=hourly.filter(t=>now-t<3600000);if(hourly.length>=40)return false;hourly.push(now);return true;}
function unwrap(m){let x=m||{};for(let i=0;i<4;i++){const n=x.ephemeralMessage?.message||x.viewOnceMessage?.message||x.viewOnceMessageV2?.message||x.documentWithCaptionMessage?.message;if(!n)break;x=n;}return x;}
/** Finds an audio/voice/video in the message itself or in the message it replies to. */
export function findClip(msg){
  const direct=unwrap(msg.message);
  const own=direct.audioMessage||direct.videoMessage;
  if(own)return {node:own,message:{key:msg.key,message:direct}};
  const ci=direct.extendedTextMessage?.contextInfo;
  const q=unwrap(ci?.quotedMessage);const qn=q.audioMessage||q.videoMessage;
  if(qn&&ci?.stanzaId)return {node:qn,message:{key:{remoteJid:msg.key.remoteJid,id:ci.stanzaId,participant:ci.participant,fromMe:false},message:q}};
  return null;
}
const run=(cmd,args,{timeoutMs=60000,env}={})=>new Promise((resolve,reject)=>{let out='';const p=spawn(cmd,args,{stdio:['ignore','pipe','ignore'],env:{...process.env,...env}});const t=setTimeout(()=>p.kill('SIGKILL'),timeoutMs);p.stdout.on('data',b=>{if(out.length<20000)out+=b;});p.on('error',reject);p.on('close',c=>{clearTimeout(t);c===0?resolve(out):reject(new Error(cmd+' exit '+c));});});
const pylibs=()=>path.join(config.paths.data,'pylibs');
const py=()=>process.env.PYTHON||'python3';
async function identify(wav){
  const env={JARVIS_PYLIBS:pylibs()};const script=path.resolve('scripts/songid.py');
  let r=JSON.parse((await run(py(),[script,wav],{env,timeoutMs:50000})).trim().split('\n').pop()||'{}');
  if(r.error==='NO_LIB'){
    // One-time install of the free shazamio library into data/pylibs (not the system Python).
    await fs.mkdir(path.join(config.paths.data,'pip-tmp'),{recursive:true});
    installing=installing||run(py(),['-m','pip','install','--quiet','--no-input','--target',pylibs(),'shazamio','audioop-lts; python_version >= "3.13"'],{timeoutMs:300000,env:{TMPDIR:path.join(config.paths.data,'pip-tmp')}}).finally(()=>{installing=null;});
    await installing;
    r=JSON.parse((await run(py(),[script,wav],{env,timeoutMs:50000})).trim().split('\n').pop()||'{}');
  }
  return r;
}
export function formatSong(r){
  if(r.match&&r.title)return `🎵 *${String(r.title).slice(0,150)}*\n👤 ${String(r.artist||'Unknown artist').slice(0,100)}${r.genre?`\n🎼 ${String(r.genre).slice(0,40)}`:''}${r.url?`\n🔗 ${r.url}`:''}\n\n▶️ Download it: ${config.prefix}play ${String(r.title).replace(/\s*\(.*?\)\s*/g,' ').trim().slice(0,80)} ${String(r.artist||'').slice(0,40)}`.trimEnd();
  return null;
}
export default {name:'shazam',aliases:['findsong','whatsong','identifysong'],category:'AI',description:'Recognize a song from an audio or video clip',usage:'shazam (reply to a clip, or send audio with this caption)',
async run(ctx){
  let dir;
  try{
    const a=findClip(ctx.msg);
    if(!a)return ctx.reply('Reply to a song clip (voice note, audio or video) with '+config.prefix+'shazam');
    if(Number(a.node.fileLength)>MAX_BYTES)return ctx.reply('That file is too big (max 16MB). Send a 10-15 second clip.');
    if(!userLimit(ctx.sender))return ctx.reply('Limit: 2 song searches per minute. Try again shortly.');
    if(!hourOk())return ctx.reply('Song recognition is busy right now. Try again in a few minutes.');
    await ctx.reply('🎧 Listening...');
    await downloadQueue.add(ctx.sender,async()=>{
      dir=await createJobDir();
      const inp=path.join(dir,'in.media'),wav=path.join(dir,'clip.wav');
      const buf=await downloadMediaMessage(a.message,'buffer',{}, {logger,reuploadRequest:ctx.sock.updateMediaMessage});
      if(!buf?.length||buf.length>MAX_BYTES)return ctx.reply('That file is too big (max 16MB).');
      await fs.writeFile(inp,buf);
      const secs=Number(a.node.seconds)||0;const start=secs>25?Math.min(secs/3,60):0;
      try{await run(config.tools?.ffmpeg||'ffmpeg',['-nostdin','-y','-ss',String(Math.floor(start)),'-i',inp,'-t','14','-vn','-ac','1','-ar','44100',wav],{timeoutMs:30000});}catch{return ctx.reply('Could not read that audio.');}
      const r=await identify(wav);
      const text=formatSong(r);
      if(text)return ctx.reply(text);
      if(r.error)return ctx.reply('Song recognition is not available right now. Try again later.');
      return ctx.reply('🤷 Could not recognise that. Send a clearer 10-15 second part with the music (less talking or noise).');
    });
  }catch(e){logger.warn('song failed: '+String(e?.message||'').slice(0,100));await ctx.reply('Song recognition failed. Try again with a clearer clip.');}
  finally{if(dir)await removeJobDir(dir).catch(()=>{});}
}};
