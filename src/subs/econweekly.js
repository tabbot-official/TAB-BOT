import fs from 'node:fs';import path from 'node:path';
import {economy} from '../economy/index.js';
function weekId(now=new Date()){
 const d=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
 const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);
 const first=new Date(Date.UTC(d.getUTCFullYear(),0,4));
 return d.getUTCFullYear()+'-W'+String(1+Math.round(((d-first)/86400000-3+((first.getUTCDay()+6)%7))/7)).padStart(2,'0');
}
export class EconWeekly {
 constructor(file){this.file=file;this.data={week:null,champion:null,badges:{}};try{this.data={...this.data,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}}
 save(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);}catch{}}
 tick(){
  try{
   const w=weekId();
   if(this.data.week===w)return;
   // week rollover: crown the champion of the week that just ended
   let top=null;try{top=economy.leaders()[0]||null;}catch{return;}
   this.data.week=w;
   if(top){this.data.champion={week:w,player:top.player,balance:top.balance,at:Date.now()};
    const b=this.data.badges[top.player]||[];b.push(w+' 🏆');this.data.badges[top.player]=b.slice(-12);}
   this.save();
   if(process.env.ECON_WEEKLY_RESET==='on'){
    try{economy.transaction(s=>{for(const u of Object.values(s.users))u.balance=0;});}catch{}
   }
  }catch{}
 }
 champion(){return this.data.champion;}
 badges(){return this.data.badges;}
}
