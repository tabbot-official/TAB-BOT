import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export class Splits {
 constructor(file){this.file=file;this.data={};try{this.data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}if(typeof this.data!=='object'||!this.data)this.data={};}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);}
 g(jid){if(!this.data[jid])this.data[jid]={members:[],expenses:[]};return this.data[jid];}
 join(jid,user){const g=this.g(jid);if(!g.members.includes(user))g.members.push(user);this.save();}
 leave(jid,user){const g=this.g(jid);g.members=g.members.filter(m=>m!==user);this.save();}
 addExpense(jid,payer,amount,note,people){const g=this.g(jid);for(const u of people)if(!g.members.includes(u))g.members.push(u);const e={id:crypto.randomBytes(3).toString('hex'),payer,amount,note:note.slice(0,80),people,ts:Date.now()};g.expenses.push(e);if(g.expenses.length>200)g.expenses=g.expenses.slice(-200);this.save();return e;}
 removeExpense(jid,id){const g=this.g(jid);const n=g.expenses.length;g.expenses=g.expenses.filter(e=>e.id!==id);const ok=g.expenses.length!==n;if(ok)this.save();return ok;}
 reset(jid){this.data[jid]={members:[],expenses:[]};this.save();}
 balances(jid){
  const g=this.g(jid);const net={};
  for(const e of g.expenses){
   if(!e.people.length)continue;const share=e.amount/e.people.length;
   net[e.payer]=(net[e.payer]||0)+e.amount;
   for(const u of e.people)net[u]=(net[u]||0)-share;
  }
  return net;
 }
 settle(jid){
  const net=this.balances(jid);
  const debt=Object.entries(net).filter(([,v])=>v<-0.01).map(([u,v])=>({u,v:-v})).sort((a,b)=>b.v-a.v);
  const cred=Object.entries(net).filter(([,v])=>v>0.01).map(([u,v])=>({u,v})).sort((a,b)=>b.v-a.v);
  const out=[];let i=0,j=0;
  while(i<debt.length&&j<cred.length){
   const pay=Math.min(debt[i].v,cred[j].v);
   out.push({from:debt[i].u,to:cred[j].u,amount:Math.round(pay*100)/100});
   debt[i].v-=pay;cred[j].v-=pay;if(debt[i].v<0.01)i++;if(cred[j].v<0.01)j++;
  }
  return out;
 }
}
