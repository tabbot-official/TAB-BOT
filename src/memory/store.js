// P2: persistent per-user/group memory. Learns simple self-stated facts, JSON-persisted.
import fs from 'node:fs';import path from 'node:path';
const MAX_FACTS=25,MAX_USERS=500;
export class Memory {
 constructor(file){this.file=file;this.data={users:{}};try{this.data={...this.data,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}if(!this.data.users)this.data.users={};}
 save(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);}catch{}}
 u(id){if(!this.data.users[id]){const ids=Object.keys(this.data.users);if(ids.length>=MAX_USERS)delete this.data.users[ids[0]];this.data.users[id]={facts:[],seen:0};}return this.data.users[id];}
 learn(id,text,name){
  if(!id||!text)return;
  const u=this.u(id);u.seen=Date.now();if(name&&!u.name)u.name=String(name).slice(0,40);
  const t=String(text).trim();if(t.length<8||t.length>160||t.startsWith('/'))return;
  const pats=[
   /(?:mera naam|my name is|mujhe)\s+([a-z][a-z .'-]{2,40}?)\s+(?:hai|bolte|kehte|bulate)/i,
   /(?:my name is)\s+([a-z][a-z .'-]{2,40})/i,
   /(?:i (?:really )?(?:like|love)|mujhe)\s+(.{3,60}?)(?:\s+(?:bahut|bohot|bohot zyada)?\s*(?:pasand hai|pasand h)|$)/i,
   /(?:i live in|i am from|main|hum)\s+([a-z][a-z .-]{2,40}?)\s+(?:me|mein)\s+(?:rehta|rehti|rahta)\s+(?:hoon|hu|hai)/i,
   /(?:i live in|i am from|i'm from)\s+([a-z][a-z .-]{2,40})/i,
   /(?:i study in|main padhta hoon|main padhti hoon)\s*(?:class\s*)?(.{2,40})/i,
   /(?:my birthday is|mera birthday|mera janamdin)\s+(.{2,40})/i,
  ];
  for(const p of pats){
   const m=p.exec(t);if(!m)continue;
   let fact=t.slice(0,140); // store the whole sentence, not just the match - safer and human-readable
   if(u.facts.includes(fact))return;
   u.facts.push(fact);if(u.facts.length>MAX_FACTS)u.facts=u.facts.slice(-MAX_FACTS);
   this.save();return;
  }
 }
 addFact(id,fact){const u=this.u(id);fact=String(fact).slice(0,140);if(!fact||u.facts.includes(fact))return false;u.facts.push(fact);if(u.facts.length>MAX_FACTS)u.facts=u.facts.slice(-MAX_FACTS);u.seen=Date.now();this.save();return true;}
 facts(id){const u=this.data.users[id];return u?[...(u.name?['Name: '+u.name]:[]),...u.facts]:[];}
 suffix(id){const f=this.facts(id);return f.length?' Things you remember about this user (use naturally, do not recite): '+f.slice(-10).join(' | '):'';}
 wipe(id){const ok=!!this.data.users[id];delete this.data.users[id];if(ok)this.save();return ok;}
}
