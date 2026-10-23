// Only transport phone-number JIDs or Baileys' authenticated LID mapping establish a phone identity.
export function phoneJid(raw=''){const m=/^([1-9]\d{6,14})(?::\d+)?@s\.whatsapp\.net$/.exec(raw);return m?m[1]+'@s.whatsapp.net':null;}
export async function resolveSenderIdentity(sock,msg,kind){const key=msg.key||{};const candidates=kind==='self'?[sock.user?.id]:kind==='group'?[key.participantAlt,key.participant]:[key.remoteJidAlt,key.remoteJid];for(const raw of candidates){const pn=phoneJid(raw);if(pn)return {senderJid:pn,phoneNumber:pn.split('@')[0],verified:true};}
for(const raw of candidates){if(!/^\d+(?::\d+)?@lid$/.test(raw||''))continue;try{const pn=phoneJid(await sock.signalRepository?.lidMapping?.getPNForLID(raw));if(pn)return {senderJid:pn,phoneNumber:pn.split('@')[0],verified:true};}catch{/* no mapping means no owner authority */}}
return {senderJid:candidates.find(Boolean)||key.remoteJid||'',phoneNumber:null,verified:false};}
export function ownerIdentity(identity,kind,ownerNumber,linkedJid){if(kind==='self')return true;if(!identity.verified)return false;const linked=phoneJid(linkedJid);return identity.phoneNumber===ownerNumber||!!linked&&identity.senderJid===linked;}
