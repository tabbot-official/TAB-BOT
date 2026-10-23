import {RuntimeInputError} from '../i18n/runtime.js';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export class Reminders {
 constructor(file,send,now=()=>Date.now(),format=(text)=>'Reminder: '+text){this.format=format;this.file=file;this.send=send;this.now=now;this.jobs=[];this.busy=false;try{this.jobs=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}if(!Array.isArray(this.jobs))this.jobs=[];}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.jobs));fs.renameSync(this.file+'.tmp',this.file);}
 create(text,at,recipient=null,owner=null){if(typeof text!=='string'||!text.trim()||text.length>1000)throw new RuntimeInputError('reminder_text_limit');if(!Number.isFinite(at)||at<=this.now()||at-this.now()>90*86400000)throw new RuntimeInputError('reminder_time_limit');if(this.jobs.length>=300)throw new RuntimeInputError('reminder_capacity');if(recipient!==null&&!/^(\d{7,15}@(s\.whatsapp\.net|lid)|[\d-]{10,40}@g\.us)$/.test(recipient))throw new RuntimeInputError('reminder_invalid');const job={recipient,owner,id:crypto.randomBytes(4).toString('hex'),text,at,state:'waiting'};this.jobs.push(job);this.save();return job;}
 cancel(id,recipient=undefined){const n=this.jobs.length;this.jobs=this.jobs.filter(x=>x.id!==id||(recipient!==undefined&&(x.recipient||null)!==recipient));if(this.jobs.length===n)throw new RuntimeInputError('reminder_not_found');this.save();}
 async tick(){if(this.busy)return;this.busy=true;try{for(const j of this.jobs.filter(x=>x.state==='waiting'&&x.at<=this.now())){
  // Claim persistently before delivery. A crash can lose this one send, but never duplicates it.
  j.state='sending';this.save();try{if(await this.send(this.format(j.text,j.recipient||null),j.recipient||null)){this.jobs=this.jobs.filter(x=>x.id!==j.id);}else j.state='waiting';}catch{j.state='uncertain';}this.save();
 }}finally{this.busy=false;}}
}
