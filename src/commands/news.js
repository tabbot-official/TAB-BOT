import {getNews,formatNews,topicList} from '../fun/news.js';
import {makeRate} from '../fun/limiter.js';
import {newsPrefs} from '../ops/index.js';
const rate=makeRate(5);
export default {name:'news',aliases:['headlines'],category:'Utilities',description:'Latest news headlines; save your default topic with /news set <topic>',usage:'news [topic] | news set <topic> | news clear (topics: india, world, tech, sports, business, entertainment, science, health)',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 5 news requests per minute.');
  const me=String(ctx.senderJid||ctx.sender||'').split(':')[0].split('@')[0];
  let arg=(ctx.args||[]).join(' ').trim();
  if(/^set\s+/i.test(arg)){const t=arg.replace(/^set\s+/i,'').trim().toLowerCase();if(!t)return ctx.reply('Usage: /news set <topic>');newsPrefs.data[me]=t;newsPrefs.save();return ctx.reply('\u2705 Your default news topic saved: '+t+'. Now /news shows it directly. Clear: /news clear');}
  if(/^clear$/i.test(arg)){delete newsPrefs.data[me];newsPrefs.save();return ctx.reply('Default topic cleared.');}
  if(!arg&&newsPrefs.data[me])arg=newsPrefs.data[me];
  let items;
  try{items=await getNews(arg);}catch{return ctx.reply('News service is busy right now. Try again in a minute.');}
  if(!items.length)return ctx.reply('No news found for "'+arg.slice(0,40)+'". Topics: '+topicList().join(', '));
  return ctx.reply(formatNews(arg?arg[0].toUpperCase()+arg.slice(1,40):'India',items));
 }};
