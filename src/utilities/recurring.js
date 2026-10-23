import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import dayjs from 'dayjs';import utc from 'dayjs/plugin/utc.js';import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);dayjs.extend(timezone);
const TZ='Asia/Kolkata';
export function nextDaily(hh,mm,now=Date.now(),weekdays=null){
 let d=dayjs(now).tz(TZ).hour(hh).minute(mm).second(0).millisecond(0);
 if(!weekdays||!weekdays.length){if(d.valueOf()<=now)d=d.add(1,'day');return d.valueOf();}
 for(let i=0;i<8;i++){const c=d.add(i,'day');if(c.valueOf()>now&&weekdays.includes(c.day()))return c.valueOf();}
 return d.add(7,'day').valueOf();
}
/** Recurring jobs: daily clock-time jobs and interval watches, persisted as JSON. */
export class Recurring {
 constructor(file,{build,send,now=()=>Date.now(),max=200}){
  this.file=file;this.build=build;this.send=send;this.now=now;this.max=max;this.jobs=[];this.busy=false;
  try{this.jobs=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  if(!Array.isArray(this.jobs))this.jobs=[];
 }
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.jobs));fs.renameSync(this.file+'.tmp',this.file);}
 validRecipient(r){return /^(\d{7,15}@(s\.whatsapp\.net|lid)|[\d-]{10,40}@g\.us)$/.test(r);}
 add(job){
  if(!this.validRecipient(String(job.recipient||'')))throw Error('bad recipient');
  if(this.jobs.length>=this.max)throw Error('capacity');
  job.id=crypto.randomBytes(4).toString('hex');job.fails=0;
  job.next=job.every?this.now()+job.every:nextDaily(job.hh,job.mm,this.now(),job.weekdays);
  this.jobs.push(job);this.save();return job;
 }
 cancel(id,recipient){const n=this.jobs.length;this.jobs=this.jobs.filter(x=>x.id!==id||(recipient&&x.recipient!==recipient));const ok=this.jobs.length!==n;if(ok)this.save();return ok;}
 forRecipient(r){return this.jobs.filter(x=>x.recipient===r);}
 computeNext(job){return job.every?this.now()+job.every:nextDaily(job.hh,job.mm,this.now(),job.weekdays);}
 async tick(){
  if(this.busy)return;this.busy=true;try{
   for(const j of this.jobs.filter(x=>x.next<=this.now())){
    j.next=this.computeNext(j);this.save(); // claim first: never double-fires
    let text=null;
    try{text=await this.build(j);}catch{text=null;}
    if(text===null){j.fails=0;continue;} // nothing to say right now (e.g. price not triggered)
    let ok=false;try{ok=await this.send(text,j.recipient);}catch{ok=false;}
    if(!ok){j.fails=(j.fails||0)+1;if(j.fails<=5)j.next=this.now()+60000;else j.fails=0;}
    this.save();
   }
  }finally{this.busy=false;}
 }
}
