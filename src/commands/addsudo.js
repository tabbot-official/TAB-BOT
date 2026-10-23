import {rt} from '../i18n/runtime.js';
import {changeSudo,sudoTarget} from '../permissions/index.js';
export default {name:'addsudo',category:'Permissions',ownerOnly:true,description:'Grant a mentioned user sudo command access',usage:'addsudo +international_number | @user',async run(ctx){await changeSudo(sudoTarget(ctx),true,ctx.sender);await ctx.reply(rt(ctx,'sudo_added'));}};
