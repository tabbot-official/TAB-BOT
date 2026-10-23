// Native word-search rules. No upstream source or datasets are copied.
import { randomInt } from 'node:crypto';
const WORDS = {
  easy: ['MOON', 'TREE', 'STAR', 'FISH', 'BIRD', 'BOOK', 'RAIN', 'LEAF'],
  medium: ['PLANET', 'FOREST', 'BRIDGE', 'GARDEN', 'ROCKET', 'STREAM', 'PUZZLE', 'ORANGE'],
  hard: ['TELESCOPE', 'ALGORITHM', 'BUTTERFLY', 'ADVENTURE', 'DISCOVERY', 'WATERFALL', 'BLUEPRINT', 'KNOWLEDGE'],
};
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
const SIZES = { easy: 6, medium: 8, hard: 10 };
const ATTEMPTS = { easy: 6, medium: 5, hard: 4 };

export function createWordsearch(level, { rng = randomInt } = {}) {
  if (!Object.hasOwn(SIZES, level)) throw new Error('Choose easy, medium or hard.');
  const size = SIZES[level];
  const word = WORDS[level][rng(WORDS[level].length)];
  const [dr, dc] = DIRECTIONS[rng(level === 'easy' ? 2 : level === 'medium' ? 4 : 8)];
  // Choose only valid starts. No unbounded retry loops for long words.
  const starts = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const er = r + dr * (word.length - 1), ec = c + dc * (word.length - 1);
    if (er >= 0 && er < size && ec >= 0 && ec < size) starts.push([r, c]);
  }
  const [row, col] = starts[rng(starts.length)];
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => String.fromCharCode(65 + rng(26))));
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
  return { word, grid, size, row: row + 1, col: col + 1, endRow: row + dr * (word.length - 1) + 1, endCol: col + dc * (word.length - 1) + 1, attempts: [], maxAttempts: ATTEMPTS[level] };
}

export default {
  name: 'wordsearch',
  timeMs: 180_000,
  create: createWordsearch,
  render(s) {
    const width = String(s.size).length;
    const header = ' '.repeat(width + 1) + Array.from({ length: s.size }, (_, i) => String(i + 1).padStart(width)).join(' ');
    const rows = s.grid.map((row, i) => String(i + 1).padStart(width) + ' ' + row.map(c => c.padStart(width)).join(' '));
    return `Find ${s.word}. Rows and columns start at 1.\n\n\`\`\`\n${[header, ...rows].join('\n')}\n\`\`\`\nSend the first and last letter positions: ROW COL ROW COL\nFormat only: /wordsearch answer ROW COL ROW COL\nAttempts: ${s.attempts.length}/${s.maxAttempts}; time limit: 3 minutes.`;
  },
  move(s, input) {
    const text = String(input || '').trim();
    if (!/^\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}$/.test(text)) throw new Error('Send four numbers: start row, start column, end row, end column.');
    const coords = text.split(/\s+/).map(Number);
    if (coords.some(n => n < 1 || n > s.size)) throw new Error(`Use row and column numbers from 1 to ${s.size}.`);
    const key = coords.join(' ');
    if (s.attempts.includes(key)) throw new Error('Already guessed these positions.');
    const [r, c, er, ec] = coords;
    const dr = er - r, dc = ec - c;
    if ((dr === 0 && dc === 0) || (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc))) throw new Error('Choose a straight horizontal, vertical or diagonal line.');
    if (Math.max(Math.abs(dr), Math.abs(dc)) + 1 !== s.word.length) throw new Error(`Choose a line with ${s.word.length} letters.`);
    // Accept any actual occurrence, not only the intended placement.
    const letters = Array.from({ length: s.word.length }, (_, i) => s.grid[r - 1 + Math.sign(dr) * i][c - 1 + Math.sign(dc) * i]).join('');
    s.attempts.push(key);
    const won = letters === s.word;
    return { done: won || s.attempts.length >= s.maxAttempts, won, answer: `${s.word}: row ${s.row}, column ${s.col} to row ${s.endRow}, column ${s.endCol}` };
  },
};
