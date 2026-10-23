import {getRace,startRace,stopRace,tryFinish} from '../fun/typerace.js';
import {featOn,featReply} from '../config/features.js';
export default {name:'typerace',aliases:['typeracer','fasttype'],category:'Games',
 description:'Group typing race - first to retype the sentence exactly wins',
 usage:'typerace start | typerace stop',
 async run(ctx){
  if(!featOn('typerace'))return featReply(ctx,'typerace');
  if(!ctx.isGroup)return ctx.reply('Typerace is a group game. Run it in a group.');
  const a=(ctx.args[0]||'start').toLowerCase();
  if(a==='stop'){stopRace(ctx.jid);return ctx.reply('🛑 Race cancelled.');}
  if(getRace(ctx.jid))return ctx.reply('A race is already running! Type the sentence exactly as shown.');
  const s=startRace(ctx.jid);
  return ctx.reply('⌨️ *TYPERACE!* ⌨️\n\nRetype this sentence exactly, as fast as you can. Race opens in 5 seconds:\n\n"'+s.sentence+'"\n\nFirst exact match wins. /typerace stop to cancel.');
 }};
export async function typeracePlain({sock,msg,jid,sender,text}){
 const r=getRace(jid);if(!r)return;
 const w=tryFinish(jid,sender,text);if(!w)return;
 await sock.sendMessage(jid,{text:'🏆 *'+w.user+'* wins the typerace!\nTime: '+w.secs+'s - Speed: '+w.wpm+' WPM - Accuracy: '+w.acc+'%'});
}
