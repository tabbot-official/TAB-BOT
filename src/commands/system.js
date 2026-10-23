import {rt} from '../i18n/runtime.js';
import {t} from '../i18n/index.js';
import {systemStats} from '../utilities/system.js';
export default {name:'system',aliases:['stats'],category:'Utilities',ownerOnly:true,description:'Non-sensitive server statistics',usage:'system',async run(ctx){if(ctx.isGroup)return ctx.reply(t(ctx,'permission',{level:rt(ctx,'role_private_operator')}));await ctx.reply(await systemStats(ctx));}};
