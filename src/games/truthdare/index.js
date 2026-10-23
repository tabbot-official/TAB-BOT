import truths from './truths.js';
import dares from './dares.js';
export const CATEGORIES=['funny','sad','romantic','love','brother','sister','irl'];
const ALIAS={logic:'irl',real:'irl',bro:'brother',sis:'sister',lovely:'love',fun:'funny',emotional:'sad'};
const banks={truth:truths,dare:dares};
const seen=new Map();
export function parseCategory(arg){const a=String(arg||'').toLowerCase().replace(/[^a-z]/g,'');if(!a||a==='random'||a==='any')return{cat:null};const c=ALIAS[a]||a;return CATEGORIES.includes(c)?{cat:c}:{error:true};}
export function pool(kind,cat){const b=banks[kind];return (cat?[cat]:CATEGORIES).flatMap(c=>(b[c]||[]).map(t=>({c,t})));}
export function draw(kind,cat,chatId='_'){const all=pool(kind,cat);const key=kind+'|'+(cat||'*')+'|'+chatId;let s=seen.get(key);if(!s||s.size>=all.length){s=new Set();seen.set(key,s);if(seen.size>2000)seen.delete(seen.keys().next().value);}const left=all.filter(x=>!s.has(x.t));const p=left[Math.floor(Math.random()*left.length)];s.add(p.t);return p;}
export function counts(){return Object.fromEntries(Object.keys(banks).map(k=>[k,Object.values(banks[k]).reduce((n,a)=>n+a.length,0)]));}
export function format(kind,p){const icon=kind==='truth'?'🫢 *TRUTH*':'🔥 *DARE*';return `${icon} _(${p.c})_\n\n${p.t}`;}
export const HELP='Categories: '+CATEGORIES.join(', ');
