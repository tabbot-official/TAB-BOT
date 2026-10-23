import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('flagquiz',(level,opts={})=>{const [q,a]=pick(flags);return question(`Which country? ${q}`,a);});
