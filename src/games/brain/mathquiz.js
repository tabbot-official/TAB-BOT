import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('mathquiz',(level,opts={})=>{const max={easy:20,medium:100,hard:500}[level],a=rand(1,max),b=rand(1,max),op=pick(level==='easy'?['+','-']:['+','-','×']);return question(`${a} ${op} ${b} = ?`,String(op==='+'?a+b:op==='-'?a-b:a*b));});
