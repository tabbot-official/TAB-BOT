import {playerJid} from '../economy/identity.js';
import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'achievements',category:'Economy',description:'Virtual economy achievements',usage:'achievements',async run(ctx){const jid=playerJid(ctx);await ctx.reply(t(ctx,'achievements',{items:economy.user(jid).achievements.map(a=>t(ctx,'achievement_'+a)).join(', ')||t(ctx,'none')}));}};
