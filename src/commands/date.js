import {dateTime} from '../utilities/time.js';
export default {name:'date',category:'Utilities',description:'Current calendar date',usage:'date [Asia/Kolkata]',async run(ctx){await ctx.reply(dateTime(ctx.args[0]).split(' ')[0]);}};
