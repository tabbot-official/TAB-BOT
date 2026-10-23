import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('antonym',(level,opts={})=>{const [q,a]=pick(antonyms);return question(`Give an antonym of: ${q}`,a);});
