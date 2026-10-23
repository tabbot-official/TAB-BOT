import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('riddle',(level,opts={})=>{const [q,a]=pick(riddles);return question(q,a);});
