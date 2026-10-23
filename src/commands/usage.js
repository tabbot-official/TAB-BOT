import {rt} from '../i18n/runtime.js';
import {t,preference} from '../i18n/index.js';
import {report,usage} from '../ops/index.js';import config from '../config/config.js';
export default {name:'usage',category:'WhatsApp',ownerOnly:true,description:'Private usage insights',usage:'usage',async run(ctx){if(ctx.isGroup){await ctx.reply(t(ctx,'permission',{level:rt(ctx,'role_private_operator')}));return;}const s=usage.summary();const suggestions=s.owner.filter(([n,c])=>n.length>6&&c>=10).slice(0,2).map(([n])=>rt(ctx,'usage_alias_suggestion',{prefix:config.prefix,command:n})).join('\n');await ctx.reply(report(null,7,ctx)+(suggestions?'\n'+suggestions:''));}};
