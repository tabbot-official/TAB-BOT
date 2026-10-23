import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {getSetting,setSetting,flushDatabase} from '../database/database.js';
const here=path.dirname(fileURLToPath(import.meta.url));const dir=path.join(here,'../locales');export const registry=JSON.parse(fs.readFileSync(path.join(here,'registry.json'),'utf8')).languages;const aliases=new Map(Object.entries(registry).filter(([,x])=>x.alias).map(([c,x])=>[x.alias,c]));const cache=new Map();
export function code(input){const c=String(input||'').toLowerCase();const n=aliases.get(c)||c;if(!Object.hasOwn(registry,n))throw new Error('Unknown language code');return n;}
export function locale(c){c=code(c);if(cache.has(c))return cache.get(c);let l={};try{l=JSON.parse(fs.readFileSync(path.join(dir,c+'.json'),'utf8'));}catch{}cache.set(c,l);return l;}
export const available=()=>fs.readdirSync(dir).filter(x=>/^[a-z]{3}\.json$/.test(x)).map(x=>x.slice(0,-5)).filter(c=>registry[c]);
const userKey=ctx=>String(ctx.senderJid||ctx.sender).replace(/:\d+@/,'@');
export function preference(ctx){const chosen=(ctx.isGroup?getSetting('lang:group:'+ctx.jid,null):null)||getSetting('lang:user:'+userKey(ctx),'eng');return Object.hasOwn(registry,chosen)?chosen:'eng';}
export async function setLanguage(ctx,c,group=false){const key=group?'lang:group:'+ctx.jid:'lang:user:'+userKey(ctx);const before=getSetting(key,null);setSetting(key,c?code(c):null);try{await flushDatabase(true);}catch(e){setSetting(key,before);throw e;}}
export function translate(c,key,values={}){const target=locale(c),english=locale('eng');let s=Object.hasOwn(target,key)?target[key]:Object.hasOwn(english,key)?english[key]:key;return String(s).replace(/\{([A-Za-z_]+)\}/g,(m,k)=>Object.hasOwn(values,k)?String(values[k]):m);}
let coverageCache;export function coverage(){if(coverageCache)return coverageCache;const english=locale('eng');return coverageCache=available().map(c=>({code:c,authored:Object.keys(locale(c)).length,fallback:Object.keys(english).filter(k=>!(k in locale(c))).length}));}
export const t=(ctx,key,values)=>translate(preference(ctx),key,values);
