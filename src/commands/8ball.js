import {RuntimeInputError} from '../i18n/runtime.js';
import {rt} from '../i18n/runtime.js';
import {pick} from '../games/engine.js';
export default {name:'8ball',category:'Games',description:'Playful random answer, not advice',usage:'8ball <question>',minArgs:1,async run(ctx){if(ctx.args.join(' ').length>300)throw new RuntimeInputError('ball_question_limit');await ctx.reply(rt(ctx,'ball_result',{answer:rt(ctx,pick(['ball_yes','ball_no','ball_probably','ball_unlikely','ball_later','ball_good','ball_unknown']))}));}};
