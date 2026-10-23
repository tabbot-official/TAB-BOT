// Private aggregate counts only. Never stores messages, arguments, phone numbers or chat ids.
import fs from 'node:fs';
import path from 'node:path';
export class Usage {
 constructor(file, now=()=>Date.now()) {this.file=file;this.now=now;this.days={};this.timer=null;this.load();}
 load(){try{const j=JSON.parse(fs.readFileSync(this.file,'utf8'));this.days=j.days||{};}catch{} this.prune();}
 day(ts=this.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));}
 prune(){const keys=Object.keys(this.days).sort();for(const k of keys.slice(0,Math.max(0,keys.length-35)))delete this.days[k];}
 record(name,{owner=false,error=false}={}){
  if(!/^[a-z0-9_]{1,30}$/.test(name))return;
  const d=this.days[this.day()]??={commands:{},errors:{},owner:{},hours:Array(24).fill(0)};
  if(error)d.errors[name]=(d.errors[name]||0)+1;
  else{d.commands[name]=(d.commands[name]||0)+1;if(owner)d.owner[name]=(d.owner[name]||0)+1;const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}).format(new Date(this.now())));d.hours[h]++;}
  this.prune();if(!this.timer){this.timer=setTimeout(()=>this.flush(),2000);this.timer.unref?.();}
 }
 flush(){clearTimeout(this.timer);this.timer=null;try{fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({days:this.days}));fs.renameSync(tmp,this.file);}catch{}}
 summary(days=7){const total={},errors={},owner={},hours=Array(24).fill(0);for(const k of Object.keys(this.days).sort().slice(-days)){const d=this.days[k];for(const [target,src] of [[total,d.commands],[errors,d.errors],[owner,d.owner]])for(const [n,c]of Object.entries(src||{}))target[n]=(target[n]||0)+c;for(let h=0;h<24;h++)hours[h]+=d.hours?.[h]||0;}
 const sort=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]);return {total:Object.values(total).reduce((a,b)=>a+b,0),top:sort(total),owner:sort(owner),errors:sort(errors),hours};}
}
