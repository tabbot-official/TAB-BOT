import {findLyrics,formatLyrics} from '../fun/lyrics.js';
const hits=new Map();
const ok=(u,now=Date.now())=>{const a=(hits.get(u)||[]).filter(t=>now-t<60000);if(a.length>=4)return false;hits.set(u,[...a,now]);if(hits.size>3000)hits.clear();return true;};
export default {name:'lyrics',aliases:['lyric','songtext'],category:'Tools',description:'Find song lyrics by name',usage:'lyrics <song name> [artist]',minArgs:1,
 async run(ctx){
  if(!ok(ctx.sender))return ctx.reply('Slow down - max 4 lyrics searches per minute.');
  const q=(ctx.args||[]).join(' ').trim();
  if(q.length<2)return ctx.reply('Send a song name. Example: lyrics tum hi ho arijit singh');
  let r=null;try{r=await findLyrics(q);}catch{r=null;}
  if(!r)return ctx.reply('🎵 No lyrics found for "'+q.slice(0,60)+'". Try the song name with the artist, like: lyrics yellow coldplay');
  return ctx.reply(formatLyrics(r));
 }};
