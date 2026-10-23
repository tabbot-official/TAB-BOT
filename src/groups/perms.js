// Permission hierarchy: bot owner (4) > bot admin (3) > WhatsApp group admin (2) > member (1).
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { store } from './store.js';
import { MetadataCache } from './metadataCache.js';

export const LEVEL = { member: 1, groupAdmin: 2, botAdmin: 3, owner: 4 };
export const LEVEL_NAME = { 1: 'member', 2: 'group admin', 3: 'bot admin', 4: 'bot owner' };

export const num = (j = '') => String(j).split('@')[0].split(':')[0];
const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(num);

const metaCache = new MetadataCache();

export async function getMeta(sock, gid, fresh = false) {
  try { return await metaCache.get(sock, gid, fresh); }
  catch (err) {
    logger.warn(`[groups] metadata failed: ${String(err.message).slice(0, 80)}`);
    return null; // Never revive stale admin rights after a failed refresh.
  }
}
export const dropMeta = (gid) => metaCache.drop(gid);

/** Finds the participant that matches any of the given ids (jid, lid or phone number). */
export function findMember(meta, ...ids) {
  const wanted = ids.flat().filter(Boolean).map(num);
  if (!meta || !wanted.length) return null;
  return meta.participants.find((p) => idsOf(p).some((i) => wanted.includes(i))) || null;
}
export const isAdminP = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';

export function botMember(sock, meta) {
  const u = sock.user || {};
  return findMember(meta, u.id, u.lid, u.phoneNumber);
}

/** Level of the person who sent `msg` in this group. */
export function levelOf(sock, meta, msg, isOwner) {
  if (isOwner) return LEVEL.owner;
  const k = msg.key || {};
  const ids = [k.participant, k.participantAlt, msg.participant];
  const member = findMember(meta, ids);
  const nums = [...ids, member?.id, member?.lid, member?.phoneNumber].filter(Boolean).map(num);
  const owners = [config.ownerNumber, num(sock.user?.id || '')].filter(Boolean);
  if (nums.some((n) => owners.includes(n))) return LEVEL.owner;
  const admins = store()?.botAdmins() || [];
  if (nums.some((n) => admins.includes(n))) return LEVEL.botAdmin;
  if (isAdminP(member)) return LEVEL.groupAdmin;
  return LEVEL.member;
}

/** Level of an arbitrary participant (used to stop admins removing higher ranks). */
export function levelOfMember(sock, p) {
  if (!p) return LEVEL.member;
  const nums = idsOf(p);
  const owners = [config.ownerNumber, num(sock.user?.id || '')].filter(Boolean);
  if (nums.some((n) => owners.includes(n))) return LEVEL.owner;
  if (nums.some((n) => (store()?.botAdmins() || []).includes(n))) return LEVEL.botAdmin;
  return isAdminP(p) ? LEVEL.groupAdmin : LEVEL.member;
}
