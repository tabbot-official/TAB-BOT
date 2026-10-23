import crypto from 'node:crypto';import {pick} from '../games/engine.js';import {jokes,quotes,facts} from '../games/data.js';
export default {name:'joke',category:'Games',description:'A short joke',usage:'joke',async run(ctx){await ctx.reply(pick(jokes));}};
