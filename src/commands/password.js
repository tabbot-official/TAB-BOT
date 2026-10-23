import {rt} from '../i18n/runtime.js';
import {t} from '../i18n/index.js';
import {privateOperator} from '../utilities/owner.js';
import {password} from '../utilities/text.js';
const recent=new Map();
export default {name:'password',category:'Utilities',ownerOnly:true,description:'Create a private password without storing it',usage:'password [8-64] [all|alnum|letters|digits]',async run(ctx){if(!privateOperator(ctx))return ctx.reply(t(ctx,'permission',{level:rt(ctx,'role_private_operator')}));const now=Date.now();if(now-(recent.get(ctx.sender)||0)<5000)throw new Error('Wait 5 seconds before another password');recent.set(ctx.sender,now);const text=password(Number(ctx.args[0]||20),ctx.args[1]||'all');await ctx.sock.sendMessage(ctx.jid,{text},{quoted:ctx.msg,jarvisNoCache:true});}};
