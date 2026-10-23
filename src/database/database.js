import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/** Tiny JSON store with atomic writes and debounced saving. */
class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = structuredClone(defaults);
    this.timer = null;
    this.writing = Promise.resolve();
    this.lastWriteError=null;
    this.available=true;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed=JSON.parse(raw);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!parsed.settings||typeof parsed.settings!=='object'||Array.isArray(parsed.settings)||['stats','commandUsage'].some(k=>parsed[k]!==undefined&&(!parsed[k]||typeof parsed[k]!=='object'||Array.isArray(parsed[k])))||(parsed.recent!==undefined&&!Array.isArray(parsed.recent)))throw new Error('Invalid settings store');
      this.data = { ...structuredClone(this.defaults), ...parsed };
    } catch (err) {
      if(err.code!=='ENOENT'){this.available=false;this.lastWriteError=err;logger.warn('Database unreadable; persistence disabled, existing file preserved');}
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    if(!this.available)return this.writing;
    const json = JSON.stringify(this.data);
    this.writing = this.writing
      .then(async () => {
        this.lastWriteError=null;
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        await fs.writeFile(tmp, json);
        await fs.rename(tmp, this.file);
      })
      .catch((err) => {this.lastWriteError=err;logger.warn('Database save failed; settings persistence unavailable');});
    return this.writing;
  }
}

const db = new JsonStore(path.join(config.paths.data, 'db.json'), {
  stats: { commands: 0, downloads: 0, failures: 0, statusViewed: 0, startedAt: null },
  commandUsage: {},
  recent: [],
  settings: {},
});

export async function initDatabase() {
  await db.load();
  db.data.stats.startedAt = new Date().toISOString();
  db.save();
}

export const getStats = () => db.data.stats;
export const getUsage = () => db.data.commandUsage;
export const getRecent = () => db.data.recent || [];

export function bump(stat) {
  db.data.stats[stat] = (db.data.stats[stat] || 0) + 1;
  db.save();
}

export function recordCommand(name, who = '') {
  db.data.stats.commands++;
  db.data.commandUsage[name] = (db.data.commandUsage[name] || 0) + 1;
  // Only the command name, time and a display name (never a phone number) are kept: no arguments.
  db.data.recent = [{ name, at: Date.now(), ...(who ? { who: String(who).slice(0, 24) } : {}) }, ...(db.data.recent || [])].slice(0, 10);
  db.save();
}

export const getSetting = (key, fallback) => db.data.settings[key] ?? fallback;
export function setSetting(key, value) {
  db.data.settings[key] = value;
  db.save();
}

export async function flushDatabase(strict=false){await db.flush();if(strict&&db.lastWriteError)throw new Error('Settings store unavailable; changes were not saved');}
