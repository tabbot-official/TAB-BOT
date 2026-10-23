import crypto from 'node:crypto';import {pick} from '../games/engine.js';import {jokes,quotes,facts} from '../games/data.js';
export default {name:'quote',category:'Games',description:'A short encouraging thought',usage:'quote',async run(ctx){await ctx.reply(pick(quotes));}};
