import {playerJid} from '../economy/identity.js';
import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'profile',category:'Economy',description:'Virtual economy profile',usage:'profile',async run(ctx){const jid=playerJid(ctx);const u=economy.user(jid);await ctx.reply(t(ctx,'profile',{...u,player:u.id.slice(0,6)}));}};
