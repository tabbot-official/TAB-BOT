import {rt} from '../i18n/runtime.js';
import {changeSudo,sudoTarget} from '../permissions/index.js';
export default {name:'delsudo',category:'Permissions',ownerOnly:true,description:'Remove a mentioned sudo user',usage:'delsudo +international_number | @user',async run(ctx){await changeSudo(sudoTarget(ctx),false,ctx.sender);await ctx.reply(rt(ctx,'sudo_removed'));}};
