import {resolveSign,getHoroscope,format,SIGNS} from '../fun/horoscope.js';
export default {name:'horoscope',aliases:['rashifal','rashi','zodiac'],category:'Utilities',description:'Daily horoscope for your zodiac sign',usage:'horoscope <sign>  (e.g. leo, or hindi: singh, mesh, kark)',minArgs:1,
 async run(ctx){
  const sign=resolveSign(ctx.args[0]);
  if(!sign)return ctx.reply('Unknown sign. Use one of:\n'+Object.entries(SIGNS).map(([e,h])=>`${e} (${h[0]})`).join(', '));
  try{return await ctx.reply(format(sign,await getHoroscope(sign)));}
  catch{return ctx.reply('Could not fetch the horoscope right now. Try again in a minute.');}
 }};
