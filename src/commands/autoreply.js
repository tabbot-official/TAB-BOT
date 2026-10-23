import config from '../config/config.js';
import {getState,setEnabled,setMessage,DEFAULT_MESSAGE,setStyle,addSample,clearSamples,samples} from '../autoreply/index.js';
export default {name:'autoreply',aliases:['ar'],category:'Tools',ownerOnly:true,description:'Auto reply when you are busy (DMs and group mentions)',
 usage:'autoreply on|off|status|set <message>|reset|style ...',minArgs:0,
 async run(ctx){
  const p=config.prefix;const a=(ctx.args[0]||'status').toLowerCase();
  if(a==='on'||a==='off'){setEnabled(a==='on');return ctx.reply('Auto reply is now '+a.toUpperCase()+(a==='on'?'.\nI will reply once (per person, every 30 min) when someone DMs you or mentions/replies to you in a group.':'.'));}
  if(a==='set'){const m=ctx.args.slice(1).join(' ').trim();if(!m)return ctx.reply('Usage: '+p+'autoreply set <your message>');if(m.length>500)return ctx.reply('Max 500 characters.');setMessage(m);return ctx.reply('✅ Auto reply message saved:\n"'+m+'"\nTurn it on with '+p+'autoreply on');}
  if(a==='reset'){setMessage('');return ctx.reply('Auto reply message reset to default:\n"'+DEFAULT_MESSAGE+'"');}
  if(a==='style'){const b=(ctx.args[1]||'status').toLowerCase();const st=getState();
   if(b==='on'||b==='off'){if(b==='on'&&samples().length<3)return ctx.reply('Add at least 3 sample messages first: '+p+'autoreply style add <a message you would send>\n(or '+p+'autoreply style learn on to learn from your own DMs).');setStyle('style',b==='on');return ctx.reply('Style replies '+b.toUpperCase()+(b==='on'?'.\nWhen autoreply is ON, the bot answers in your style via AI (needs an AI key), ends with a robot tag, and refuses money/OTP/urgent topics (those get the plain busy message). Your samples are sent to the AI provider as text only.':'.'));}
   if(b==='add'){const t=ctx.args.slice(2).join(' ');return ctx.reply(addSample(t)?'Saved. Samples: '+samples().length+'/40.':'Not saved (2-200 chars, no links or long numbers).');}
   if(b==='learn'){const v=(ctx.args[2]||'').toLowerCase();if(v!=='on'&&v!=='off')return ctx.reply('Use '+p+'autoreply style learn on|off. When ON, text of messages YOU send in private chats is saved locally (last 40, text only, no names or numbers) to learn your style.');setStyle('learn',v==='on');return ctx.reply('Learning from your own DMs: '+v.toUpperCase());}
   if(b==='tag'){const v=(ctx.args[2]||'').toLowerCase();setStyle('tag',v!=='off');return ctx.reply('Robot tag '+(v==='off'?'OFF (replies will look exactly like you; use responsibly).':'ON.'));}
   if(b==='list')return ctx.reply(samples().length?'Samples:\n'+samples().slice(-15).map((x,i)=>(i+1)+'. '+x).join('\n'):'No samples yet.');
   if(b==='clear'){clearSamples();return ctx.reply('Samples cleared.');}
   return ctx.reply('Style replies: *'+(st.style?'ON':'OFF')+'* | samples '+samples().length+' | learn '+(st.learn?'ON':'OFF')+' | tag '+(st.tag?'ON':'OFF')+'\n'+p+'autoreply style on|off|add <text>|learn on|off|tag on|off|list|clear');}
  if(a==='status'){const s=getState();return ctx.reply('Auto reply: *'+(s.enabled?'ON':'OFF')+'*\nMessage: "'+s.text+'"\n\n'+p+'autoreply on|off\n'+p+'autoreply set <message>\n'+p+'autoreply reset');}
  return ctx.reply('Usage: '+p+'autoreply on|off|status|set <message>|reset');
 }};
