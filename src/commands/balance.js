import {playerJid} from '../economy/identity.js';
import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'balance',category:'Economy',description:'Virtual economy balance',usage:'balance',async run(ctx){const jid=playerJid(ctx);const u=economy.user(jid);await ctx.reply(t(ctx,'balance',u));}};
