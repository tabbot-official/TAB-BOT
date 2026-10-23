import {ascii} from '../utilities/text.js';
export default {name:'ascii',category:'Utilities',description:'English text to ASCII art',usage:'ascii <text>',minArgs:1,async run(ctx){await ctx.reply('```\n'+await ascii(ctx.args.join(' '))+'\n```');}};
