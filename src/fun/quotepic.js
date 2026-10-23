export const QUOTES = [
 ['The only way to do great work is to love what you do.', 'Steve Jobs'], ['It always seems impossible until it is done.', 'Nelson Mandela'],
 ['Dream is not that which you see while sleeping, it is that which does not let you sleep.', 'A. P. J. Abdul Kalam'],
 ['You miss 100% of the shots you do not take.', 'Wayne Gretzky'], ['Do not watch the clock. Do what it does. Keep going.', 'Sam Levenson'],
 ['Success is the sum of small efforts repeated day in and day out.', 'Robert Collier'], ['Believe you can and you are halfway there.', 'Theodore Roosevelt'],
 ['Arise, awake, and stop not till the goal is reached.', 'Swami Vivekananda'], ['Fall seven times, stand up eight.', 'Japanese proverb'],
 ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb'], ['Your time is limited, so do not waste it living someone else\'s life.', 'Steve Jobs'],
 ['Hard work beats talent when talent does not work hard.', 'Tim Notke'], ['Small steps every day lead to big results.', 'Unknown'],
 ['Be the change that you wish to see in the world.', 'Mahatma Gandhi'], ['What you get by achieving your goals is not as important as what you become.', 'Zig Ziglar'],
 ['Do not be afraid to give up the good to go for the great.', 'John D. Rockefeller'], ['Failure is not the opposite of success. It is part of success.', 'Arianna Huffington'],
 ['A smooth sea never made a skilled sailor.', 'Franklin D. Roosevelt'], ['The future depends on what you do today.', 'Mahatma Gandhi'],
 ['Stay hungry. Stay foolish.', 'Steve Jobs'], ['Courage is not the absence of fear, but the triumph over it.', 'Nelson Mandela'],
 ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'], ['Everything you can imagine is real.', 'Pablo Picasso'],
 ['Kindness is a language which the deaf can hear and the blind can see.', 'Mark Twain'], ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
 ['If you want to shine like the sun, first burn like the sun.', 'A. P. J. Abdul Kalam'], ['You are never too old to set another goal or to dream a new dream.', 'C. S. Lewis'],
 ['Quality is not an act, it is a habit.', 'Aristotle'], ['Happiness depends upon ourselves.', 'Aristotle'], ['The harder you work for something, the greater you will feel when you achieve it.', 'Unknown'],
];
const PALETTES = [['#0f2027', '#2c5364'], ['#42275a', '#734b6d'], ['#134e5e', '#71b280'], ['#232526', '#414345'], ['#1e3c72', '#2a5298'], ['#8e2de2', '#4a00e0'], ['#cb2d3e', '#ef473a'], ['#0b486b', '#f56217'], ['#16222a', '#3a6073'], ['#355c7d', '#c06c84']];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function wrapQuote(text, max) {
  const lines = []; let line = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const word = w.length > max ? w.slice(0, max) : w;
    if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}
export function randomQuote(rand = Math.random) { return QUOTES[Math.floor(rand() * QUOTES.length)]; }
export function quoteSvg(text, author, rand = Math.random) {
  const S = 1080, t = String(text).slice(0, 220);
  const size = t.length > 150 ? 46 : t.length > 90 ? 54 : 64, max = Math.floor(900 / (size * 0.52));
  const lines = wrapQuote(t, max).slice(0, 9), lh = size * 1.35, h = lines.length * lh;
  const y0 = (S - h) / 2 + size * 0.4;
  const [c1, c2] = PALETTES[Math.floor(rand() * PALETTES.length)];
  const body = lines.map((l, i) => `<text x="${S / 2}" y="${y0 + i * lh}" font-size="${size}" fill="#ffffff" text-anchor="middle" font-style="italic">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" font-family="Georgia, DejaVu Serif, serif">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="${S / 2}" y="${y0 - size * 1.6}" font-size="200" fill="#ffffff" fill-opacity="0.25" text-anchor="middle">“</text>
${body}
<line x1="${S / 2 - 60}" x2="${S / 2 + 60}" y1="${y0 + h + 20}" y2="${y0 + h + 20}" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>
<text x="${S / 2}" y="${y0 + h + 80}" font-size="36" fill="#ffffff" fill-opacity="0.9" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(author)}</text>
</svg>`;
}
