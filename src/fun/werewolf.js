// Werewolf game state, in memory per group. Command-driven (no timers): the group
// advances phases with /ww day when night actions are in.
const games = new Map();
const byPlayer = new Map();
export const getGame = (gid) => games.get(gid) || null;
export function endGame(gid) {
  const g = games.get(gid);
  if (g) for (const p of g.players) byPlayer.delete(p);
  games.delete(gid);
}
export function gameOfPlayer(p) {
  const gid = byPlayer.get(p);
  const g = gid && games.get(gid);
  return g ? { game: g, gid } : null;
}
export function joinGame(gid, g, p) { g.players.push(p); byPlayer.set(p, gid); }
export function createGame(gid, starter) {
  games.set(gid, { players: [starter], roles: {}, alive: new Set(), state: 'lobby', votes: {}, nightKill: null, nightSee: null, nightProtect: null, lastProtect: null, round: 0 });
  byPlayer.set(starter, gid);
  return games.get(gid);
}
export function assignRoles(g) {
  const n = g.players.length;
  const shuffled = [...g.players].sort(() => Math.random() - 0.5);
  const wolves = Math.max(1, Math.floor(n / 4));
  g.roles = {};
  shuffled.forEach((p, i) => { g.roles[p] = i < wolves ? 'werewolf' : i === wolves ? 'seer' : (i === wolves + 1 && n >= 7) ? 'guardian' : (i === wolves + 2 && n >= 9) ? 'sorcerer' : 'villager'; });
  g.alive = new Set(g.players);
  g.state = 'night';
  g.round = 1;
  g.votes = {};
  g.nightKill = null;
  g.nightSee = null;
  g.nightProtect = null;
  g.lastProtect = null;
  return g;
}
// The sorcerer (9+ players) plays for the wolf side but cannot kill; it divines roles like the seer.
export const isWolfSide = (role) => role === 'werewolf' || role === 'sorcerer';
export const wolves = (g) => [...g.alive].filter((p) => isWolfSide(g.roles[p]));
export const villagers = (g) => [...g.alive].filter((p) => !isWolfSide(g.roles[p]));
export function winner(g) {
  if (wolves(g).length === 0) return 'village';
  if (wolves(g).length >= villagers(g).length) return 'werewolves';
  return null;
}
export function tally(g) {
  const counts = {};
  for (const v of Object.values(g.votes)) counts[v] = (counts[v] || 0) + 1;
  let best = null, max = 0, tie = false;
  for (const [p, c] of Object.entries(counts)) {
    if (c > max) { best = p; max = c; tie = false; }
    else if (c === max) tie = true;
  }
  return tie ? null : best;
}
