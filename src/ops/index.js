import {rt} from '../i18n/runtime.js';
import {Reminders} from '../utilities/reminders.js';
import cron from 'node-cron';
import fs from 'node:fs';import path from 'node:path';
import config from '../config/config.js';import {Updater,healthy} from './update.js';
import {prune} from '../recover/store.js';
import {Usage} from './usage.js';import {Health} from './health.js';
import {cleanupStaleJobs} from '../utils/fileManager.js';
export const usage=new Usage(path.join(config.paths.data,'usage.json'));
export const updater=new Updater(config.root,config.paths.data);
export const reminders=new Reminders(path.join(config.paths.data,'reminders.json'),async(text,to)=>{if(!to)return notify(text);if(!online)return false;await socket.sendMessage(to,{text:'Tab\n'+text});return true;},()=>Date.now(),(text,to)=>rt(to?{senderJid:to,sender:to,jid:to,isGroup:false}:ownerContext(),'reminder_delivery',{text}));
export const scheduled=new Reminders(path.join(config.paths.data,'scheduled-messages.json'),async(text,to)=>{if(!to||!online)return false;await socket.sendMessage(to,{text});return true;},()=>Date.now(),(text)=>text);
let reminderTask=null;
const health=new Health();let socket=null;let online=false;let pendingOffline=false;let running=false;let started=false;let timer=null;let healthTimer=null;
const file=path.join(config.paths.data,'ops.json');let state={};try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
function save(){try{fs.mkdirSync(config.paths.data,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);}catch{}}
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
import {Capsules} from '../capsule/index.js';
export const capsules=new Capsules(path.join(config.paths.data,'capsules.json'),async(text,to)=>{if(!to||!online)return false;await socket.sendMessage(to,{text});return true;},()=>Date.now(),(text)=>'📬 *Time capsule opened!*\n\n'+text);
import {recordConnection} from '../api/services/sessionService.js';
import {Birthdays} from '../birthday/index.js';
export const birthdays=new Birthdays(path.join(config.paths.data,'birthdays.json'),async(to,text,mentions)=>{if(!to||!online)return false;await socket.sendMessage(to,{text,mentions});return true;});
import {Recurring} from '../utilities/recurring.js';
import {buildSub,buildWatch} from '../subs/dispatch.js';
const subSend=async(text,to)=>{if(!to||!online)return false;await socket.sendMessage(to,{text});return true;};
export const subs=new Recurring(path.join(config.paths.data,'subs.json'),{build:buildSub,send:subSend});
export const watches=new Recurring(path.join(config.paths.data,'watches.json'),{build:buildWatch,send:subSend});
import {Habits} from '../subs/habitstore.js';
export const habits=new Habits(path.join(config.paths.data,'habits.json'));
import {Splits} from '../subs/splitstore.js';
export const splits=new Splits(path.join(config.paths.data,'splits.json'));
import {TinyJson} from '../subs/tinyjson.js';
export const newsPrefs=new TinyJson(path.join(config.paths.data,'news-prefs.json'),{});
export const notesPins=new TinyJson(path.join(config.paths.data,'notes-pins.json'),{});
import {EconWeekly} from '../subs/econweekly.js';
export const econWeekly=new EconWeekly(path.join(config.paths.data,'econ-weekly.json'));
import {Memory} from '../memory/store.js';
export const userMemory=new Memory(path.join(config.paths.data,'user-memory.json'));
export function pairedNumber(){return String(socket?.user?.id||'').split('@')[0].split(':')[0];}
export function recordError(){health.error();}
export function connection(sock,up){socket=sock;online=up;try{recordConnection(up);}catch{}globalThis.__jarvisWA=up?'online':'offline';clearTimeout(healthTimer);if(up){healthTimer=setTimeout(()=>{if(online)healthy(config.paths.data).catch(()=>{});},30000);healthTimer.unref();}}
function ownerContext(){return {senderJid:ownChat()||'',sender:ownChat()||'',jid:ownChat()||'',isGroup:false};}
function ownChat(){const digits=String(socket?.user?.id||'').split('@')[0].split(':')[0];return digits&&(!config.ownerNumber||digits===config.ownerNumber)?digits+'@s.whatsapp.net':null;}
export async function sendPortalOtpText(number,m){if(!online||!socket)return false;const text=m.sid?'Tab\nYour Tab S-ID is '+m.sid+'. Put it in your bot settings.js under ecosystem.sid. Keep it private.':'Tab\nYour Tab code is '+m.code+'. It expires in 5 minutes. Never share it with anyone.';try{await socket.sendMessage(number+'@s.whatsapp.net',{text});return true;}catch{return false;}}
export async function notify(text){const to=ownChat();if(!online||!to)return false;try{await socket.sendMessage(to,{text:'Tab\n'+text});return true;}catch{return false;}}
function number(file){try{const v=fs.readFileSync(file,'utf8').trim();return v==='max'?0:Number(v);}catch{return 0;}}
export function resources(){const current=number('/sys/fs/cgroup/memory.current'),limit=number('/sys/fs/cgroup/memory.max');let diskBytes=0;try{const s=fs.statfsSync(config.root);diskBytes=Number(s.bsize)*Number(s.bavail);}catch{}return {rss:process.memoryUsage().rss,ramRatio:limit?current/limit:0,diskBytes};}
export function report(title=null,days=7,ctx=ownerContext()){title??=rt(ctx,'title_usage');const s=usage.summary(days),fmt=rows=>rows.slice(0,5).map(([n,c])=>`${config.prefix}${n}: ${c}`).join(', ')||rt(ctx,'report_none');return rt(ctx,'usage_report',{title,count:s.total,top:fmt(s.top),errors:fmt(s.errors)});}
export async function tick(){if(running)return;running=true;try{
 const r=resources();let ownSize=0;
 if(!state.cleanupAt||Date.now()-state.cleanupAt>600000){await cleanupStaleJobs();prune();state.cleanupAt=Date.now();}
 // Shared host limit supplied explicitly, never confuse filesystem free space with the panel quota.
 const quota=Number(process.env.HOST_DISK_LIMIT_MB)||0;let diskRatio=0;
 if(quota&&(!state.diskCheckedAt||Date.now()-state.diskCheckedAt>600000)){const {dirSize}=await import('../utils/fileManager.js');ownSize=await dirSize(config.root);state.diskRatio=ownSize/(quota*1048576);state.diskCheckedAt=Date.now();}diskRatio=state.diskRatio||0;
 const issues=health.check({online,ramRatio:r.ramRatio,diskRatio});
 for(const issue of issues){
  if(issue==='offline'){pendingOffline=true;health.mark(issue);continue;}
  if(issue==='disk')await cleanupStaleJobs();
  const msg={errors:rt(ownerContext(),'ops_errors'),ram:rt(ownerContext(),'ops_ram'),disk:rt(ownerContext(),'ops_disk')}[issue];
  if(await notify(msg))health.mark(issue);
 }
 if(pendingOffline&&online&&await notify(rt(ownerContext(),'ops_reconnected')))pendingOffline=false;
 const today=date();const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}).format(new Date()));
 if(online&&hour>=Math.min(23,Math.max(0,Number(process.env.OPS_REPORT_HOUR??10)))&&state.daily!==today&&await notify(rt(ownerContext(),'ops_daily',{ram:(r.rss/1048576).toFixed(1)})+report(rt(ownerContext(),'title_today'),1))){state.daily=today;save();}
 if(online){try{const next=await updater.check();if(next&&state.updateNotified!==next.sha&&await notify('New GitHub update: '+next.sha+'\nVersion: '+next.version+'\n'+next.notes+'\n'+(next.blockedReason||'Use '+config.prefix+'update check to preview or '+config.prefix+'update to apply; details go to owner self-chat.'))){state.updateNotified=next.sha;save();}}catch{/* GitHub offline/rate-limit: no repeated alerts */}}
 try{const resultFile=path.join(config.paths.data,'update-result.json');const r=JSON.parse(fs.readFileSync(resultFile,'utf8'));if(await notify(r.ok?rt(ownerContext(),'ops_update_ok',{version:r.version}):rt(ownerContext(),'ops_update_failed',{version:r.version})))fs.unlinkSync(resultFile);}catch{}
 const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'long'}).format(new Date());
 if(online&&weekday==='Sunday'&&hour>=Math.min(23,Math.max(0,Number(process.env.OPS_REPORT_HOUR??10)))&&state.weekly!==today&&await notify(report(rt(ownerContext(),'title_weekly'),7))){state.weekly=today;save();}
 }finally{running=false;}}
export function start(){if(started)return;started=true;reminderTask=cron.schedule('* * * * *',()=>{reminders.tick().catch(()=>{});scheduled.tick().catch(()=>{});capsules.tick().catch(()=>{});birthdays.tick().catch(()=>{});subs.tick().catch(()=>{});watches.tick().catch(()=>{});try{econWeekly.tick();}catch{}},{timezone:'Asia/Kolkata'});timer=setInterval(()=>tick().catch(()=>{}),60000);timer.unref?.();}
export function stop(){reminderTask?.stop();reminderTask?.destroy();clearInterval(timer);clearTimeout(healthTimer);started=false;usage.flush();}
