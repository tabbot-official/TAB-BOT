// Virtual pets: one per user. Hunger/happiness drift down over time; feed/play restore.
import path from 'node:path';
import config from '../config/config.js';
import { TinyJson } from '../subs/tinyjson.js';

export const KINDS = {
  cat: { emoji: '🐱', food: 'fish' }, dog: { emoji: '🐶', food: 'bone' },
  fox: { emoji: '🦊', food: 'berries' }, panda: { emoji: '🐼', food: 'bamboo' },
  penguin: { emoji: '🐧', food: 'fish' }, rabbit: { emoji: '🐰', food: 'carrots' },
};
let store = null;
const st = () => { if (!store) store = new TinyJson(path.join(config.paths.data, 'pets.json'), {}); return store; };
const save = () => st().save();

function refresh(p) {
  const mins = (Date.now() - (p.t || Date.now())) / 60000;
  p.hunger = Math.max(0, Math.round(p.hunger - mins * 1.2));   // empties in ~7h
  p.happy = Math.max(0, Math.round(p.happy - mins * 0.8));
  p.t = Date.now();
  return p;
}
export const getPet = (u) => { const p = st().data[u]; return p ? refresh(p) : null; };
export function adopt(u, kind, name) {
  st().data[u] = { kind, name, hunger: 80, happy: 80, xp: 0, t: Date.now() };
  save();
}
export const free = (u) => { delete st().data[u]; save(); };
export function feed(u) { const p = getPet(u); if (!p) return null; p.hunger = Math.min(100, p.hunger + 30); p.xp += 5; save(); return p; }
export function play(u) { const p = getPet(u); if (!p) return null; p.happy = Math.min(100, p.happy + 30); p.xp += 5; save(); return p; }
export const level = (p) => 1 + Math.floor((p.xp || 0) / 50);
