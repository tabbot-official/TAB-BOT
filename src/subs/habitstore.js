import fs from 'node:fs';import path from 'node:path';
export class Habits {
 constructor(file){this.file=file;this.data={habits:[]};try{this.data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}if(!Array.isArray(this.data.habits))this.data={habits:[]};}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);}
 list(owner){return this.data.habits.filter(h=>h.owner===owner);}
 add(h){if(this.data.habits.length>=100)throw Error('capacity');this.data.habits.push(h);this.save();return h;}
 remove(owner,name){const n=this.data.habits.length;this.data.habits=this.data.habits.filter(h=>!(h.owner===owner&&h.name.toLowerCase()===name.toLowerCase()));const ok=this.data.habits.length!==n;if(ok)this.save();return ok;}
 find(owner,name){return this.data.habits.find(h=>h.owner===owner&&h.name.toLowerCase()===name.toLowerCase());}
 today(tz='Asia/Kolkata'){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 done(owner,name){
  const h=this.find(owner,name);if(!h)return null;
  const t=this.today();if(h.lastDone===t)return {habit:h,already:true};
  const y=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-86400000));
  h.streak=(h.lastDone===y)?(h.streak||0)+1:1;h.lastDone=t;h.best=Math.max(h.best||0,h.streak);this.save();
  return {habit:h,already:false};
 }
}
