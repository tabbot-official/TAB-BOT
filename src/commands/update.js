import {rt} from '../i18n/runtime.js';
import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import {privateOperator} from '../utilities/owner.js';
import config from '../config/config.js';import {updater,notify} from '../ops/index.js';import {shutdown} from '../connection/whatsapp.js';
export default {name:'update',category:'WhatsApp',ownerOnly:true,description:'Check, apply and restart a GitHub source update privately',usage:'update [check|confirm <commit>]',async run(ctx){
 if(!ctx.isOwner||!privateOperator(ctx)){await ctx.reply(t(ctx,'permission',{level:rt(ctx,'role_private_operator')}));return;}
 if(ctx.args.length&&!['confirm','check'].includes(ctx.args[0]))return ctx.reply('Use '+config.prefix+'update to check/apply or '+config.prefix+'update check to preview.');
 try {
  const n=await updater.check(true);
  if(!n)return ctx.reply(rt(ctx,'update_current'));
  if(n.blockedReason)return ctx.reply('New GitHub commit: '+n.sha+'\n'+n.blockedReason+'\nNo files changed.');
  if(ctx.args[0]==='check')return ctx.reply('New GitHub commit: '+n.sha+'\nVersion: '+n.version+'\n'+n.notes+'\nUse '+config.prefix+'update to apply.');
  if(ctx.args[0]==='confirm'&&(ctx.args.length!==2||ctx.args[1]!==n.sha))return ctx.reply('Latest commit changed. Use '+config.prefix+'update check again.');
  await ctx.reply('Applying GitHub commit '+n.sha+'. Bot will restart after checked source installation.');
  const r=await updater.install(n.sha);await notify(rt(ctx,'update_restarting',{version:r.version}));await shutdown(0);
 }catch(e){await replyFailure(ctx,'update',e);}
}};
