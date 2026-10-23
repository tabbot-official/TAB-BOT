import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('spell',(level,opts={})=>{const [q,a]=pick(spelling);return question(`Correct this spelling: ${q}`,a);});
