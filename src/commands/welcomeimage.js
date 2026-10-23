import {store,settings} from '../groups/store.js';
export default {name:'welcomeimage',aliases:['welcomepic'],category:'Group',requiredLevel:'admin',description:'Send the new member profile picture with the welcome message (admins)',usage:'welcomeimage on|off',
 async run(ctx){
  if(!ctx.isGroup)return ctx.reply('Group only.');
  const v=(ctx.args[0]||'').toLowerCase();
  if(!['on','off'].includes(v))return ctx.reply('Welcome image is '+(settings(ctx.jid).welcomeImage?'ON':'OFF')+'.\nUse: welcomeimage on|off\nWelcome message placeholders: {user} {name} {group} {count} {rules} {date}');
  if(!store())return ctx.reply('Group storage is not ready yet. Try again in a moment.');
  store().setSetting(ctx.jid,'welcomeImage',v==='on');
  return ctx.reply('Welcome image is now '+v.toUpperCase()+'. (Needs /welcome on too. If the member has no visible profile picture, plain text is sent.)');
 }};
