import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('trivia',(level,opts={})=>{const category=opts.category||'general';if(!trivia[category])throw new Error('Categories: '+Object.keys(trivia).join(', ')+'.');const [q,a]=pick(trivia[category]);return question(q,a);});
