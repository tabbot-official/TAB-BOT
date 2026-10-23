import {rt} from '../i18n/runtime.js';
import crypto from 'node:crypto';import {pick} from '../games/engine.js';import {jokes,quotes,facts} from '../games/data.js';
export default {name:'coinflip',category:'Games',description:'Flip a coin',usage:'coinflip',async run(ctx){await ctx.reply(rt(ctx,'coin_result',{result:rt(ctx,pick(['coin_heads','coin_tails']))}));}};
