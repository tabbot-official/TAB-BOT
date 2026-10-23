import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('capitalquiz',(level,opts={})=>{const [q,a]=pick(capitals);return question(`Capital of ${q}?`,a);});
