import {dateTime} from '../utilities/time.js';
export default {name:'time',category:'Utilities',description:'Current timezone time',usage:'time [Asia/Kolkata]',async run(ctx){await ctx.reply(dateTime(ctx.args[0]));}};
