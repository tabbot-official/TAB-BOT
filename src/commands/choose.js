import {pick,options} from '../games/engine.js';
export default {name:'choose',category:'Games',description:'Pick from 2-10 options',usage:'choose option1 | option2',minArgs:1,async run(ctx){await ctx.reply(pick(options(ctx.args.join(' '))));}};
