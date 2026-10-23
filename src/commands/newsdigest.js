import {subs} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
import {topicList} from '../fun/news.js';
import {parseClock,who} from '../subs/parse.js';
import {fmtClock} from '../subs/dispatch.js';
export default {name:'newsdigest',aliases:['newsdaily','morningnews'],category:'Utilities',
 description:'Daily news digest on your chosen topic, delivered every morning',
 usage:'newsdigest set <topic> [time like 8am] | newsdigest off | newsdigest status',minArgs:1,
 async run(ctx){
  if(!featOn('newsdigest'))return featReply(ctx,'newsdigest');
  const [a,...rest]=ctx.args;const act=a.toLowerCase();const me=who(ctx);
  const mineList=subs.forRecipient(ctx.jid).filter(j=>j.kind==='newsdigest'&&j.owner===me);
  if(act==='off'||act==='stop'){let n=0;for(const j of mineList){if(subs.cancel(j.id))n++;}return ctx.reply(n?'✅ News digest turned off for you here.':'You have no digest set here.');}
  if(act==='status'){return ctx.reply(mineList.length?mineList.map(j=>'🗞️ Daily at '+fmtClock(j.hh,j.mm)+' - topic: '+(j.payload.topic||'india')).join('\n'):'No digest set. Use: /newsdigest set <topic> [8am]');}
  if(act!=='set')return ctx.reply('Usage: /newsdigest set <topic> [time] | /newsdigest status | /newsdigest off\nTopics: '+topicList().join(', '));
  let timeArg=null;const words=[...rest];
  if(words.length&&/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(words[words.length-1]))timeArg=words.pop();
  const t=parseClock(timeArg,{hh:8,mm:0});if(!t)return ctx.reply('Could not read that time. Try 8am or 18:30.');
  const topic=words.join(' ').trim();
  for(const j of mineList)subs.cancel(j.id);
  try{subs.add({kind:'newsdigest',recipient:ctx.jid,owner:me,hh:t.hh,mm:t.mm,payload:{topic}});}catch(e){return ctx.reply('Too many subscriptions on the bot right now. Try later.');}
  return ctx.reply('✅ Daily news digest set: "'+(topic||'india')+'" at '+fmtClock(t.hh,t.mm)+' (IST) in this chat.\nTurn off: /newsdigest off');
 }};
