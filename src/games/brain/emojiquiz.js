import {simple,pick,rand,question,scrambled} from './util.js';
import {trivia,words,riddles,capitals,flags,emojis,synonyms,antonyms,spelling} from './bank.js';
export default simple('emojiquiz',(level,opts={})=>{const [q,a]=pick(emojis);return question(`Guess the word: ${q}`,a);});
