import {cities,forecast,formatWeather} from '../weather/service.js';
const choices=new Map(),recent=new Map();
const identity=ctx=>`${ctx.jid}:${ctx.senderJid||ctx.sender}`;
export default {name:'weather',category:'Tools',description:'Detailed local weather, sun and calculated moon times',usage:'weather <city[, country]> | pick <1-10>',async run(ctx){
 const key=identity(ctx),args=ctx.args||[];let place;
 try{
  if(!args.length)return ctx.reply('Use /weather city, for example /weather Kolkata. Country or region helps distinguish cities: /weather London, United Kingdom.');
  if(args[0]==='pick'){
   const pending=choices.get(key);const n=Number(args[1]);if(args.length!==2||!Number.isInteger(n)||n<1||!pending||pending.expires<Date.now()||n>pending.places.length)return ctx.reply('Location choice expired or invalid. Use /weather city again.');
   place=pending.places[n-1];choices.delete(key);
  }else{
   if(Date.now()-(recent.get(key)||0)<5000)return ctx.reply('Wait5seconds before another weather search.');recent.set(key,Date.now());if(recent.size>1000)recent.clear();
   const found=await cities(args.join(' '));if(!found.length)return ctx.reply('City not found. Use a city name, optionally followed by a comma and country or region.');
   if(found.length>1){if(choices.size>=500)choices.clear();choices.set(key,{places:found,expires:Date.now()+300000});return ctx.reply('Choose the location:\n'+found.map((p,i)=>`${i+1}. ${p.name}, ${p.region}, ${p.country} (${p.timezone})`).join('\n')+'\nUse /weather pick number in this chat. Choice expires in5minutes.');}
   place=found[0];
  }
  const data=await forecast(place);await ctx.reply(formatWeather(place,data));
 }catch{await ctx.reply('Weather unavailable or request invalid. Try /weather city, country. No paid fallback.');}
}};
