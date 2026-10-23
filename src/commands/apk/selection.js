const pending=new Map();
const key=(jid,sender)=>jid+'\0'+sender;
export function setApkChoices(jid,sender,choices,now=Date.now()){pending.set(key(jid,sender),{choices:choices.map(x=>({packageName:x.packageName,name:x.name})),expires:now+120000});if(pending.size>1000)pending.delete(pending.keys().next().value);}
export function takeApkChoice(jid,sender,text,now=Date.now()){const k=key(jid,sender),p=pending.get(k);if(!p)return null;if(p.expires<now){pending.delete(k);return null;}if(!/^\d{1,2}$/.test(text.trim()))return null;const choice=p.choices[Number(text.trim())-1];if(!choice)return null;pending.delete(k);return choice;}
export function clearApkChoices(jid,sender){pending.delete(key(jid,sender));}
