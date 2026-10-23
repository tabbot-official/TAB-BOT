// Mini text RPG state: hp, gold, xp, level, weapon. Per user, works anywhere.
import path from 'node:path';
import config from '../config/config.js';
import { TinyJson } from '../subs/tinyjson.js';

let store = null;
const st = () => { if (!store) store = new TinyJson(path.join(config.paths.data, 'rpg.json'), {}); return store; };
const save = () => st().save();
export const WEAPONS = [
  { name: 'Stick', cost: 0, dmg: [3, 7] },
  { name: 'Dagger', cost: 60, dmg: [5, 11] },
  { name: 'Sword', cost: 180, dmg: [8, 16] },
  { name: 'Battle Axe', cost: 450, dmg: [12, 24] },
  { name: 'Dragon Blade', cost: 1200, dmg: [18, 36] },
];
export function hero(u) {
  const h = (st().data[u] ||= { hp: 50, maxHp: 50, gold: 20, xp: 0, level: 1, weapon: 0, potions: 1, lastHunt: 0, wins: 0 });
  return h;
}
export const saveHero = () => save();
export const xpNeed = (h) => h.level * 60;
export function gainXp(h, xp) {
  h.xp += xp;
  let ups = 0;
  while (h.xp >= xpNeed(h)) { h.xp -= xpNeed(h); h.level++; h.maxHp += 10; h.hp = h.maxHp; ups++; }
  return ups;
}
export function topHeroes(n = 10) {
  return Object.entries(st().data).sort((a, b) => (b[1].level * 10000 + b[1].xp) - (a[1].level * 10000 + a[1].xp)).slice(0, n);
}
