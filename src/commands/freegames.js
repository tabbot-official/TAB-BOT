import {getFreeGames,formatFree} from '../fun/freegames.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(4);
export default {name:'freegames',aliases:['epicfree','freegame'],category:'Utilities',description:'Free games on the Epic Games Store this week',usage:'freegames',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 4 checks per minute.');
  try{return await ctx.reply(formatFree(await getFreeGames()));}catch{return ctx.reply('Epic Games Store is not responding right now. Try again in a minute.');}
 }};
