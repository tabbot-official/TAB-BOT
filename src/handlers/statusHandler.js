import config from '../config/config.js';
import logger from '../utils/logger.js';
import { bump } from '../database/database.js';
import { featOn } from '../config/features.js';
import { isOn } from '../utilities/toggles.js';

const seen = new Set();
const reactLog = new Map();
const REACTS = ['❤️', '🔥', '👏', '😍', '💯', '😮'];
const MAX_SEEN = 2000;

/** Marks a newly posted WhatsApp status as viewed (only when AUTO_STATUS_VIEW=true). */
export async function handleStatus(sock, msg) {
  if (!config.autoStatusView) return;
  try {
    const key = msg.key;
    if (!key?.id || key.fromMe) return;
    const id = `${key.participant || key.participantAlt || ''}:${key.id}`;
    if (seen.has(id)) return; // duplicate event
    seen.add(id);
    if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
    await sock.readMessages([key]);
    bump('statusViewed');
    logger.info('Status viewed');
    // STATUSREACT: small auto-reaction (implies viewing; capped per poster).
    if (featOn('statusreact') && isOn('statusreact')) {
      const poster = key.participant || key.participantAlt || '';
      const now = Date.now();
      const rec = reactLog.get(poster) || [];
      const fresh = rec.filter((t) => now - t < 3600e3);
      if (poster && fresh.length < 3) {
        fresh.push(now); reactLog.set(poster, fresh);
        if (reactLog.size > 3000) reactLog.clear();
        const emoji = REACTS[Math.floor(Math.random() * REACTS.length)];
        await sock.sendMessage('status@broadcast', { react: { text: emoji, key } }).catch(() => {});
      }
    }
  } catch (err) {
    logger.warn('Status view failed:', err);
  }
}
