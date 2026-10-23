import {playerJid,freshCommand} from '../economy/identity.js';
import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'earn',category:'Economy',description:'Virtual economy earn',usage:'earn',async run(ctx){freshCommand(ctx);const jid=playerJid(ctx);await ctx.reply(t(ctx,'reward',economy.award(jid,'earn',ctx.msg?.key?.id)));}};
