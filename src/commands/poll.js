import {options} from '../games/engine.js';
import {permitted} from '../permissions/index.js';
import config from '../config/config.js';
import {register,schedule,parseDuration} from '../polls/index.js';
export default {name:'poll',category:'Games',description:'Create a group poll (any member; multi-choice with --multi)',usage:'poll question | option1 | option2 [--multi] [--time=10m]   or   poll yesno question',minArgs:1,async run(ctx){
 const p=config.prefix;
 if(!ctx.isGroup)return ctx.reply('Polls work in groups only.');
 if(process.env.POLL_ADMIN_ONLY==='true'&&!await permitted(ctx,{requiredLevel:'admin'}))return ctx.reply('Only group admins can create polls here.');
 let raw=ctx.args.join(' ');const tm=/(^|\s)--time=(\S+)/i.exec(raw);let dur=0;if(tm){dur=parseDuration(tm[2]);if(!dur)return ctx.reply('Time must be 1 minute to 24 hours, e.g. --time=10m or --time=2h');raw=raw.replace(tm[0],' ').trim();}const multi=/(^|\s)--multi\b/i.test(raw);raw=raw.replace(/(^|\s)--multi\b/ig,' ').trim();
 let name,values;
 const yn=/^(yesno|yn)\s+(.+)/i.exec(raw);
 if(yn){name=yn[2].trim();values=['Yes ✅','No ❌'];}
 else{const parts=raw.split('|').map((x)=>x.trim());name=parts.shift();if(parts.length<2)return ctx.reply('Usage: '+p+'poll question | option 1 | option 2 (2-12 options)\nMulti-choice: add --multi\nQuick yes/no: '+p+'poll yesno Pizza tonight?');
  if(parts.length>12)return ctx.reply('Max 12 options.');if(parts.some((x)=>!x||x.length>100))return ctx.reply('Each option must be 1-100 characters.');if(new Set(parts.map((x)=>x.toLowerCase())).size!==parts.length)return ctx.reply('Options must be different from each other.');values=parts;}
 if(!name||name.length>200)return ctx.reply('Question must be 1-200 characters.');
 const sent=await ctx.sock.sendMessage(ctx.jid,{poll:{name,values,selectableCount:multi?values.length:1}},{quoted:ctx.msg});
 try{const id=register(sent,{jid:ctx.jid,name,options:values,deadline:dur?Date.now()+dur:0,creator:ctx.sender});if(id&&dur){schedule(ctx.sock,id);await ctx.reply('⏱️ This poll closes automatically in '+Math.round(dur/60000)+' min and I will post the winner. Results anytime: '+p+'pollresult');}}catch{/* tracking is optional */}
}};
