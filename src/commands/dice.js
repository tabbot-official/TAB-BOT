import {rt} from '../i18n/runtime.js';
import crypto from 'node:crypto';import {pick} from '../games/engine.js';import {jokes,quotes,facts} from '../games/data.js';
export default {name:'dice',category:'Games',description:'Roll one six-sided die',usage:'dice',async run(ctx){await ctx.reply(rt(ctx,'dice_result',{number:crypto.randomInt(1,7)}));}};
