import dayjs from 'dayjs';import utc from 'dayjs/plugin/utc.js';import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);dayjs.extend(timezone);
const UNIT={s:1e3,sec:1e3,secs:1e3,second:1e3,seconds:1e3,m:6e4,min:6e4,mins:6e4,minute:6e4,minutes:6e4,h:36e5,hr:36e5,hrs:36e5,hour:36e5,hours:36e5,d:864e5,day:864e5,days:864e5};
const DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const REL=/^(?:in\s+)?((?:\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|[smhd])\s*(?:and\s+)?)+)(?=\s|$)/i;
const CLOCK=/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s|$)/i;
function clock(m){let h=Number(m[1]);const mi=m[2]?Number(m[2]):0;const ap=(m[3]||'').toLowerCase();if(mi>59)return null;if(ap){if(h<1||h>12)return null;if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;}else{if(h>23)return null;if(!m[2]&&!ap)return null;}return {h,mi};}
/** Parse "30m drink water", "in 2 hours call", "6pm call mom", "tomorrow 9am gym", "kal 7:30am ...", "monday 10am ...", "call mom at 6pm". */
function hinglishNorm(s){
 // "shaam 7 baje" -> "7 pm", "subah 6:30 baje" -> "6:30 am", "raat 10 baje" -> "10 pm", "dopahar 2 baje" -> "2 pm"
 return s.replace(/\b(subah|savere|saverae|morning)\s+(\d{1,2})(?::(\d{2}))?\s*(?:baje|bajke)?\b/gi,(m,a,h,mi)=>h+(mi?':'+mi:'')+' am')
        .replace(/\b(dopahar|afternoon)\s+(\d{1,2})(?::(\d{2}))?\s*(?:baje|bajke)?\b/gi,(m,a,h,mi)=>h+(mi?':'+mi:'')+' pm')
        .replace(/\b(shaam|sham|evening|raat|rat|night)\s+(\d{1,2})(?::(\d{2}))?\s*(?:baje|bajke)?\b/gi,(m,a,h,mi)=>h+(mi?':'+mi:'')+' pm')
        .replace(/\b(\d{1,2}(?::\d{2})?)\s*baje\b/gi,'$1');
}
export function parseReminder(args,now=Date.now(),tz='Asia/Kolkata'){
 let s=hinglishNorm(args.join(' ').trim());if(!s)return null;
 const base=dayjs(now).tz(tz);
 let m=REL.exec(s);
 if(m){let ms=0;for(const p of m[1].matchAll(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|[smhd])/gi))ms+=Number(p[1])*UNIT[p[2].toLowerCase()];if(ms<60e3)return {error:'min'};return fin(now+ms,s.slice(m[0].length));}
 let day=null;const dm=/^(today|aaj|tomorrow|tmrw|tomorow|kal|parso|day after tomorrow|(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b\s*/i.exec(s);
 if(dm){const w=dm[1].toLowerCase();if(w==='today'||w==='aaj')day=0;else if(['tomorrow','tmrw','tomorow','kal'].includes(w))day=1;else if(w==='parso'||w==='day after tomorrow')day=2;else{const t=DAYS.indexOf(dm[2].toLowerCase());day=((t-base.day()+7)%7)||7;}s=s.slice(dm[0].length);}
 m=CLOCK.exec(s);
 if(!m&&day!==null){return {error:'time'};}
 if(!m){// trailing "... at 6pm" / "... in 30m"
  const t=/^(.*?)\s+(at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|in\s+(?:\d+(?:\.\d+)?\s*[a-z]+\s*)+)$/i.exec(s);
  if(t){const r=parseReminder([t[2],t[1]],now,tz);return r;}
  return null;}
 const c=clock(m);if(!c)return {error:'time'};
 let d=base.add(day||0,'day').hour(c.h).minute(c.mi).second(0).millisecond(0);
 if(day===null&&d.valueOf()<=now)d=d.add(1,'day');
 return fin(d.valueOf(),s.slice(m[0].length));
 function fin(at,rest){const text=rest.replace(/^\s*(to|that|about|ke liye|ki|:|-)\s+/i,'').trim();if(!text)return {error:'text'};return {at,text};}
}
export function formatWhen(at,now=Date.now(),tz='Asia/Kolkata'){const d=dayjs(at).tz(tz),n=dayjs(now).tz(tz);const diff=at-now;const rel=diff<36e5?Math.max(1,Math.round(diff/6e4))+' min':diff<864e5?(diff/36e5).toFixed(diff%36e5<6e4?0:1)+' h':Math.round(diff/864e5)+' day(s)';const same=d.format('YYYY-MM-DD')===n.format('YYYY-MM-DD');return (same?'today ':d.format('ddd D MMM ')) + d.format('h:mm A')+' ('+rel+')';}
