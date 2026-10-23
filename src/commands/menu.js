import {t,preference} from '../i18n/index.js';
import {fullAccess} from '../permissions/index.js';
import {usage} from '../ops/index.js';
import config from '../config/config.js';
import { snapshot, istFull } from '../utils/botstats.js';
import { EFFECTS } from '../fun/voicefx.js';
import { formatBytes, formatDuration } from '../utils/helpers.js';
import { getMenuMedia } from '../utilities/menumedia.js';
import { featOn } from '../config/features.js';

const SECTIONS = [
  { cat: 'General', title: 'GENERAL' },
  { cat: 'Downloaders', title: 'DOWNLOADERS' },
  { cat: 'Image', title: 'IMAGE' },
  { cat: 'AI', title: 'AI' },
  { cat: 'Games', title: 'GAMES' },
  { cat: 'Utilities', title: 'UTILITIES' },
  { cat: 'Tools', title: 'TOOLS' },
  { cat: 'Books', title: 'BOOKS' },
  { cat: 'Group', title: 'GROUP' },
  { cat: 'Performance Mode', title: 'PERFORMANCE MODE' },
  { cat: 'Voice Change', title: 'VOICE CHANGE' },
  { cat: 'Recover', title: 'RECOVER' },
  { cat: 'WhatsApp', title: 'BOT' },
];
const SHORT = {
  menu: 'all commands',
  queue: 'owner command queue (runs when online)',
  history: 'your recent commands',
  limits: 'bot limits and your usage',
  backup: 'owner data backup zip',
  crashes: 'owner crash log',
  power: 'power mode: fastest, parallel media jobs', balanced: 'balanced mode: default', save: 'save mode: lowest RAM, slower',
  help: 'how to use',
  feedback: 'report a problem or request a feature',
  ping: 'speed check',
  video: 'video (MP4)',
  play: 'audio',
  spotify: 'spotify song mp3',
  pinterest: 'image/video',
  ask: 'ask any ai',
  chat: 'ai chat mode', pair: 'pair with the website', shazam: 'find song from clip', summary: 'chat recap', expense: 'split expenses', pollresult: 'poll results', linkcheck: 'scam link checker', trusted: 'automod exempt list', number: 'phone number lookup', readaloud: 'read pdf aloud', dashboard: 'owner web panel', confessions: 'confession box admin', capsule: 'message to future', wrapped: 'group year in review', homework: 'photo to solution', sound: 'sound board', debate: 'AI debate', santa: 'secret santa', akinator: 'AI mind reader', vibe: 'daily vibe check', story: 'story chain', cmd: 'make custom commands', emoji: 'emoji translator', birthday: 'auto birthday wishes', roastlist: 'playlist roast', sid: 'install S-ID', apikey: 'API keys (owner)', autotranslate: 'live translate',
  sticker: 'image to sticker',
  toimg: 'sticker to image',
  resize: 'change width',
  compress: 'smaller file',
  convert: 'png jpg webp',
  status: 'uptime and stats',
  groupinfo: 'group details', grouplink: 'invite link', revoke: 'reset link', add: 'add by number', remove: 'remove member', promote: 'make admin', demote: 'remove admin',
  tagall: 'mention all', warn: 'warn member', warnings: 'view warnings', resetwarn: 'clear warnings', antilink: 'block links', antispam: 'block repeats', antiflood: 'slow floods',
  welcome: 'welcome msg', goodbye: 'goodbye msg', blockword: 'word filter', rules: 'group rules', setrules: 'set rules', groupstats: 'activity stats', groupconfig: 'group settings',
  statusdl: 'save statuses', antidelete: 'deleted msgs', deleted: 'deleted list', vv: 'view-once photo', vvn: 'view-once voice', getpp: 'profile picture',
  tts: 'text to voice', ttsvoices: 'voice list',
  vision: 'ask about a photo', askpdf: 'q&a with a pdf', weatheralert: 'daily weather alert', newsdigest: 'daily news digest', split: 'split group bills', habit: 'habit tracker + streaks', flashcard: 'ai study flashcards', typerace: 'group typing race', pricealert: 'price target alerts', wordoftheday: 'daily english word',
  announce: 'announcement', schedule: 'daily message', mute: 'admins only chat', unmute: 'open chat', botadmin: 'bot admins',
};
const ORDER = ['menu', 'help', 'ping', 'play', 'video', 'pinterest', 'sticker', 'toimg', 'resize', 'compress', 'convert', 'ask', 'status'];
const SC = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', y: 'ʏ', z: 'ᴢ' };
const sc = (t) => String(t).toLowerCase().replace(/[a-z]/g, (ch) => SC[ch] || ch);
const LINE = '━━━━━━━━━━━━━━━━━━';

/** Splits menu lines into messages under `max` characters, cutting only between sections (after a closing fence + blank line). */
export function splitMenu(lines, max = 3800) {
  const blocks = []; let cur = [];
  for (const l of lines) { cur.push(l); if (l === '' && cur.length > 1 && cur.at(-2) === '```') { blocks.push(cur); cur = []; } }
  if (cur.length) blocks.push(cur);
  const parts = []; let acc = [];
  for (const b of blocks) { const txt = b.join('\n'); if (acc.length && acc.join('\n').length + 1 + txt.length > max) { parts.push(acc.join('\n')); acc = []; } acc.push(txt); }
  if (acc.length) parts.push(acc.join('\n'));
  return parts;
}

const EMOJI = {
  Education: '🎓',
  General: '🏠', WhatsApp: '💬', System: '⚙️', 'Performance Mode': '🚀', Language: '🌐', Diagnostics: '🩺', Permissions: '🔐',
  Downloaders: '📥', Image: '🖼️', 'Image & Sticker': '🎨', 'Voice Change': '🎙️', Upload: '☁️', Books: '📚',
  AI: '🤖', Utilities: '🧰', Tools: '🛠️', 'Text Tools': '🔤', 'Encode & Crypto': '🔑', Converters: '🔄', 'Developer Tools': '👨‍💻', 'Web Lookup': '🔎', 'Social Lookup': '🕵️',
  Games: '🎮', Fun: '🎉', 'Fun & Humor': '😂', Pranks: '😈', Extras: '✨',
  'Math & Calculators': '🧮', 'Date & Time': '📅', 'Health & Fitness': '💪', Finance: '💰', Economy: '🪙', 'Facts & Knowledge': '🧠', Study: '🎓', Work: '💼', 'Daily Life': '☀️', Productivity: '✅',
  Group: '👥', Recover: '♻️', Owner: '👑', 'Owner & System': '👑',
};
const GROUPS = [
  ['START HERE', ['General', 'WhatsApp', 'System', 'Performance Mode', 'Language', 'Diagnostics', 'Permissions']],
  ['MEDIA', ['Downloaders', 'Image', 'Image & Sticker', 'Voice Change', 'Upload', 'Books']],
  ['SMART TOOLS', ['AI', 'Utilities', 'Tools', 'Text Tools', 'Converters', 'Encode & Crypto', 'Developer Tools', 'Web Lookup', 'Social Lookup']],
  ['FUN & GAMES', ['Games', 'Fun', 'Fun & Humor', 'Pranks', 'Extras']],
  ['LIFE & LEARNING', ['Education', 'Math & Calculators', 'Date & Time', 'Health & Fitness', 'Finance', 'Economy', 'Facts & Knowledge', 'Study', 'Work', 'Daily Life', 'Productivity']],
  ['GROUPS & ADMIN', ['Group', 'Recover', 'Owner', 'Owner & System']],
];
const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');

export default {
  name: 'menu',
  aliases: ['start', 'commands'],
  category: 'General',
  description: 'Show all commands',
  usage: 'menu [category | all]',
  async run(ctx) {
    const p = config.prefix;
    const all = ctx.commands.list().filter((c) => !c.hidden && (!c.ownerOnly||ctx.isOwner||(fullAccess(ctx)&&!['addsudo','delsudo','listsudo'].includes(c.name))));
    const rank = (c) => (ORDER.indexOf(c.name) === -1 ? 99 : ORDER.indexOf(c.name));
    const counts = new Map();
    for (const c of all) counts.set(c.category, (counts.get(c.category) || 0) + 1);
    const cats = [];
    const seen = new Set();
    const groups = GROUPS.map(([title, list]) => [title, list.filter((k) => counts.has(k))]);
    for (const [, list] of groups) for (const k of list) seen.add(k);
    const rest = [...counts.keys()].filter((k) => !seen.has(k));
    if (rest.length) groups.push(['MORE', rest]);
    for (const [, list] of groups) cats.push(...list);
    const rawArg=(ctx.args||[]).join(' ').trim();
    // /menu search <term>: find commands by name or description
    if(/^search\s+/i.test(rawArg)){
      const needle=slug(rawArg.replace(/^search\s+/i,''));
      if(!needle)return ctx.reply('Usage: '+p+'menu search <word>');
      const hits=all.filter(c=>slug(c.name).includes(needle)||slug(c.description||'').includes(needle)||(c.aliases||[]).some(a=>slug(a).includes(needle))).slice(0,20);
      if(!hits.length)return ctx.reply('No command matches "'+rawArg.replace(/^search\s+/i,'').slice(0,40)+'".');
      return ctx.reply('🔎 *Commands matching "'+rawArg.replace(/^search\s+/i,'').slice(0,30)+'"*\n'+LINE+'\n'+hits.map(c=>p+c.name+' - '+(SHORT[c.name]||c.description)).join('\n'));
    }
    const arg = slug(rawArg);
    const header = [`╭━━━ *${config.botName} ${t(ctx,'menu')}* ━━━╮`, `┃ ${t(ctx,'assistant')}`, '╰━━━━━━━━━━━━━━━━━━━━╯', ''];
    const footer = [LINE, `💡 ${t(ctx,'menu_footer',{prefix:p})}`];

    const catPage = (k) => {
      const cmds = all.filter((c) => c.category === k).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      const rows = k === 'Voice Change' ? Object.keys(EFFECTS).map((n) => [`${p}${n}`, EFFECTS[n].desc]) : cmds.map((c) => [`${p}${c.name}`, preference(ctx)==='eng'?(SHORT[c.name]||c.description):(t(ctx,'desc_'+c.name)==='desc_'+c.name?c.description:t(ctx,'desc_'+c.name))]);
      const w = Math.min(Math.max(...rows.map((r) => r[0].length)) + 2, 22);
      const ct = t(ctx, 'cat_' + k);
      const lines = [`${EMOJI[k] || '▪️'} *${(ct === 'cat_' + k ? k : ct).toUpperCase()}* · ${rows.length}`, LINE, '```', ...rows.map(([a, b]) => { const d = String(b); return `${a.padEnd(w)}${d.length > 38 ? d.slice(0, 37).trimEnd() + '…' : d}`; }), '```', ''];
      if (k === 'Voice Change') lines.push(`_Reply to a voice note with any effect, e.g. ${p}chipmunk. Custom: ${p}voicechanger custom pitch=5 echo=0.5_`, '');
      return lines;
    };
    const send = async (lines) => {
      const parts = splitMenu(lines, 3800);
      for (let i = 0; i < parts.length; i++) {
        const text = parts.length > 1 ? `${parts[i]}\n${i + 1}/${parts.length}` : parts[i];
        if (i === 0 && featOn('menuvid')) {
          const mm = getMenuMedia();
          if (mm) {
            try {
              const payload = mm.kind === 'image' ? { image: mm.buf } : { video: mm.buf };
              await ctx.sock.sendMessage(ctx.jid, { ...payload, caption: text.slice(0, 1000) }, { quoted: ctx.msg });
              if (text.length > 1000) await ctx.reply(text.slice(1000));
              continue;
            } catch { /* fall back to plain text */ }
          }
        }
        await ctx.reply(text);
      }
    };

    if (arg === 'all') {
      const lines = [...header, `📣 ${p}feedback <message> - report a problem or request a feature`, ''];
      for (const k of cats) lines.push(...catPage(k));
      lines.push(...footer);
      return send(lines);
    }
    if (arg) {
      const n = /^\d+$/.test(arg) ? cats[Number(arg) - 1] : undefined;
      const hit = n || cats.find((k) => slug(k) === arg) || cats.find((k) => slug(k).startsWith(arg)) || cats.find((k) => slug(k).includes(arg));
      if (hit) return send([...catPage(hit), `↩️ ${p}menu - all categories`]);
      return ctx.reply(`❓ No category "${(ctx.args || []).join(' ')}".\nTry ${p}menu to see all categories.`);
    }

    const lines = [...header, `📣 ${p}feedback <message> - report a problem or request a feature`, ''];
    lines.push(`🆕 *NEW THIS WEEK*`, `▸ ${p}vision ${p}askpdf ${p}flashcard - study help`, `▸ ${p}weatheralert ${p}newsdigest ${p}wordoftheday - daily`, `▸ ${p}split ${p}habit ${p}pricealert ${p}typerace`, `▸ recurring reminders, notes search/pin/export`, '');
    lines.push(`📲 *Quick start*`, `▸ ${p}play <song>  ·  ▸ ${p}video <link>`, `▸ ${p}ask <question>  ·  ▸ ${p}sticker`, '');
    if(ctx.isOwner&&!ctx.isGroup){const favorites=usage.summary().owner.filter(([n])=>!['menu','help','status'].includes(n)).slice(0,4);if(favorites.length)lines.push(`⭐ *${t(ctx,'favorites')}*`,favorites.map(([n])=>p+n).join('  '),'');}
    try {
      const s = await snapshot(ctx.commands);
      lines.push(`📊 *${t(ctx,'live')}*`, '```', `${t(ctx,'uptime').padEnd(8)}${formatDuration(s.uptimeSec)}`, `${t(ctx,'ram').padEnd(8)}${formatBytes(s.ramUsed)} / ${formatBytes(s.ramLimit)}`, `${'Cmds'.padEnd(8)}${all.length}`, '```', '');
    } catch { /* stats are optional */ }
    let n = 0;
    for (const [title, list] of groups) {
      if (!list.length) continue;
      lines.push(`*${title}*`);
      for (const k of list) { n++; lines.push(`${EMOJI[k] || '▪️'} ${String(n).padStart(2, ' ')}. ${k} (${counts.get(k)})`); }
      lines.push('');
    }
    lines.push(`👉 *${p}menu <name or number>*  e.g. ${p}menu downloaders  or  ${p}menu 7`, `📜 *${p}menu all*  - every command`, '', ...footer);
    const parts = splitMenu(lines, 3800);
    if (parts.length === 1) return ctx.reply(parts[0]);
    return send(lines);
  },
};
