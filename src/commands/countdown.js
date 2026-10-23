import {countdown} from '../utilities/time.js';
export default {name:'countdown',category:'Utilities',description:'Time until a calendar date',usage:'countdown YYYY-MM-DDTHH:mm [Asia/Kolkata]',minArgs:1,async run(ctx){await ctx.reply(countdown(ctx.args[0],ctx.args[1]));}};
