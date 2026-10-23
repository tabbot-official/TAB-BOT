import {rt} from '../i18n/runtime.js';
import {t,preference} from '../i18n/index.js';
import {isSudo} from '../permissions/index.js';
// Group management commands. Each one is exported by name and wrapped by a thin file in src/commands/.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { store, settings, DEFAULTS } from './store.js';
import { out, admin as adminQ, rateLimited, cooldown } from './limiter.js';
import { getMeta, dropMeta, findMember, botMember, isAdminP, levelOf, levelOfMember, num, LEVEL, LEVEL_NAME } from './perms.js';
import { validTime, normTime, parseWhen, describeWhen } from './scheduler.js';
import { topUsers as topWeek, dailyTotals, busiestHour, trackingStart } from './activity.js';
import { parseDuration, setReopen, clearReopen } from './timedmute.js';

const P = () => config.prefix;
const onoff=(ctx,v)=>rt(ctx,v?'state_on':'state_off');
const fmtDate = (ts) => new Date(ts).toLocaleString('en-IN', { timeZone: process.env.BOT_TZ || 'Asia/Calcutta', day: '2-digit', month: 'short', year: 'numeric' });

function ctxInfoOf(msg) {
  const m = msg.message?.ephemeralMessage?.message || msg.message || {};
  return m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || null;
}

/** Works out the target member: @mention, quoted message sender, or a phone number argument. */
function targetOf(ctx, meta) {
  const info = ctxInfoOf(ctx.msg);
  const mention = info?.mentionedJid?.[0];
  if (mention) return { member: findMember(meta, mention), raw: mention };
  const digits = ctx.args.map((a) => a.replace(/\D/g, '')).find((d) => d.length >= 7);
  if (digits) return { member: findMember(meta, digits), raw: `${digits}@s.whatsapp.net`, digits };
  if (info?.participant) return { member: findMember(meta, info.participant), raw: info.participant };
  return null;
}

function reasonText(ctx) {
  return ctx.args.filter((a) => !/^@?\+?\d{5,}$/.test(a)).join(' ').trim().slice(0, 200);
}

/** Wraps a handler with group-only, permission, bot-admin and rate-limit checks. */
function def(name, o) {
  return {
    name,
    category: 'Group',
    aliases: o.aliases || [],
    description: o.description,
    usage: o.usage || name,
    minArgs: o.minArgs || 0,
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply(rt(ctx,'group_only'));
      if (!store()) return ctx.reply(t(ctx,'error_service'));
      if (rateLimited(`cmd:${ctx.jid}:${ctx.sender}`, 10, 60_000) && !ctx.isOwner) return ctx.reply(t(ctx,'cooldown',{seconds:60}));
      // Privileged operations must not authorize from a cached admin list.
      const meta = await getMeta(ctx.sock, ctx.jid, (o.level || LEVEL.member) > LEVEL.member || !!o.botAdmin);
      if (!meta) return ctx.reply(t(ctx,'error_service'));
      const level = levelOf(ctx.sock, meta, ctx.msg, ctx.isOwner);
      const need = o.level || LEVEL.member;
      if (level < need && !(need >= LEVEL.botAdmin && isSudo(ctx) && level >= LEVEL.groupAdmin)) {
        return ctx.reply(rt(ctx,need>=LEVEL.owner?'group_permission_owner':need>=LEVEL.botAdmin?'group_permission_botadmin':'group_permission_admin'));
      }
      const me = botMember(ctx.sock, meta);
      if (o.botAdmin && !isAdminP(me)) return ctx.reply(rt(ctx,'bot_admin_needed'));
      const g = { meta, level, me, s: settings(ctx.jid), st: store() };
      await o.run(ctx, g);
    },
  };
}

const A = LEVEL.groupAdmin;
export const cmds = {};
const add = (name, o) => { cmds[name] = def(name, o); };

add('groupinfo', {
  aliases: ['ginfo'], description: 'Show info about this group', usage: 'groupinfo',
  async run(ctx, { meta, s }) {
    const admins = meta.participants.filter(isAdminP).length;
    const lines = [
      `*${meta.subject}*`,
      meta.desc ? `\n${String(meta.desc).slice(0, 300)}\n` : '',
      rt(ctx,'members_count',{count:meta.participants.length}),
      rt(ctx,'admins_count',{count:admins}),
      meta.creation ? rt(ctx,'created_at',{time:fmtDate(meta.creation*1000)}) : '',
      rt(ctx,'who_can_send',{who:meta.announce?rt(ctx,'admins_only'):rt(ctx,'everyone')}),
      rt(ctx,'group_switches',{welcome:onoff(ctx,s.welcome),goodbye:onoff(ctx,s.goodbye),antilink:onoff(ctx,s.antilink),antispam:onoff(ctx,s.antispam)}),
    ];
    await ctx.reply(lines.filter(Boolean).join('\n'));
  },
});

add('grouplink', {
  aliases: ['link'], description: 'Get the invite link (admins)', usage: 'grouplink', level: A, botAdmin: true,
  async run(ctx) {
    const code = await ctx.sock.groupInviteCode(ctx.jid);
    await ctx.reply(`🔗 https://chat.whatsapp.com/${code}`);
  },
});

add('revoke', {
  aliases: ['resetlink'], description: 'Reset the invite link (admins)', usage: 'revoke', level: A, botAdmin: true,
  async run(ctx) {
    const code = await ctx.sock.groupRevokeInvite(ctx.jid);
    await ctx.reply(rt(ctx,'invite_reset',{url:'https://chat.whatsapp.com/'+code}));
  },
});

add('add', {
  description: 'Add a person by number (admins)', usage: 'add 919876543210', level: A, botAdmin: true, minArgs: 1,
  async run(ctx, { meta }) {
    const digits = ctx.args[0].replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return ctx.reply(rt(ctx,'add_number',{prefix:P()}));
    if (findMember(meta, digits)) return ctx.reply(rt(ctx,'already_member'));
    const res = await adminQ.schedule(() => ctx.sock.groupParticipantsUpdate(ctx.jid, [`${digits}@s.whatsapp.net`], 'add'));
    const r = res?.[0];
    const status = String(r?.status || '200');
    dropMeta(ctx.jid);
    if (status === '200') return ctx.reply(rt(ctx,'member_added'));
    if (status === '403') return ctx.reply(rt(ctx,'add_privacy',{prefix:P()}));
    if (status === '408') return ctx.reply(rt(ctx,'recently_left'));
    if (status === '409') return ctx.reply(rt(ctx,'already_member'));
    return ctx.reply(rt(ctx,'add_failed',{status}));
  },
});

async function rankAction(ctx, g, action, verb) {
  const t = targetOf(ctx, g.meta);
  if (!t) return ctx.reply(rt(ctx,'target_needed',{prefix:P(),command:verb}));
  if (!t.member) return ctx.reply(rt(ctx,'not_member'));
  const target = t.member;
  if (findMember(g.meta, ctx.sock.user?.id, ctx.sock.user?.lid)?.id === target.id) return ctx.reply(rt(ctx,'no_self_action'));
  const tl = levelOfMember(ctx.sock, target);
  if (action === 'remove' && tl >= g.level) return ctx.reply(rt(ctx,'remove_rank'));
  if (action === 'remove' && tl >= LEVEL.owner) return ctx.reply(rt(ctx,'remove_owner'));
  if (action === 'promote' && isAdminP(target)) return ctx.reply(rt(ctx,'already_admin'));
  if (action === 'demote' && !isAdminP(target)) return ctx.reply(rt(ctx,'not_admin'));
  if (action === 'demote' && tl >= g.level && g.level < LEVEL.botAdmin) return ctx.reply(rt(ctx,'demote_rank'));
  await adminQ.schedule(() => ctx.sock.groupParticipantsUpdate(ctx.jid, [target.id], action));
  dropMeta(ctx.jid);
  const done=rt(ctx,{remove:'action_removed',promote:'action_promoted',demote:'action_demoted'}[action]);
  await ctx.sock.sendMessage(ctx.jid, { text: rt(ctx,'rank_done',{number:num(target.id),action:done}), mentions: [target.id] }, { quoted: ctx.msg });
}
for (const [name, action, desc] of [['remove', 'remove', 'Remove a person (admins)'], ['promote', 'promote', 'Make someone an admin (admins)'], ['demote', 'demote', 'Remove admin rights (admins)']]) {
  add(name, { aliases: name === 'remove' ? ['kick'] : [], description: desc, usage: `${name} @person`, level: A, botAdmin: true, run: (ctx, g) => rankAction(ctx, g, action, name) });
}

add('tagall', {
  aliases: ['everyone'], description: 'Mention everyone once (admins, 10 min cooldown)', usage: 'tagall [message]', level: A,
  async run(ctx, { meta, level }) {
    if (level < LEVEL.botAdmin) {
      const wait = cooldown(`tagall:${ctx.jid}`, 10 * 60_000);
      if (wait) return ctx.reply(rt(ctx,'tagall_wait',{prefix:P(),minutes:Math.ceil(wait/60000)}));
    }
    const ids = meta.participants.map((p) => p.id).slice(0, 1024);
    const note = ctx.args.join(' ').slice(0, 300);
    const body = `📢 *${note || rt(ctx,'attention')}*\n\n` + ids.map((i) => `@${num(i)}`).join(' ');
    await out.schedule(() => ctx.sock.sendMessage(ctx.jid, { text: body, mentions: ids }));
  },
});

add('hidetag', {
  aliases: ['htag'], description: 'Send a message that silently mentions every member (admins)', usage: 'hidetag <text>', level: A,
  async run(ctx, { meta, level }) {
    const text = ctx.args.join(' ').slice(0, 1000);
    if (!text) return ctx.reply(`Usage: ${P()}hidetag <text>`);
    if (level < LEVEL.botAdmin) {
      const wait = cooldown(`hidetag:${ctx.jid}`, 60_000);
      if (wait) return ctx.reply(`Wait ${Math.ceil(wait / 1000)}s before using ${P()}hidetag again.`);
    }
    const ids = meta.participants.map((p) => p.id).slice(0, 1024);
    await out.schedule(() => ctx.sock.sendMessage(ctx.jid, { text, mentions: ids }));
  },
});

add('warn', {
  description: 'Warn a member (admins)', usage: 'warn @person [reason]', level: A,
  async run(ctx, g) {
    const t = targetOf(ctx, g.meta);
    if (!t?.member) return ctx.reply(rt(ctx,'warn_target',{prefix:P()}));
    if (levelOfMember(ctx.sock, t.member) >= LEVEL.groupAdmin) return ctx.reply(rt(ctx,'warn_admin'));
    const reason = reasonText(ctx) || rt(ctx,'no_reason');
    const id = t.member.id;
    const count = g.st.addWarn(ctx.jid, num(id), num(ctx.senderJid), reason);
    let text = rt(ctx,'warn_result',{number:num(id),count,limit:g.s.warnLimit,reason});
    if (count >= g.s.warnLimit) {
      if (g.s.warnAction === 'kick' && isAdminP(g.me)) {
        await adminQ.schedule(() => ctx.sock.groupParticipantsUpdate(ctx.jid, [id], 'remove')).catch((e) => logger.warn(`[groups] remove failed: ${e.message}`));
        g.st.clearWarns(ctx.jid, num(id));
        dropMeta(ctx.jid);
        text += rt(ctx,'warn_removed');
      } else text += rt(ctx,'warn_review',{prefix:P()});
    }
    await ctx.sock.sendMessage(ctx.jid, { text, mentions: [id] }, { quoted: ctx.msg });
  },
});

add('warnings', {
  aliases: ['warns'], description: 'Show warnings of a member', usage: 'warnings [@person]',
  async run(ctx, g) {
    const t = targetOf(ctx, g.meta);
    let member = t?.member;
    if (t && g.level < A && member && member.id !== findMember(g.meta, ctx.msg.key.participant, ctx.msg.key.participantAlt)?.id) {
      return ctx.reply(rt(ctx,'warnings_private'));
    }
    if (!t) member = findMember(g.meta, ctx.msg.key.participant, ctx.msg.key.participantAlt);
    if (!member) return ctx.reply(rt(ctx,'unknown_member'));
    const list = g.st.listWarns(ctx.jid, num(member.id));
    if (!list.length) return ctx.sock.sendMessage(ctx.jid, { text: rt(ctx,'no_warnings',{number:num(member.id)}), mentions: [member.id] }, { quoted: ctx.msg });
    const lines = list.slice(-10).map((w, i) => `${i + 1}. ${fmtDate(w.ts)}: ${w.by==='auto'&&['moderation_links','moderation_words','moderation_repeat','moderation_fast'].includes(w.reason)?rt(ctx,w.reason):w.reason||'-'}`);
    await ctx.sock.sendMessage(ctx.jid, { text: rt(ctx,'warnings_list',{number:num(member.id),count:list.length,limit:g.s.warnLimit,items:lines.join('\n')}), mentions: [member.id] }, { quoted: ctx.msg });
  },
});

add('resetwarn', {
  aliases: ['clearwarn'], description: 'Clear warnings of a member (admins)', usage: 'resetwarn @person', level: A,
  async run(ctx, g) {
    const t = targetOf(ctx, g.meta);
    if (!t?.member) return ctx.reply(rt(ctx,'resetwarn_target',{prefix:P()}));
    const n = g.st.clearWarns(ctx.jid, num(t.member.id));
    await ctx.sock.sendMessage(ctx.jid, { text: n ? rt(ctx,'warnings_cleared',{count:n,number:num(t.member.id)}) : rt(ctx,'had_no_warnings',{number:num(t.member.id)}), mentions: [t.member.id] }, { quoted: ctx.msg });
  },
});


// JOINREQ: review and approve pending join requests (admins; bot must be admin).
add('joinreq', {
  aliases: ['joinrequests'], description: 'List or approve pending join requests (admins)', usage: 'joinreq list | joinreq approve-all', level: A, botAdmin: true,
  async run(ctx) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    const list = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []);
    if (!list.length) return ctx.reply('No pending join requests.');
    if (sub === 'approve-all') {
      const ids = list.map((p) => p.jid || p.id || p).filter(Boolean);
      await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, ids, 'approve');
      return ctx.reply(`✅ Approved ${ids.length} join request${ids.length === 1 ? '' : 's'}.`);
    }
    const lines = list.slice(0, 20).map((p, i) => `${i + 1}. @${num(p.jid || p.id || p)}`);
    return ctx.sock.sendMessage(ctx.jid, { text: `*Pending join requests (${list.length}):*\n` + lines.join('\n') + '\n\nApprove everyone: ' + P() + 'joinreq approve-all', mentions: list.slice(0, 20).map((p) => p.jid || p.id || p) }, { quoted: ctx.msg });
  },
});

function toggle(name, key, labelKey, extraKey = '') {
  add(name, {
    description: `Turn ${labelKey} on or off (admins)`, usage: `${name} on|off`, level: A,
    async run(ctx, g) {
      const label=rt(ctx,labelKey),extra=extraKey?'\n'+rt(ctx,extraKey):'';
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return ctx.reply(rt(ctx,'toggle_usage',{label,state:onoff(ctx,g.s[key]),prefix:P(),command:name}));
      g.st.setSetting(ctx.jid, key, v === 'on');
      let note = '';
      if (v === 'on' && ['antilink', 'antispam', 'antiflood', 'badwords', 'antisticker', 'antimedia'].includes(key) && !isAdminP(g.me)) note = rt(ctx,'warn_no_delete');
      await ctx.reply(rt(ctx,'toggle_done',{label,state:onoff(ctx,v==='on'),note,extra:v==='on'?extra:''}));
    },
  });
}
toggle('antilink','antilink','label_antilink','antilink_note');
toggle('antispam','antispam','label_antispam','antispam_note');
toggle('antisticker','antisticker','label_antisticker');
toggle('antipromote','antipromote','label_antipromote');
toggle('antimedia','antimedia','label_antimedia');
toggle('antiflood','antiflood','label_antiflood','antiflood_note');
toggle('aitoxic','aitoxic','label_aitoxic');
toggle('welcome','welcome','label_welcome');
toggle('goodbye','goodbye','label_goodbye');

add('blockword', {
  aliases: ['badword'], description: 'Manage blocked words (admins)', usage: 'blockword add|remove|list [word]', level: A,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    const word = ctx.args.slice(1).join(' ').toLowerCase().trim().slice(0, 40);
    if (sub === 'add' && word) {
      g.st.addWord(ctx.jid, word);
      g.st.setSetting(ctx.jid, 'badwords', true);
      return ctx.reply(rt(ctx,'word_blocked',{word}));
    }
    if (sub === 'remove' && word) return ctx.reply(g.st.delWord(ctx.jid, word) ? rt(ctx,'word_removed',{word}) : rt(ctx,'word_not_listed'));
    if (sub === 'off' || sub === 'on') { g.st.setSetting(ctx.jid, 'badwords', sub === 'on'); return ctx.reply(rt(ctx,'word_filter_state',{state:onoff(ctx,sub==='on')})); }
    const list = g.st.words(ctx.jid);
    await ctx.reply(rt(ctx,'word_filter_list',{state:onoff(ctx,g.s.badwords),items:list.length?list.map(w=>'• '+w).join('\n'):rt(ctx,'no_words'),prefix:P()}));
  },
});

add('rules', {
  description: 'Show the group rules', usage: 'rules',
  async run(ctx, { s, meta }) {
    if (!s.rules) return ctx.reply(rt(ctx,'no_rules',{prefix:P()}));
    await ctx.reply(rt(ctx,'group_rules',{group:meta.subject,text:s.rules}));
  },
});

add('setrules', {
  description: 'Set the group rules (admins)', usage: 'setrules <text>', level: A,
  async run(ctx, g) {
    const text = ctx.text.replace(/^\S+\s*/, '').trim().slice(0, 1500);
    if (!text) return ctx.reply(rt(ctx,'rules_input',{prefix:P()}));
    g.st.setSetting(ctx.jid, 'rules', text);
    await ctx.reply(rt(ctx,'rules_saved',{prefix:P()}));
  },
});

function extraMentions(gid, meta) {
  return topWeek(gid, 7, 3).map((u) => meta.participants.find((p) => num(p.id) === u.user)?.id).filter(Boolean);
}
function extraStats(gid, meta) {
  void meta;
  const wk = topWeek(gid, 7, 3); const days = dailyTotals(gid, 7); const bh = busiestHour(gid);
  if (!wk.length && !days.some((x) => x.msgs)) return [];
  const bar = days.map((x) => x.msgs);
  const max = Math.max(...bar, 1);
  const spark = bar.map((v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((v / max) * 7))]).join('');
  const out = ['', `📈 *Last 7 days*: ${bar.reduce((a, b) => a + b, 0)} msgs  ${spark}`];
  if (wk.length) out.push(...wk.map((u, i) => `${i + 1}. @${u.user} (${u.msgs})`));
  if (bh !== null) out.push(`🕒 Busiest hour: ${String(bh).padStart(2, '0')}:00`);
  void trackingStart;
  return out;
}

add('groupstats', {
  aliases: ['gstats'], description: 'Message counts and top members', usage: 'groupstats',
  async run(ctx, { meta, st }) {
    const t = st.totals(ctx.jid);
    const top = st.topUsers(ctx.jid, 5);
    const names = top.map((u, i) => `${i + 1}. @${u.user} (${u.msgs})`);
    const mentions = top.map((u) => meta.participants.find((p) => num(p.id) === u.user)?.id).filter(Boolean);
    await ctx.sock.sendMessage(ctx.jid, {
      text: [`📊 *${meta.subject}*`, rt(ctx,'members_count',{count:meta.participants.length}), rt(ctx,'message_counts',{messages:t.msgs,people:t.users}), rt(ctx,'warning_count',{count:st.warnTotal(ctx.jid)}), '', names.length ? rt(ctx,'top_talkers') + names.join('\n') : rt(ctx,'no_activity')].concat(extraStats(ctx.jid, meta)).join('\n'),
      mentions: [...mentions, ...extraMentions(ctx.jid, meta)],
    }, { quoted: ctx.msg });
  },
});

const SETTABLE = {
  warnlimit: ['warnLimit', 'number', 1, 10],
  warnaction: ['warnAction', ['notify', 'kick', 'mute']],
  warnexpire: ['warnExpireDays', 'number', 0, 365],
  mutehours: ['muteHours', 'number', 1, 72],
  linkmode: ['linkMode', ['all', 'invites']],
  floodlimit: ['floodLimit', 'number', 3, 30],
  floodwindow: ['floodWindow', 'number', 3, 60],
  spamrepeat: ['spamRepeat', 'number', 2, 10],
  spamwindow: ['spamWindow', 'number', 5, 120],
  welcomemsg: ['welcomeMsg', 'text'],
  goodbyemsg: ['goodbyeMsg', 'text'],
  badwords: ['badwords', 'bool'],
};
add('groupconfig', {
  aliases: ['gconfig', 'gsettings'], description: 'View or change group settings (admins)', usage: 'groupconfig [setting value]', level: A,
  async run(ctx, g) {
    const key = (ctx.args[0] || '').toLowerCase();
    if (!key) {
      const s = g.s;
      return ctx.reply([
        rt(ctx,'group_settings_title',{group:g.meta.subject}),
        rt(ctx,'settings_greetings',{welcome:onoff(ctx,s.welcome),goodbye:onoff(ctx,s.goodbye)}),
        rt(ctx,'settings_moderation',{antilink:onoff(ctx,s.antilink),antispam:onoff(ctx,s.antispam),antiflood:onoff(ctx,s.antiflood)}),
        rt(ctx,'settings_words',{state:onoff(ctx,s.badwords),count:g.st.words(ctx.jid).length}),
        rt(ctx,'settings_warnings',{limit:s.warnLimit,action:s.warnAction}),
        rt(ctx,'settings_rates',{floodLimit:s.floodLimit,floodWindow:s.floodWindow,spamRepeat:s.spamRepeat,spamWindow:s.spamWindow}),
        rt(ctx,'settings_rules',{state:rt(ctx,s.rules?'rules_set':'rules_unset'),count:g.st.listSchedules(ctx.jid).length}),
        '',
        rt(ctx,'settings_change',{prefix:P()}),
        rt(ctx,'settings_keys'),
        rt(ctx,'message_placeholders',{user:'{user}',group:'{group}',count:'{count}'}),
        rt(ctx,'settings_reset_usage',{prefix:P()}),
      ].join('\n'));
    }
    const spec = SETTABLE[key];
    if (!spec) return ctx.reply(rt(ctx,'setting_unknown',{setting:key,prefix:P()}));
    const raw = ctx.text.replace(/^\S+\s+\S+\s*/, '').trim();
    if (!raw) return ctx.reply(rt(ctx,'setting_current',{setting:key,value:String(g.s[spec[0]]).slice(0,200)}));
    if (raw.toLowerCase() === 'reset') { g.st.setSetting(ctx.jid, spec[0], DEFAULTS[spec[0]]); return ctx.reply(rt(ctx,'setting_reset',{setting:key})); }
    let val;
    if (spec[1] === 'number') {
      val = Number(raw);
      if (!Number.isInteger(val) || val < spec[2] || val > spec[3]) return ctx.reply(rt(ctx,'setting_number',{setting:key,minimum:spec[2],maximum:spec[3]}));
    } else if (spec[1] === 'text') val = raw.slice(0, 500);
    else if (spec[1] === 'bool') { if (!['on', 'off'].includes(raw.toLowerCase())) return ctx.reply(rt(ctx,'on_off_input')); val = raw.toLowerCase() === 'on'; }
    else { val = raw.toLowerCase(); if (!spec[1].includes(val)) return ctx.reply(rt(ctx,'setting_options',{setting:key,options:spec[1].join(', ')})); }
    g.st.setSetting(ctx.jid, spec[0], val);
    await ctx.reply(rt(ctx,'setting_saved',{setting:key,value:String(val).slice(0,200)}));
  },
});

add('trusted', {
  aliases: ['trust'], description: 'Members exempt from auto-moderation (admins)', usage: 'trusted add|remove|list @person', level: A,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    const cur = Array.isArray(g.s.trusted) ? g.s.trusted : [];
    if (sub === 'list') return ctx.reply(cur.length ? 'Trusted members (skip anti-link/spam/flood/words):\n' + cur.map((n) => '+' + n).join('\n') : `No trusted members. Add one: ${P()}trusted add @person`);
    if (!['add', 'remove'].includes(sub)) return ctx.reply(`Use: ${P()}trusted add @person | remove @person | list`);
    const t = targetOf(ctx, g.meta);
    if (!t?.member) return ctx.reply('Mention or reply to a member of this group.');
    const n = num(t.member.id);
    const next = sub === 'add' ? [...new Set([...cur, n])].slice(0, 50) : cur.filter((x) => x !== n);
    g.st.setSetting(ctx.jid, 'trusted', next);
    await ctx.reply(sub === 'add' ? `+${n} is now trusted (auto-moderation skips them).` : `+${n} removed from trusted.`);
  },
});

add('announce', {
  description: 'Post an announcement (admins)', usage: 'announce <text>', level: A, minArgs: 1,
  async run(ctx) {
    const text = ctx.text.replace(/^\S+\s*/, '').trim().slice(0, 2000);
    await out.schedule(() => ctx.sock.sendMessage(ctx.jid, { text: rt(ctx,'announcement',{text}) }));
  },
});

add('schedule', {
  description: 'Scheduled message: daily, weekly or one-time (admins)', usage: 'schedule [mon,fri|weekdays|2026-12-31] 09:00 text | list | del <id>', level: A,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    if (sub === 'list') {
      const l = g.st.listSchedules(ctx.jid);
      return ctx.reply(l.length ? rt(ctx,'schedule_heading') + l.map((x) => `#${x.id} ${describeWhen(x)} - ${x.text.slice(0, 60)}`).join('\n') : rt(ctx,'schedule_empty',{prefix:P()}));
    }
    if (sub === 'del' || sub === 'delete') {
      const id = Number(ctx.args[1]);
      return ctx.reply(Number.isInteger(id) && g.st.delSchedule(ctx.jid, id) ? rt(ctx,'schedule_removed',{id}) : rt(ctx,'schedule_not_found'));
    }
    const w = parseWhen(ctx.args);
    if (!w) return ctx.reply(`Use: ${P()}schedule 09:00 text\n${P()}schedule mon,fri 18:30 text (or weekdays / weekends)\n${P()}schedule 2026-12-31 23:59 text (one time)`);
    const text = w.rest.slice(0, 1000);
    if (!text) return ctx.reply(rt(ctx,'schedule_text_input'));
    if (w.date && w.date + 'T' + w.hhmm < new Date().toLocaleString('sv-SE', { timeZone: process.env.BOT_TZ || 'Asia/Calcutta' }).replace(' ', 'T').slice(0, 16)) return ctx.reply('That date and time is already in the past.');
    if (g.st.listSchedules(ctx.jid).length >= 10) return ctx.reply(rt(ctx,'schedule_limit'));
    const id = g.st.addSchedule(ctx.jid, w.hhmm, text, num(ctx.senderJid), { dow: w.dow, date: w.date });
    await ctx.reply(`✅ Scheduled #${id}: ${describeWhen({ ...w })} (${process.env.BOT_TZ || 'Asia/Calcutta'})`);
  },
});

for (const [name, announce, desc] of [['mute', true, 'Only admins can send (admins)'], ['unmute', false, 'Everyone can send (admins)']]) {
  add(name, {
    description: desc, usage: name === 'mute' ? 'mute [30m|2h|1d]' : name, level: A, botAdmin: true,
    async run(ctx) {
      const ms = announce && ctx.args[0] ? parseDuration(ctx.args[0]) : 0;
      if (announce && ctx.args[0] && !ms) return ctx.reply(`Use a time like ${P()}mute 30m, ${P()}mute 2h or ${P()}mute 1d (1 min to 7 days).`);
      await adminQ.schedule(() => ctx.sock.groupSettingUpdate(ctx.jid, announce ? 'announcement' : 'not_announcement'));
      dropMeta(ctx.jid);
      if (ms) {
        setReopen(ctx.jid, Date.now() + ms);
        const at = new Date(Date.now() + ms).toLocaleTimeString('en-IN', { timeZone: process.env.BOT_TZ || 'Asia/Calcutta', hour: '2-digit', minute: '2-digit', hour12: true });
        return ctx.reply(rt(ctx,'group_muted') + `\n⏰ Reopens automatically at ${at}.`);
      }
      clearReopen(ctx.jid);
      await ctx.reply(announce ? rt(ctx,'group_muted') : rt(ctx,'group_unmuted'));
    },
  });
}

add('botadmin', {
  description: 'Manage bot admins (owner only)', usage: 'botadmin add|remove|list @person', level: LEVEL.owner,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    if (sub === 'list') {
      const l = g.st.botAdmins();
      return ctx.reply(l.length ? rt(ctx,'bot_admins') + l.map((n) => `• +${n}`).join('\n') : rt(ctx,'no_bot_admins'));
    }
    const t = targetOf({ ...ctx, args: ctx.args.slice(1) }, g.meta);
    const n = t?.digits || (t?.member && (num(t.member.phoneNumber || '') || num(t.member.id)));
    if (!n) return ctx.reply(rt(ctx,'botadmin_target',{prefix:P()}));
    if (sub === 'add') { g.st.addBotAdmin(n); return ctx.reply(rt(ctx,'botadmin_added',{number:n})); }
    if (sub === 'remove') return ctx.reply(g.st.delBotAdmin(n) ? rt(ctx,'botadmin_removed',{number:n}) : rt(ctx,'botadmin_not_found'));
    await ctx.reply(rt(ctx,'botadmin_usage',{prefix:P()}));
  },
});

export { LEVEL_NAME };
