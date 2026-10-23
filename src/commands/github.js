import {parseTarget,lookup,formatRepo,formatUser,GhError} from '../fun/github.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(6);
export default {name:'github',aliases:['gh','repo'],category:'Tools',description:'GitHub user or repository lookup',usage:'github <user> | github <owner/repo>',minArgs:1,
 async run(ctx){
  const t=parseTarget(ctx.args[0]);
  if(!t)return ctx.reply('Format: github torvalds  or  github torvalds/linux');
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 6 lookups per minute.');
  try{const j=await lookup(t);return ctx.reply(t.repo?formatRepo(j):formatUser(j));}
  catch(e){
   if(e instanceof GhError&&e.code==='NONE')return ctx.reply('Not found on GitHub: '+ctx.args[0].slice(0,60));
   if(e instanceof GhError&&e.code==='LIMIT'){const m=e.reset?Math.max(1,Math.ceil((e.reset-Date.now())/60000)):null;return ctx.reply('GitHub lookup limit reached for now.'+(m?' Try again in about '+m+' min.':' Try again later.'));}
   return ctx.reply('GitHub is not responding right now. Try again in a minute.');
  }
 }};
