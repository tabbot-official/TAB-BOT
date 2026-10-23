import {cities,forecast} from '../weather/service.js';
import {getNews,formatNews} from '../fun/news.js';
import {wordForDay} from './words.js';
import {priceOf,hit} from './price.js';
export function fmtClock(hh,mm){return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');}
function heatWarn(tmax,tmin,rain){
 const w=[];
 if(Number.isFinite(rain)&&rain>=60)w.push('High rain chance ('+rain+'%) - carry an umbrella.');
 if(Number.isFinite(tmax)&&tmax>=40)w.push('Heat alert: high of '+tmax+'C - stay hydrated.');
 if(Number.isFinite(tmin)&&tmin<=5)w.push('Cold alert: low of '+tmin+'C - keep warm.');
 return w.length?'\n⚠️ '+w.join('\n⚠️ '):'';
}
export async function buildSub(job){
 if(job.kind==='weatheralert'){
  const p=job.payload?.place;if(!p)throw Error('no place');
  const d=await forecast(p);
  const day=d.daily;
  const hi=day.temperature_2m_max?.[0],lo=day.temperature_2m_min?.[0],rain=day.precipitation_probability_max?.[0];
  return '🌤️ *Daily Weather - '+[p.name,p.region].filter(Boolean).join(', ')+'*\nHigh '+hi+'C / Low '+lo+'C\nRain chance: '+rain+'%\nUV max: '+(day.uv_index_max?.[0]??'n/a')+heatWarn(hi,lo,rain);
 }
 if(job.kind==='newsdigest'){
  const topic=job.payload?.topic||'';
  const items=await getNews(topic);
  if(!items.length)return null;
  return '🗞️ *Your Daily Digest*\n'+formatNews(topic?topic[0].toUpperCase()+topic.slice(1,30):'India',items).slice(0,3500);
 }
 if(job.kind==='wordoftheday')return wordForDay();
 if(job.kind==='reminder')return '\u23f0 *Reminder:* '+String(job.payload?.text||'').slice(0,300);
 if(job.kind==='habit')return '⏰ *Habit check:* did you do "'+String(job.payload?.name||'').slice(0,60)+'" today?\nReply: /habit done '+String(job.payload?.name||'').slice(0,40);
 return null;
}
export async function buildWatch(job){
 if(job.kind==='price'){
  let q;try{q=await priceOf(job.asset);}catch{return null;}
  const cur=q.inr!=null?{v:q.inr,sym:'₹'}:{v:q.price,sym:q.currency==='INR'?'₹':'$'};
  if(!hit(job,cur.v))return null;
  return '🔔 *Price alert:* '+job.asset.toUpperCase()+' is now '+cur.sym+cur.v+' ('+job.dir+' your target of '+cur.sym+job.target+').';
 }
 return null;
}
