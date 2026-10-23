import {fetchMatches,pick,formatMatch} from '../cricket/cricbuzz.js';
const hits=new Map();
const ok=(u,now=Date.now())=>{const a=(hits.get(u)||[]).filter(t=>now-t<60000);if(a.length>=6)return false;hits.set(u,[...a,now]);if(hits.size>3000)hits.clear();return true;};
export default {name:'cricket',aliases:['score','cric','livescore'],category:'Tools',description:'Live cricket scores and match updates',
 usage:'cricket | cricket live | cricket recent | cricket upcoming | cricket india',
 async run(ctx){
  if(!ok(ctx.sender))return ctx.reply('Slow down a little - max 6 cricket requests per minute.');
  let matches;try{matches=await fetchMatches();}catch{return ctx.reply('🏏 Live scores are not available right now. Please try again in a minute.');}
  const {mode,list}=pick(matches,(ctx.args||[]).join(' '));
  if(!list.length)return ctx.reply(mode==='live'||mode==='recent'?'🏏 No matches to show right now. Try: cricket upcoming':'🏏 No matches found for that. Try: cricket live, cricket recent, cricket upcoming or a team name like india.');
  const title={live:'🔴 Live matches',recent:'✅ Recent results',upcoming:'🗓️ Upcoming matches',search:'🏏 Matches'}[mode];
  const body=list.slice(0,5).map((m)=>formatMatch(m)).join('\n\n');
  return ctx.reply(`${title}\n\n${body}\n\n_Source: Cricbuzz. Try: cricket live | recent | upcoming | <team>_`);
 }};
