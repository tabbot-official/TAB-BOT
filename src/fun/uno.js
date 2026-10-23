// UNO game state, in memory per group. Games end on restart - by design.
const games = new Map();
const COLORS = ['r', 'g', 'b', 'y'];
const CN = { r: '🔴', g: '🟢', b: '🔵', y: '🟡' };

function deck() {
  const d = [];
  for (const c of COLORS) {
    d.push(c + '0');
    for (let i = 1; i <= 9; i++) { d.push(c + i); d.push(c + i); }
    for (const s of ['s', 'x', '+2']) { d.push(c + s); d.push(c + s); } // s=skip x=reverse
  }
  for (let i = 0; i < 4; i++) { d.push('w'); d.push('w+4'); }
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
export const getGame = (gid) => games.get(gid) || null;
export function createGame(gid, starter) {
  games.set(gid, { players: [starter], state: 'lobby', hands: {}, draw: [], discard: [], turn: 0, dir: 1, color: null, pendingDraw: 0 });
  return games.get(gid);
}
export const endGame = (gid) => games.delete(gid);
export const cardText = (c) => (c[0] === 'w' ? (c === 'w' ? '🃏 Wild' : '🃏 Wild +4') : CN[c[0]] + ' ' + c.slice(1).replace('s', 'Skip').replace('x', 'Reverse'));
export const colorEmoji = (c) => CN[c] || '🃏';
export function startGame(g) {
  g.draw = deck();
  for (const p of g.players) g.hands[p] = g.draw.splice(0, 7);
  let top = g.draw.pop();
  while (top[0] === 'w') { g.draw.unshift(top); top = g.draw.pop(); }
  g.discard.push(top);
  g.color = top[0];
  g.state = 'play';
  return top;
}
const matches = (card, top, color) => card[0] === 'w' || card[0] === color || card.slice(1) === top.slice(1);
export function playable(hand, top, color) { return hand.filter((c) => matches(c, top, color)); }
export function playCard(g, player, card, chosenColor) {
  const hand = g.hands[player];
  const idx = hand.indexOf(card);
  if (idx < 0) return { err: 'You do not have that card.' };
  const top = g.discard[g.discard.length - 1];
  if (!matches(card, top, g.color)) return { err: 'That card does not match. Match the color or the value.' };
  if (card === 'w+4' || card === 'w') {
    if (!COLORS.includes(chosenColor)) return { err: 'Pick a color: ' + card + ' red|green|blue|yellow' };
    g.color = chosenColor;
  } else g.color = card[0];
  hand.splice(idx, 1);
  g.discard.push(card);
  const v = card.slice(1);
  let skipNext = false;
  if (v === 's') skipNext = true;
  if (v === 'x') { g.dir *= -1; if (g.players.length === 2) skipNext = true; }
  if (v === '+2') g.pendingDraw = 2;
  if (card === 'w+4') g.pendingDraw = 4;
  return { skipNext };
}
export function advance(g, extra = 1) {
  const n = g.players.length;
  g.turn = ((g.turn + g.dir * extra) % n + n) % n;
  return g.players[g.turn];
}
export function drawCards(g, player, n) {
  if (g.draw.length < n) { const top = g.discard.pop(); g.draw = g.discard.sort(() => Math.random() - 0.5); g.discard = [top]; }
  const got = g.draw.splice(0, n);
  g.hands[player].push(...got);
  return got;
}
export const handText = (hand) => hand.map((c, i) => `${i + 1}. ${cardText(c)}`).join('\n');
