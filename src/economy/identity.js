/** Never reinterpret a WhatsApp LID as a phone number. */
export function playerJid(ctx){const value=String(ctx.senderJid||'');if(!/^\d{7,15}(?::\d+)?@s\.whatsapp\.net$/.test(value))throw new Error('A verified phone-number identity is required for the virtual economy');return value.replace(/:\d+@/,'@');}

/** Old delivery/backfill cannot earn coins or confirm a transfer again. */
export function freshCommand(ctx,now=Date.now()){const raw=ctx.msg?.messageTimestamp;if(raw===undefined||raw===null)return;const seconds=Number(raw);if(!Number.isFinite(seconds)||seconds<=0||seconds*1000<now-300000||seconds*1000>now+60000)throw new Error('Command expired; send a new command');}
