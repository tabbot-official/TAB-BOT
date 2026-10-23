import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('synonym',(level,opts={})=>{const [q,a]=pick(synonyms);return question(`Give a synonym of: ${q}`,a);});
