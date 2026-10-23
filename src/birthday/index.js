import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PER_CHAT = 25;
export const MAX_TOTAL = 400;
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "14-03", "14/3", "14 mar", "march 14" -> {day, month} or null. */
export function parseDate(text) {
  const t = String(text || '').trim().toLowerCase();
  const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let m = /^(\d{1,2})\s*[-/. ]\s*(\d{1,2})(?:[-/. ]\d{2,4})?$/.exec(t); let day; let month;
  if (m) { day = Number(m[1]); month = Number(m[2]); }
  else if ((m = /^(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})$/.exec(t))) { day = Number(m[1]); month = names.indexOf(m[2].slice(0, 3)) + 1; }
  else if ((m = /^([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(t))) { day = Number(m[2]); month = names.indexOf(m[1].slice(0, 3)) + 1; }
  else return null;
  if (month < 1 || month > 12 || day < 1 || day > DAYS[month - 1]) return null;
  return {day, month};
}

const istParts = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', hour12: false}).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {day: Number(p.day), month: Number(p.month), year: Number(p.year), hour: Number(p.hour) % 24};
};

export const WISHES = [
  'Happy Birthday, {n}! 🎂🎉 Wishing you a day full of smiles and a year full of good things.',
  'Many happy returns of the day, {n}! 🥳 May this year bring you everything you hope for.',
  'Happy Birthday {n}! 🎈 Stay awesome, stay happy, and eat extra cake today. 🍰',
  'Wishing {n} a very Happy Birthday! 🎁 Have a fantastic day and an even better year.',
];

export class Birthdays {
  constructor(file, send, now = () => Date.now()) {
    this.file = file; this.send = send; this.now = now; this.items = [];
    try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(d)) this.items = d; } catch { /* first run */ }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), {recursive: true}); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items)); fs.renameSync(this.file + '.tmp', this.file); } catch { /* disk issue: keep memory state */ } }
  inChat(chat) { return this.items.filter((b) => b.chat === chat); }
  add({chat, name, day, month, who = null, by = null}) {
    const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!n) throw new Error('birthday_name');
    if (!Number.isInteger(day) || !Number.isInteger(month)) throw new Error('birthday_date');
    if (this.inChat(chat).length >= PER_CHAT) throw new Error('birthday_chat_full');
    if (this.items.length >= MAX_TOTAL) throw new Error('birthday_capacity');
    this.items = this.items.filter((b) => !(b.chat === chat && b.name.toLowerCase() === n.toLowerCase()));
    const item = {id: crypto.randomBytes(3).toString('hex'), chat, name: n, day, month, who, by, last: 0};
    this.items.push(item); this.save(); return item;
  }
  remove(chat, key) {
    const k = String(key || '').toLowerCase();
    const hit = this.inChat(chat).find((b) => b.id === k || b.name.toLowerCase() === k);
    if (!hit) return null;
    this.items = this.items.filter((b) => b !== hit); this.save(); return hit;
  }
  /** Sends every wish due today (IST, from 9 AM) once per year. */
  async tick() {
    const t = istParts(this.now()); if (t.hour < 9) return 0; let sent = 0;
    for (const b of this.items) {
      if (b.last === t.year) continue;
      const due = (b.day === t.day && b.month === t.month) || (b.day === 29 && b.month === 2 && t.day === 28 && t.month === 2 && !this.leap(t.year));
      if (!due) continue;
      const group = b.chat.endsWith('@g.us');
      const text = group ? WISHES[Math.floor(Math.random() * WISHES.length)].replace('{n}', b.who ? '@' + b.who : b.name) : `🎂 Reminder: today is ${b.name}'s birthday. Send them a wish!`;
      let ok = false; try { ok = await this.send(b.chat, text, b.who ? [b.who + '@s.whatsapp.net'] : []); } catch { ok = false; }
      if (ok) { b.last = t.year; sent++; }
    }
    if (sent) this.save();
    return sent;
  }
  leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
}
