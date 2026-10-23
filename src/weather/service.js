import {getMoonTimes,getMoonIllumination} from './suncalc.js';
const forecastURL='https://api.open-meteo.com/v1/forecast',geocodeURL='https://geocoding-api.open-meteo.com/v1/search';
const cache=new Map();let calls=[];
function budget(now){calls=calls.filter(x=>now-x<86400000);if(calls.length>=900||calls.filter(x=>now-x<60000).length>=50)throw Error('Daily weather request budget reached. No paid fallback.');calls.push(now);}
async function json(url,fetcher){const r=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Weather source unavailable ('+r.status+').');const raw=await r.text();if(raw.length>500000)throw Error('Weather response too large');return JSON.parse(raw);}
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export async function cities(query,{fetcher=fetch,now=Date.now()}={}){
 if(typeof query!=='string'||query.trim().length<2||query.length>100)throw Error('Use /weather city or /weather city, country');
 const [city,...regions]=query.split(',').map(x=>x.trim());const region=regions.join(',').toLowerCase();
 const key='geo:'+query.trim().toLowerCase(),old=cache.get(key);if(old&&now-old.at<86400000)return old.value;
 budget(now);const u=new URL(geocodeURL);u.search=new URLSearchParams({name:city,count:10,language:'en',format:'json'});const j=await json(u,fetcher);
 const value=(j.results||[]).filter(p=>!region||[p.country,p.country_code,p.admin1,p.admin2].some(x=>String(x||'').toLowerCase()===region)).filter(p=>finite(p.latitude)&&finite(p.longitude)&&typeof p.timezone==='string').map(p=>({id:p.id,name:p.name,region:p.admin1||'',country:p.country||'',latitude:p.latitude,longitude:p.longitude,timezone:p.timezone}));
 if(cache.size>=200)cache.clear();cache.set(key,{at:now,value});return value;
}
export async function forecast(place,{fetcher=fetch,now=Date.now()}={}){
 if(!finite(place.latitude)||!finite(place.longitude)||Math.abs(place.latitude)>90||Math.abs(place.longitude)>180)throw Error('Invalid weather location');
 const key=`forecast:${place.latitude}:${place.longitude}`,old=cache.get(key);if(old&&now-old.at<600000)return old.value;
 budget(now);const u=new URL(forecastURL);u.search=new URLSearchParams({latitude:place.latitude,longitude:place.longitude,timezone:place.timezone,forecast_days:3,current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',hourly:'temperature_2m,precipitation_probability,precipitation,cloud_cover,visibility,uv_index,relative_humidity_2m',daily:'temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max'});
 const value=await json(u,fetcher);if(!value.current||!Array.isArray(value.hourly?.time)||!Array.isArray(value.daily?.time)||typeof value.timezone!=='string')throw Error('Incomplete weather response');
 if(cache.size>=200)cache.clear();cache.set(key,{at:now,value});return value;
}
const localDay=(d,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
/** SunCalc scans UTC days. Gather neighbouring UTC windows, filter actual local date. */
export function moon(date,place){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid astronomy date');
 const noon=Date.parse(date+'T12:00:00Z'),rise=[],set=[];
 for(const offset of [-1,0,1]){const t=getMoonTimes(new Date(noon+offset*86400000),place.latitude,place.longitude);for(const [key,list]of [['rise',rise],['set',set]])if(t[key]&&Number.isFinite(t[key].valueOf())&&localDay(t[key],place.timezone)===date&&!list.some(d=>Math.abs(d-t[key])<1000))list.push(t[key]);}
 const illumination=getMoonIllumination(new Date(noon));
 return {rise:rise.sort((a,b)=>a-b),set:set.sort((a,b)=>a-b),illumination:illumination.fraction*100,phase:illumination.phase};
}
const show=(v,unit='')=>finite(v)?v+unit:'Unavailable';
const clock=(d,tz)=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
const isoClock=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x)?x.slice(11,16):'No event / unavailable';
export function formatWeather(place,data){
 const c=data.current,d=data.daily,h=data.hourly,date=d.time[0];const lunar=moon(date,place);
 let i=h.time.findIndex(x=>x>=c.time);if(i<0)i=h.time.length-1;
 if(i>0&&h.time[i]?.slice(0,13)!==c.time?.slice(0,13))i--;
 if(i<0)throw Error('Hourly weather unavailable');
 const W=44,bar=n=>'═'.repeat(n);
 const clip=s=>s.length>W-4?s.slice(0,W-5)+'…':s;
 const row=s=>'║ '+clip(s).padEnd(W-4)+' ║';
 const kv=(k,v)=>row(k.padEnd(17)+v);
 const top='╔'+bar(W-2)+'╗',mid='╠'+bar(W-2)+'╣',bot='╚'+bar(W-2)+'╝';
 const head=t=>[mid,row('  '+t.toUpperCase()),mid];
 const place3=[place.name,place.region,place.country].filter(Boolean).join(', ');
 const out=[top,row('WEATHER REPORT'),row(place3),mid,row('Zone: '+data.timezone),row('As of '+(c.time?.replace('T',' ')||'unavailable')+' local'),row('Model conditions, not a station'),row('observation')];
 out.push(...head('Now'),kv('Temperature',show(c.temperature_2m,'°C')),kv('Feels like',show(c.apparent_temperature,'°C')),kv('Today high/low',`${show(d.temperature_2m_max?.[0],'°C')} / ${show(d.temperature_2m_min?.[0],'°C')}`),kv('Humidity',show(c.relative_humidity_2m,'%')),kv('Clouds',show(c.cloud_cover,'%')),kv('Wind',`${show(c.wind_speed_10m,'km/h')} from ${show(c.wind_direction_10m,'°')}`),kv('Gusts',show(c.wind_gusts_10m,'km/h')),kv('Pressure',show(c.pressure_msl,'hPa')),kv('Visibility',finite(h.visibility?.[i])?show(h.visibility[i]/1000,'km'):'Unavailable'),kv('UV now / max',`${show(h.uv_index?.[i])} / ${show(d.uv_index_max?.[0])}`));
 out.push(...head('Precipitation'),kv('Now',show(c.precipitation,'mm')),kv('Rain',show(c.rain,'mm')),kv('Snow',show(c.snowfall,'cm')),kv('Chance now',show(h.precipitation_probability?.[i],'%')+' (forecast hour)'),kv('Chance day max',show(d.precipitation_probability_max?.[0],'%')),kv('Total today',show(d.precipitation_sum?.[0],'mm')));
 out.push(...head('Sun and Moon'),kv('Sunrise',isoClock(d.sunrise?.[0])),kv('Sunset',isoClock(d.sunset?.[0])),kv('Daylight',finite(d.daylight_duration?.[0])?(d.daylight_duration[0]/3600).toFixed(1)+'h':'Unavailable'),kv('Moonrise',lunar.rise.map(x=>clock(x,place.timezone)).join(', ')||'No event today'),kv('Moonset',lunar.set.map(x=>clock(x,place.timezone)).join(', ')||'No event today'),kv('Moon lit',lunar.illumination.toFixed(1)+'% (calculated)'));
 out.push(...head('Next hours'),row('Time   Temp    Rain   Cloud'));
 for(let n=i;n<Math.min(i+6,h.time.length);n++)out.push(row(isoClock(h.time[n]).padEnd(7)+show(h.temperature_2m?.[n],'°C').padEnd(8)+show(h.precipitation_probability?.[n],'%').padEnd(7)+show(h.cloud_cover?.[n],'%')));
 if(d.time.length>1){out.push(...head('Next days'),row('Date         Low - High      Rain'));
 for(let n=1;n<Math.min(3,d.time.length);n++)out.push(row(d.time[n].padEnd(13)+(show(d.temperature_2m_min?.[n],'°C')+' - '+show(d.temperature_2m_max?.[n],'°C')).padEnd(16)+show(d.precipitation_probability_max?.[n],'%')));}
 out.push(mid,row('Data: Open-Meteo (CC BY 4.0).'),row('Forecasts are not guarantees.'),row('Astronomy: SunCalc 2.0.1, calculated;'),row('horizon affects real sighting.'),row('All times are location-local.'),bot);
 return '```\n'+out.join('\n')+'\n```';
}
