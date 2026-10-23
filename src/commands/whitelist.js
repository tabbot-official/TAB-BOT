import {store,settings} from '../groups/store.js';
const clean=(x)=>String(x||'').toLowerCase().trim().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
export default {name:'whitelist',aliases:['allowlink','linkallow'],category:'Group',requiredLevel:'admin',description:'Domains that anti-link allows (admins)',usage:'whitelist add|remove|list [domain]',
 async run(ctx){
  if(!ctx.isGroup)return ctx.reply('Group only.');
  const st=store();if(!st)return ctx.reply('Group storage is not ready yet. Try again in a moment.');const cur=Array.isArray(settings(ctx.jid).linkWhitelist)?settings(ctx.jid).linkWhitelist:[];
  const sub=(ctx.args[0]||'list').toLowerCase();const d=clean(ctx.args[1]);
  if(sub==='list')return ctx.reply(cur.length?'Allowed domains:\n'+cur.map((x)=>'• '+x).join('\n'):'No allowed domains. Add one: whitelist add youtube.com');
  if(!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d||''))return ctx.reply('Give a domain like youtube.com');
  if(d==='whatsapp.com'||d==='chat.whatsapp.com')return ctx.reply('Invite links are controlled with antiinvite, not the whitelist.');
  if(sub==='add'){if(cur.length>=30)return ctx.reply('Max 30 domains.');if(!cur.includes(d))st.setSetting(ctx.jid,'linkWhitelist',[...cur,d]);return ctx.reply('✅ Allowed: '+d+' (anti-link will not touch it)');}
  if(sub==='remove'||sub==='del'){st.setSetting(ctx.jid,'linkWhitelist',cur.filter((x)=>x!==d));return ctx.reply('Removed '+d);}
  return ctx.reply('Use: whitelist add|remove|list [domain]');
 }};
