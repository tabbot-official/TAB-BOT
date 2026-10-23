import {findMovie,formatMovie} from '../fun/movie.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(6);
export default {name:'movie',aliases:['film','imdb'],category:'Utilities',description:'Movie rating, cast and plot',usage:'movie <title> [year]',minArgs:1,
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 6 movie searches per minute.');
  const q=ctx.args.join(' ').trim();let r;
  try{r=await findMovie(q);}catch{return ctx.reply('Movie service is busy. Try again in a minute.');}
  if(r.error==='NO_KEY')return ctx.reply('Movie search is not set up yet. The owner needs to add OMDB_API_KEY (free key from omdbapi.com/apikey.aspx) to the bot settings.');
  if(r.error==='BAD_KEY')return ctx.reply('Movie search key was rejected. The owner should check OMDB_API_KEY.');
  if(r.error==='NONE')return ctx.reply('No movie found for "'+q.slice(0,50)+'". Try the exact title, optionally with the year.');
  const m=r.movie;const text=formatMovie(m);
  try{if(m.Poster&&m.Poster!=='N/A')return await ctx.sock.sendMessage(ctx.jid,{image:{url:m.Poster},caption:text},{quoted:ctx.msg});}catch{/* send text instead */}
  return ctx.reply(text);
 }};
