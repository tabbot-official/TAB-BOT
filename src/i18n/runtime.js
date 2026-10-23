import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{preference,code as languageCode}from'./index.js';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime-locales'),cache=new Map();
export function runtimeLocale(code){code=languageCode(code);if(cache.has(code))return cache.get(code);let result={};try{result=JSON.parse(fs.readFileSync(path.join(dir,code+'.json'),'utf8'));}catch{}cache.set(code,result);return result;}
export function rt(ctx,key,values={}){const target=runtimeLocale(preference(ctx)),eng=runtimeLocale('eng');const text=Object.hasOwn(target,key)?target[key]:Object.hasOwn(eng,key)?eng[key]:key;return String(text).replace(/\{([A-Za-z_]+)\}/g,(match,k)=>Object.hasOwn(values,k)?String(values[k]):match);}
/** Only locally constructed errors may select translated runtime input text. Provider errors cannot. */
export class RuntimeInputError extends Error{constructor(key,values={}){super(rt({},key,values));this.code='INPUT';this.key=key;this.values=values;}}
