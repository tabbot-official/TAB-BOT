import {getAqi,formatAqi} from '../fun/aqi.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(5);
export default {name:'aqi',aliases:['airquality','pollution'],category:'Utilities',description:'Air quality index for a city (default Kolkata)',usage:'aqi [city]',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 5 AQI checks per minute.');
  const city=(ctx.args||[]).join(' ').trim()||'Kolkata';let r;
  try{r=await getAqi(city);}catch{return ctx.reply('Air quality service is busy. Try again in a minute.');}
  if(!r)return ctx.reply('Could not find air quality data for "'+city.slice(0,40)+'". Check the city name.');
  return ctx.reply(formatAqi(r));
 }};
