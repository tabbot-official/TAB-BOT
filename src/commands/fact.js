import crypto from 'node:crypto';import {pick} from '../games/engine.js';import {jokes,quotes,facts} from '../games/data.js';
export default {name:'fact',category:'Games',description:'A simple fact',usage:'fact',async run(ctx){await ctx.reply(pick(facts));}};
