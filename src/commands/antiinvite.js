import {store,settings} from '../groups/store.js';
export default {name:'antiinvite',aliases:['noinvite'],category:'Group',requiredLevel:'admin',description:'Delete WhatsApp group invite links (admins)',usage:'antiinvite on|off',
 async run(ctx){
  if(!ctx.isGroup)return ctx.reply('Group only.');
  const v=(ctx.args[0]||'').toLowerCase();const st=store();if(!st)return ctx.reply('Group storage is not ready yet. Try again in a moment.');
  if(!['on','off'].includes(v))return ctx.reply('Anti-invite is '+(settings(ctx.jid).antiinvite?'ON':'OFF')+'.\nUse: antiinvite on|off\nIt deletes chat.whatsapp.com links from non-admins and gives a strike. The bot must be a group admin to delete.');
  st.setSetting(ctx.jid,'antiinvite',v==='on');
  return ctx.reply('Anti-invite is now '+v.toUpperCase()+'. Admins are exempt.');
 }};
