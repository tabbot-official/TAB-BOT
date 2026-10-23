export function parseClock(s,def={hh:7,mm:0}){
 if(!s)return def;
 const m=/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(String(s).trim());
 if(!m)return null;
 let h=Number(m[1]);const mi=m[2]?Number(m[2]):0;const ap=(m[3]||'').toLowerCase();
 if(mi>59)return null;
 if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;
 if(h>23)return null;
 return {hh:h,mm:mi};
}
export const who=(ctx)=>String(ctx.senderJid||ctx.sender||'').split(':')[0].split('@')[0];
