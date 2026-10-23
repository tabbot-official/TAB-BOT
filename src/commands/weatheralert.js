import {subs} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
import {cities} from '../weather/service.js';
import {parseClock,who} from '../subs/parse.js';
import {fmtClock} from '../subs/dispatch.js';
export default {name:'weatheralert',aliases:['walert','rainalert'],category:'Utilities',
 description:'Daily morning weather alert for your city (rain/heat warnings)',
 usage:'weatheralert set <city> [time like 7am] | weatheralert off | weatheralert status',minArgs:1,
 async run(ctx){
  if(!featOn('weatheralert'))return featReply(ctx,'weatheralert');
  const [a,...rest]=ctx.args;const act=a.toLowerCase();const me=who(ctx);
  const mineList=subs.forRecipient(ctx.jid).filter(j=>j.kind==='weatheralert'&&j.owner===me);
  if(act==='off'||act==='stop'){let n=0;for(const j of mineList){if(subs.cancel(j.id))n++;}return ctx.reply(n?'✅ Weather alerts turned off for you here.':'You have no weather alert set here.');}
  if(act==='status'){return ctx.reply(mineList.length?mineList.map(j=>'🌤️ Daily at '+fmtClock(j.hh,j.mm)+' - '+j.payload.place.name+(j.payload.place.region?', '+j.payload.place.region:'')).join('\n'):'No weather alert set. Use: /weatheralert set <city> [7am]');}
  if(act!=='set')return ctx.reply('Usage: /weatheralert set <city> [time] | /weatheralert status | /weatheralert off');
  let timeArg=null;const words=[...rest];
  if(words.length&&/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(words[words.length-1]))timeArg=words.pop();
  const t=parseClock(timeArg,{hh:7,mm:0});if(!t)return ctx.reply('Could not read that time. Try 7am or 18:30.');
  const city=words.join(' ').trim();if(city.length<2)return ctx.reply('Which city? Example: /weatheralert set Kolkata 7am');
  let places;try{places=await cities(city);}catch(e){return ctx.reply(e.message||'Weather lookup failed. Try again later.');}
  if(!places.length)return ctx.reply('City not found. Try "city, country" like: /weatheralert set Pune, India');
  const place=places[0];
  for(const j of mineList)subs.cancel(j.id);
  try{subs.add({kind:'weatheralert',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm,payload:{place}});}catch(e){return ctx.reply('Too many subscriptions on the bot right now. Try later.');}
  return ctx.reply('✅ Daily weather alert set for '+place.name+(place.region?', '+place.region:'')+' at '+fmtClock(t.hh,t.mm)+' (IST) in this chat.\nTurn off: /weatheralert off');
 }};
