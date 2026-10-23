import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('sequence',(level,opts={})=>{const a=rand(1,20),d=rand(2,level==='hard'?20:8),mul=level==='hard'&&rand(0,1);const ns=Array.from({length:4},(_,i)=>mul?a*d**i:a+d*i);return question(`${ns.join(', ')}, ?`,String(mul?a*d**4:a+d*4));});
