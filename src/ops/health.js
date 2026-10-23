// Pure health decisions, separate from WhatsApp and host repair mechanics.
export class Health {
 constructor({offlineMs=180000,cooldownMs=3600000}={}){this.offlineMs=offlineMs;this.cooldownMs=cooldownMs;this.offlineSince=null;this.errors=[];this.sent={};this.pressure={ram:0,disk:0};}
 error(now=Date.now()){this.errors.push(now);this.errors=this.errors.filter(t=>now-t<300000).slice(-100);}
 check({now=Date.now(),online,ramRatio=0,diskRatio=0}){
  if(online)this.offlineSince=null;else if(this.offlineSince===null)this.offlineSince=now;
  this.errors=this.errors.filter(t=>now-t<300000);
  this.pressure.ram=ramRatio>=0.9?this.pressure.ram+1:0;
  this.pressure.disk=diskRatio>=0.9?this.pressure.disk+1:0;
  const issues=[];
  if(this.offlineSince!==null&&now-this.offlineSince>=this.offlineMs)issues.push('offline');
  if(this.errors.length>=5)issues.push('errors');
  if(this.pressure.ram>=3)issues.push('ram');if(this.pressure.disk>=3)issues.push('disk');
  return issues.filter(k=>!this.sent[k]||now-this.sent[k]>=this.cooldownMs);
 }
 mark(k,now=Date.now()){this.sent[k]=now;}
}
