import crypto from 'node:crypto';
import {gameConfig} from './settings.js';
export class GameSessionManager{
 constructor({now=()=>Date.now(),config=gameConfig,onExpire=()=>{}}={}){this.now=now;this.config=config;this.onExpire=onExpire;this.sessions=new Map();this.players=new Map();this.lastInvite=new Map();this.lastMove=new Map();this.timer=setInterval(()=>this.prune(),5000);this.timer.unref();}
 key(chat,player){return JSON.stringify([chat,player]);}
 current(chat,player){this.prune();const id=this.players.get(this.key(chat,player));return id?this.sessions.get(id):null;}
 create({chat,players,game,kind='brain',state={},invited=[],difficulty='easy',ttl=this.config.questionMs}){this.prune();if(this.sessions.size>=this.config.maxSessions)throw new Error('Game slots full. Try later.');if(players.length<1||players.length>this.config.maxPlayers||new Set(players).size!==players.length)throw new Error('Invalid player list.');if(players.some(p=>[...this.sessions.values()].some(s=>s.players.includes(p))))throw new Error('A player already has an active game or invitation.');const id=crypto.randomBytes(5).toString('hex');const s={id,chat,players:[...players],game,kind,state,difficulty,deadline:this.now()+30*60000,accepted:players.filter(p=>!invited.includes(p)),invited:[...invited],status:invited.length?'invited':'active',created:this.now(),expires:this.now()+ttl};this.sessions.set(id,s);for(const p of players)this.players.set(this.key(chat,p),id);return s;}
 require(id,chat,player){this.prune();const s=this.sessions.get(id);if(!s||s.chat!==chat)throw new Error('Game not found or expired in this chat.');if(!s.players.includes(player))throw new Error('You are not a player in this game.');return s;}
 accept(id,chat,player){const s=this.require(id,chat,player);if(s.status!=='invited'||!s.invited.includes(player)||s.accepted.includes(player))throw new Error('No invitation for you.');s.accepted.push(player);if(s.accepted.length===s.players.length){s.status='active';s.expires=this.now()+this.config.turnMs;}return s;}
 decline(id,chat,player){const s=this.require(id,chat,player);if(s.status!=='invited'||!s.invited.includes(player))throw new Error('No invitation for you.');this.end(s.id);return s;}
 limit(chat,player,invite=false){const map=invite?this.lastInvite:this.lastMove,key=this.key(chat,player),at=this.now(),gap=invite?15000:this.config.cooldownMs;if(map.has(key)&&at-map.get(key)<gap)throw new Error('Slow down. Try again shortly.');map.set(key,at);if(map.size>5000)for(const [k,t]of map)if(at-t>60000)map.delete(k);}
 touch(s,ttl=this.config.turnMs){s.expires=Math.min(s.deadline,this.now()+ttl);}
 end(id){const s=this.sessions.get(id);if(!s)return;this.sessions.delete(id);for(const p of s.players)this.players.delete(this.key(s.chat,p));return s;}
 prune(){for(const s of this.sessions.values())if(s.expires<=this.now()){this.end(s.id);try{this.onExpire(s);}catch{}}}
 close(){clearInterval(this.timer);this.sessions.clear();this.players.clear();}
}
