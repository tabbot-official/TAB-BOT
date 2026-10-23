import {rt} from '../i18n/runtime.js';
import {t,preference} from '../i18n/index.js';
import {isSudo} from '../permissions/index.js';
export default {name:'checksudo',category:'Permissions',description:'Check your own permission status',usage:'checksudo',async run(ctx){await ctx.reply(rt(ctx,ctx.isOwner?'sudo_owner':isSudo(ctx)?'sudo_user':'regular_user'));}};
