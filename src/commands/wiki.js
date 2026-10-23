import {wikiSummary,formatWiki} from '../fun/wiki.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(6);
export default {name:'wiki',aliases:['wikipedia'],category:'Utilities',description:'Wikipedia summary of any topic',usage:'wiki <topic>',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 6 searches per minute.');
  const q=ctx.args.join(' ').trim();let r;
  try{r=await wikiSummary(q);}catch{return ctx.reply('Wikipedia is not responding right now. Try again in a minute.');}
  return ctx.reply(r?formatWiki(r):'No Wikipedia article found for "'+q.slice(0,50)+'".');
 }};
