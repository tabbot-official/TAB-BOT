import { brainCommand } from './_games.js';
export default {
  ...brainCommand('wordsearch'),
  description: 'Find a word in a letter grid using start and end positions',
  usage: 'wordsearch [easy|medium|hard|answer ROW COL ROW COL|cancel]',
};
