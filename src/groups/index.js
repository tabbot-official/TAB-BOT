import {t} from '../i18n/index.js';
// Group management module entry. Hooked in from the message handler; never touches the connection code.
import logger from '../utils/logger.js';
import { initStore, settings, store, DEFAULTS } from './store.js';
import { startScheduler } from './scheduler.js';
import { out } from './limiter.js';
import { getMeta, dropMeta, num } from './perms.js';
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { introText, botWasAdded } from './onboard.js';

process.on('exit', (c) => console.log('[groups] process exit, code', c));
let current = null;
const attached = new WeakSet();
let ready = null;

const pid = (p) => (typeof p === 'string' ? p : p?.id || p?.jid || '');
const fill = (tpl, vars) => String(tpl).replace(/\{(user|name|group|count|rules|date|desc|admins)\}/g, (_, k) => vars[k === 'name' ? 'user' : k] ?? '');

async function onParticipants(sock, ev) {
  try {
    const gid = ev.id;
    dropMeta(gid);
    const action = ev.action;
    // ANTIPROMOTE: hand a promotion straight back unless the new admin is the owner.
    if (action === 'promote' && featOn('antipromote') && settings(gid).antipromote) {
      const owner = String(config.ownerNumber || '').replace(/\D/g, '');
      const meta = await getMeta(sock, gid, true).catch(() => null);
      const meAdmin = meta?.participants?.some((p) => p.id === sock.user?.id && p.admin);
      if (meAdmin) {
        for (const raw of ev.participants || []) {
          const p = pid(raw);
          if (!p || num(p) === owner) continue;
          await out.schedule(() => sock.groupParticipantsUpdate(gid, [p], 'demote')).catch(() => {});
          await out.schedule(() => sock.sendMessage(gid, { text: '🛡️ Anti-promote is on here - @' + num(p) + ' was demoted back.', mentions: [p] })).catch(() => {});
        }
      }
      return;
    }
    if (!['add', 'remove'].includes(action)) return;
    const s = settings(gid);
    if (action === 'add' && !s.onboarded) {
      const meNums = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
      if (botWasAdded((ev.participants || []).map(pid).filter(Boolean), meNums, num)) {
        try { store()?.setSetting(gid, 'onboarded', true); await out.schedule(() => sock.sendMessage(gid, { text: introText(config.prefix, config.botName) })); } catch { /* best effort */ }
        return;
      }
    }
    if (action === 'add' ? !s.welcome : !s.goodbye) return;
    const ids = (ev.participants || []).map(pid).filter(Boolean);
    if (!ids.length) return;
    // Never greet the bot itself.
    const me = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
    const people = ids.filter((i) => !me.includes(num(i))).slice(0, 5);
    if (!people.length) return;
    const meta = await getMeta(sock, gid, true);
    const defaultKey=action==='add'?'welcomeMsg':'goodbyeMsg';
    const configured=s[defaultKey];
    const tpl=configured===DEFAULTS[defaultKey]?t({jid:gid,isGroup:true,sender:'group-event'},action==='add'?'welcome_default':'goodbye_default'):configured;
    const adminIds = /\{admins\}/.test(tpl) ? (meta?.participants || []).filter((p) => p.admin).map((p) => p.id).slice(0, 5) : [];
    const adminTags = adminIds.map((i) => `@${num(i)}`).join(' ');
    const text = fill(tpl, { user: people.map((i) => `@${num(i)}`).join(' '), group: meta?.subject || 'the group', count: meta?.participants?.length ?? '', rules: s.rules || '', desc: String(meta?.desc || '').slice(0, 300), admins: adminTags, date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) });
    if (action === 'add' && s.welcomeImage) {
      try {
        const url = await sock.profilePictureUrl(people[0], 'image');
        if (url) return await out.schedule(() => sock.sendMessage(gid, { image: { url }, caption: text, mentions: [...people, ...adminIds] }));
      } catch { /* no profile picture: send text */ }
    }
    await out.schedule(() => sock.sendMessage(gid, { text, mentions: [...people, ...adminIds] }));
  } catch (err) {
    logger.warn(`[groups] welcome/goodbye failed: ${String(err.message).slice(0, 100)}`);
  }
}

/** Called once per socket from the message handler. Safe to call repeatedly. */
export function attachGroups(sock) {
  current = sock;
  if (attached.has(sock)) return;
  attached.add(sock);
  ready ||= initStore().then(() => startScheduler(() => current)).catch((err) => logger.error('[groups] init failed:', err));
  sock.ev.on('group-participants.update', (ev) => { onParticipants(sock, ev).catch(() => {}); });
  sock.ev.on('groups.update', (list) => { for (const g of list || []) if (g?.id) dropMeta(g.id); });
}

export const groupsReady = () => ready || Promise.resolve();
export { store };
