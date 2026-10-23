// AUTOBIO: rotates the bot's WhatsApp bio. Off until the owner runs /autobio on.
// Kept to one update per 30 min - frequent profile writes look spammy to WhatsApp.
import { TinyJson } from '../subs/tinyjson.js';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { isOn } from './toggles.js';

const LINES = [
  () => `✦ ${config.botName} - always awake`,
  () => `✦ ${config.botName} - ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', weekday: 'short' })} IST`,
  () => `✦ ${config.botName} - uptime ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
  () => `✦ ${config.botName} - send /menu`,
  () => `✦ ${config.botName} - your pocket assistant`,
];
let i = 0, timer = null;

async function rotate(sock) {
  if (!isOn('autobio')) return;
  try {
    const text = LINES[i++ % LINES.length]();
    await sock.updateProfileStatus(text);
    logger.info('[autobio] bio rotated');
  } catch (e) { logger.warn('[autobio] failed: ' + (e?.message || 'error')); }
}
export function startAutobio(sock) {
  if (timer) return;
  timer = setInterval(() => rotate(sock), 30 * 60 * 1000);
  timer.unref?.();
}
