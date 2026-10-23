import {playerJid,freshCommand} from '../economy/identity.js';
import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'daily',category:'Economy',description:'Virtual economy daily',usage:'daily',async run(ctx){freshCommand(ctx);const jid=playerJid(ctx);await ctx.reply(t(ctx,'reward',economy.award(jid,'daily',ctx.msg?.key?.id)));}};
