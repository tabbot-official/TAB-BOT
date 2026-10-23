import {rt,RuntimeInputError} from '../i18n/runtime.js';
import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';
export const pick=items=>{if(!items.length)throw new RuntimeInputError('game_no_options');return items[crypto.randomInt(items.length)];};
export function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function options(text){const a=text.split('|').map(x=>x.trim());if(a.length<2||a.length>10||a.some(x=>!x||x.length>120))throw new RuntimeInputError('choose_limits');if(new Set(a.map(x=>x.toLowerCase())).size!==a.length)throw new RuntimeInputError('choose_duplicates');return a;}
export function outcome(b){for(const [a,c,d]of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];return b.every(Boolean)?'draw':null;}
function solve(b,who){const end=outcome(b);if(end)return {score:end==='O'?10:end==='X'?-10:0};let best={score:who==='O'?-Infinity:Infinity,pos:null};for(let i=0;i<9;i++)if(!b[i]){b[i]=who;const {score}=solve(b,who==='O'?'X':'O');b[i]=null;if(who==='O'?score>best.score:score<best.score)best={score,pos:i};}return best;}
export function botMove(b){return solve([...b],'O').pos;}
export function board(b){return [0,3,6].map(i=>b.slice(i,i+3).map((v,j)=>v||String(i+j+1)).join(' | ')).join('\n---------\n');}
export function canMake(word,letters){const counts={};for(const c of letters)counts[c]=(counts[c]||0)+1;for(const c of word){if(!counts[c])return false;counts[c]--;}return true;}
export class Games {
 constructor(file,now=()=>Date.now()){this.file=file;this.now=now;this.sessions=new Map();this.scores={};try{this.scores=JSON.parse(fs.readFileSync(file,'utf8'));}catch{} }
 key(chat,user){return `${chat}|${user}`;}
 get(chat,user,type){const k=this.key(chat,user),s=this.sessions.get(k);if(!s)return null;if(this.now()>s.expires){this.sessions.delete(k);throw new RuntimeInputError('game_expired');}if(s.type!==type)throw new RuntimeInputError('game_other_pending',{game:s.type});return s;}
 start(chat,user,type,data,minutes=3){this.prune();if(this.sessions.size>=200&&!this.sessions.has(this.key(chat,user)))throw new RuntimeInputError('game_capacity');const s={...data,type,expires:this.now()+minutes*60000};this.sessions.set(this.key(chat,user),s);return s;}
 end(chat,user){this.sessions.delete(this.key(chat,user));}
 prune(){for(const [k,s]of this.sessions)if(s.expires<this.now())this.sessions.delete(k);}
 award(chat,user,points){const c=this.scores[chat]??={};const tag=crypto.createHash('sha256').update(chat+'|'+user).digest('hex').slice(0,12);c[tag]=(c[tag]||0)+points;const top=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,100);this.scores[chat]=Object.fromEntries(top);const chats=Object.keys(this.scores);if(chats.length>100)delete this.scores[chats[0]];fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.scores));fs.renameSync(this.file+'.tmp',this.file);return c[tag];}
 leaderboard(chat,ctx={}){return Object.entries(this.scores[chat]||{}).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,n],i)=>rt(ctx,'game_leaderboard_row',{rank:i+1,player:id.slice(0,6),score:n})).join('\n')||rt(ctx,'game_no_scores');}
}
