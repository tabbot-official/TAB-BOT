// CLAN: lightweight group clans - create, join, leave, list. Fun points grow with activity later.
import path from 'node:path';
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { TinyJson } from '../subs/tinyjson.js';

let store = null;
const st = () => { if (!store) store = new TinyJson(path.join(config.paths.data, 'clans.json'), {}); return store; };
const clans = (gid) => (st().data[gid] ||= {});
const save = () => st().save();
const LEVELS = [0, 100, 250, 500, 1000];
export const clanLevel = (pts = 0) => LEVELS.reduce((l, need, i) => (pts >= need ? i + 1 : l), 1);
// Daily reset at midnight India time (the bot owner's timezone), not UTC.
export const today = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
const num = (j) => (j || '').split('@')[0].split(':')[0];

export default {
  name: 'clan', aliases: ['clans'], category: 'Group',
  description: 'Group clans: create, join, leave, list',
  usage: 'clan create <name> | clan join <name> | clan leave | clan list | clan info <name> | clan daily | clan top',
  async run(ctx) {
    if (!featOn('clan')) return ctx.reply('Clans are turned off right now.');
    if (!ctx.isGroup) return ctx.reply('Clans only work in groups.');
    const [sub, ...rest] = ctx.args;
    const name = rest.join(' ').trim().slice(0, 24);
    const me = num(ctx.senderJid || ctx.sender);
    const cs = clans(ctx.jid);
    const mine = Object.entries(cs).find(([, c]) => c.members.includes(me));
    if (sub === 'create') {
      if (!name) return ctx.reply('Name your clan. Example: ' + config.prefix + 'clan create Tigers');
      if (mine) return ctx.reply('You are already in *' + mine[0] + '*. Leave it first with ' + config.prefix + 'clan leave');
      if (cs[name]) return ctx.reply('That clan name is taken in this group.');
      cs[name] = { owner: me, members: [me], created: Date.now() };
      save();
      return ctx.reply('🛡️ Clan *' + name + '* created! Others join with ' + config.prefix + 'clan join ' + name);
    }
    if (sub === 'join') {
      if (!name || !cs[name]) return ctx.reply('That clan does not exist here. See ' + config.prefix + 'clan list');
      if (mine) return ctx.reply('Leave *' + mine[0] + '* first with ' + config.prefix + 'clan leave');
      if (cs[name].members.length >= 50) return ctx.reply('That clan is full (50 members).');
      cs[name].members.push(me); save();
      return ctx.reply('🛡️ You joined *' + name + '* (' + cs[name].members.length + ' members)');
    }
    if (sub === 'leave') {
      if (!mine) return ctx.reply('You are not in a clan.');
      const [n, c] = mine;
      c.members = c.members.filter((x) => x !== me);
      if (!c.members.length) delete cs[n];
      else if (c.owner === me) c.owner = c.members[0];
      save();
      return ctx.reply('You left *' + n + '*.' + (cs[n] ? '' : ' The clan disbanded.'));
    }
    if (sub === 'daily') {
      if (!mine) return ctx.reply('Join a clan first: ' + config.prefix + 'clan list');
      const [n, c] = mine;
      c.daily ||= {};
      if (c.daily[me] === today()) return ctx.reply('You already did your daily clan task today. Come back tomorrow.');
      c.daily[me] = today();
      const before = clanLevel(c.points);
      c.points = (c.points || 0) + 10;
      save();
      const lv = clanLevel(c.points);
      return ctx.reply('🛡️ +10 points for *' + n + '* (' + c.points + ' total, level ' + lv + ').' + (lv > before ? ' 🎉 Your clan reached level ' + lv + '!' : ''));
    }
    if (sub === 'top') {
      const top = Object.entries(cs).sort((a, b) => (b[1].points || 0) - (a[1].points || 0)).slice(0, 10);
      if (!top.length) return ctx.reply('No clans in this group yet.');
      return ctx.reply('🏆 *Clan ranking*\n' + top.map(([n, c], i) => (i + 1) + '. ' + n + ' - ' + (c.points || 0) + ' pts (level ' + clanLevel(c.points) + ')').join('\n'));
    }
    if (sub === 'info') {
      const c = cs[name];
      if (!c) return ctx.reply('No clan by that name here.');
      return ctx.sock.sendMessage(ctx.jid, { text: '🛡️ *' + name + '*\nMembers: ' + c.members.length + '\nLeader: @' + c.owner + '\nMade: ' + new Date(c.created).toLocaleDateString('en-IN'), mentions: [c.owner + '@s.whatsapp.net']  }, { quoted: ctx.msg });
    }
    const names = Object.keys(cs);
    if (!names.length) return ctx.reply('No clans in this group yet. Start one: ' + config.prefix + 'clan create <name>');
    return ctx.reply('🛡️ *Clans here:*\n' + names.map((n) => '• ' + n + ' (' + cs[n].members.length + ')').join('\n') + '\n\nJoin: ' + config.prefix + 'clan join <name>');
  },
};
