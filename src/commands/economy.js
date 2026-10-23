import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'economy',category:'Economy',description:'Virtual economy economy',usage:'economy',async run(ctx){await ctx.reply(t(ctx,'economy_notice')+'\n'+t(ctx,'rules_summary',{...economy.rules(),seconds:economy.rules().earnCooldown/1000}));}};
