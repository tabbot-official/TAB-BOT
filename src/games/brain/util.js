import crypto from 'node:crypto';
export const rand=(min,max)=>crypto.randomInt(min,max+1);
export const pick=a=>a[rand(0,a.length-1)];
export const normalize=x=>String(x).normalize('NFKC').toLowerCase().trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
export const accepts=(value,answer)=>(Array.isArray(answer)?answer:[answer]).some(x=>normalize(value)===normalize(x));
export function scrambled(word){for(let n=0;n<20;n++){const a=[...word];for(let i=a.length-1;i>0;i--){const j=rand(0,i);[a[i],a[j]]=[a[j],a[i]];}if(a.join('')!==word)return a.join('');}return word.slice(1)+word[0];}
export const question=(prompt,answer)=>({prompt,answer,attempts:0,maxAttempts:1});
export function simple(name,make){return {name,create:make,render:s=>s.prompt,move(s,input){if(!String(input).trim()||String(input).length>100)throw new Error('Send a short answer.');return{done:true,won:accepts(input,s.answer),answer:Array.isArray(s.answer)?s.answer[0]:s.answer};}};}
