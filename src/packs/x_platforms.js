// Social platform commands (/Platform <public link>). Media platforms use src/downloaders/platforms.js; info platforms use public no-key APIs.
// All live in the Downloaders category. Public content only: no logins, cookies, DRM or paywall bypass.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { defineCommand } from './_kit.js';
import { chain } from './_net.js';
import { runDownloadCommand } from '../commands/_download.js';
import { statusOf } from '../downloaders/verified.js';
import { PLATFORMS, health, isDisabled, setDisabled, assertPublicHost, pageMeta } from '../downloaders/platforms.js';

const CAT = 'Downloaders';
const reg = async () => (await import('../handlers/commandHandler.js')).registry;
const dl = (p) => {
  const c = defineCommand(CAT, { name: p.name, description: `Download public ${p.label} ${p.audio ? 'audio/video' : 'media'} from a link`, usage: `${p.name} <public ${p.label} link>`, fn: () => '', tests: [['', null, () => true]] });
  c.image = true; c.platform = p.name;
  c.run = async (ctx) => {
    if (!ctx.args?.length) return ctx.reply(`Usage: /${p.name} <public ${p.label} link>\nPublic posts only. No private, login-only or paid content.`);
    if (isDisabled(p.name)) return ctx.reply(`${p.label} downloads are switched off right now.`);
    return runDownloadCommand(ctx, { expect: p.name, kind: 'video', label: p.name });
  };
  return c;
};

// ---------- info platforms (public JSON APIs, primary + fallback) ----------
const E = [];
const info = (name, label, usage, fn, tests = [['', null, (o) => /^Usage|Could not/.test(o)]], extra = {}) => E.push({ name, description: `Public ${label} details from a link`, usage, minArgs: 1, fn, tests, web: true, ...extra });
const n = (x) => (x == null ? '?' : Number(x).toLocaleString('en-IN'));
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const url0 = (a) => { let u; try { u = new URL(String(a[0]).trim()); } catch { throw new Error('send a full https link'); } if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('send a public https link'); return u; };
const host = async (u) => { await assertPublicHost(u); return u; };

info('mastodon', 'Mastodon', 'mastodon <post or @user@server link>', async (a) => {
  const raw = String(a[0]); const acct = /^@?([\w.-]+)@([\w.-]+\.[a-z]{2,})$/i.exec(raw);
  const u = acct ? new URL(`https://${acct[2]}/@${acct[1]}`) : url0(a);
  await host(u); const base = `https://${u.hostname}`; const id = /\/(?:@[\w.-]+|users\/[\w.-]+\/statuses)\/(\d+)/.exec(u.pathname)?.[1];
  if (id) {
    return chain([
      { id: 'mastodon-api', url: `${base}/api/v1/statuses/${id}`, parse: (s) => `${s.account?.display_name || s.account?.acct} (@${s.account?.acct})\n${strip(s.content).slice(0, 900) || '(no text)'}\nReplies ${n(s.replies_count)} | Boosts ${n(s.reblogs_count)} | Likes ${n(s.favourites_count)}${s.media_attachments?.length ? `\nMedia: ${s.media_attachments.map((x) => x.url).slice(0, 3).join('\n')}` : ''}\n${s.created_at?.slice(0, 10) || ''}` },
      { id: 'mastodon-oembed', url: `${base}/api/oembed?url=${encodeURIComponent(u.href)}`, parse: (j) => `${j.author_name || ''}\n${strip(j.html).slice(0, 900)}` },
    ], { key: `masto:${u.hostname}:${id}` });
  }
  const user = /^\/@([\w.-]+)\/?$/.exec(u.pathname)?.[1]; if (!user) throw new Error('send a post link or @user@server');
  return chain([{ id: 'mastodon-lookup', url: `${base}/api/v1/accounts/lookup?acct=${user}`, parse: (s) => `${s.display_name || s.acct} (@${s.acct})\n${strip(s.note).slice(0, 500)}\nFollowers ${n(s.followers_count)} | Following ${n(s.following_count)} | Posts ${n(s.statuses_count)}\n${s.url}` },
    { id: 'mastodon-search', url: `${base}/api/v2/search?q=${encodeURIComponent('@' + user)}&type=accounts&limit=1`, parse: (j) => { const s = j.accounts?.[0]; return s && `${s.display_name || s.acct} (@${s.acct})\nFollowers ${n(s.followers_count)} | Posts ${n(s.statuses_count)}\n${s.url}`; } }], { key: `mastou:${u.hostname}:${user}` });
});
info('pixelfed', 'Pixelfed', 'pixelfed <post link>', async (a) => {
  const u = await host(url0(a)); const id = /\/p\/(?:[\w.-]+\/)?(\d{5,})\/?$/.exec(u.pathname)?.[1] || /\/i\/web\/post\/(\d+)/.exec(u.pathname)?.[1]; if (!id) throw new Error('send a link to one public post');
  const base = `https://${u.hostname}`;
  return chain([{ id: 'pixelfed-api', url: `${base}/api/v1/statuses/${id}`, parse: (s) => `${s.account?.display_name || s.account?.username} (@${s.account?.acct})\n${strip(s.content).slice(0, 700) || '(no caption)'}\nLikes ${n(s.favourites_count)} | Replies ${n(s.replies_count)}${s.media_attachments?.length ? `\nPhoto: ${s.media_attachments[0].url}` : ''}` },
    { id: 'pixelfed-page', run: async () => pageMeta(u.href), parse: (m) => m.title && `${m.title}\n${(m.desc || '').slice(0, 400)}\nPhoto: ${m.image || 'none'}` }], { key: `pf:${u.hostname}:${id}` });
});
info('lemmy', 'Lemmy', 'lemmy <post link>', async (a) => {
  const u = await host(url0(a)); const id = /\/post\/(\d+)/.exec(u.pathname)?.[1]; if (!id) throw new Error('send a link like https://server/post/123');
  const base = `https://${u.hostname}`;
  return chain([{ id: 'lemmy-v3', url: `${base}/api/v3/post?id=${id}`, parse: (j) => { const p = j.post_view; return p && `${p.post.name}\nin ${p.community.name}@${new URL(p.community.actor_id).hostname} by ${p.creator.name}\nScore ${n(p.counts.score)} | Comments ${n(p.counts.comments)}${p.post.url ? `\nLink: ${p.post.url}` : ''}${p.post.body ? `\n${p.post.body.slice(0, 500)}` : ''}`; } },
    { id: 'lemmy-v4', url: `${base}/api/v4/post?id=${id}`, parse: (j) => { const p = j.post_view; return p && `${p.post.name}\nScore ${n(p.counts?.score)} | Comments ${n(p.counts?.comments)}`; } }], { key: `lemmy:${u.hostname}:${id}` });
});
info('hackernews', 'Hacker News', 'hackernews <item link or id>', async (a) => {
  const id = /(?:id=)?(\d{1,10})\b/.exec(String(a[0]))?.[1]; if (!id || (/^https?:/.test(a[0]) && !/^https:\/\/news\.ycombinator\.com\//.test(a[0]))) throw new Error('send a news.ycombinator.com item link or numeric id');
  return chain([{ id: 'hn-firebase', url: `https://hacker-news.firebaseio.com/v0/item/${id}.json`, parse: (s) => s && !s.deleted && `${s.title || strip(s.text).slice(0, 200)}\nby ${s.by} | ${s.score != null ? `${n(s.score)} points | ` : ''}${n(s.descendants ?? s.kids?.length)} comments${s.url ? `\n${s.url}` : ''}\nhttps://news.ycombinator.com/item?id=${id}` },
    { id: 'hn-algolia', url: `https://hn.algolia.com/api/v1/items/${id}`, parse: (s) => s && `${s.title || strip(s.text).slice(0, 200)}\nby ${s.author} | ${s.points != null ? `${n(s.points)} points | ` : ''}${n((s.children || []).length)} top-level replies${s.url ? `\n${s.url}` : ''}` }], { key: `hn:${id}` });
}, [['1', null, (o) => typeof o === 'string' && o.length > 0]]);
info('gitlab', 'GitLab', 'gitlab <project link or user>', async (a) => {
  const p = String(a[0]).trim().replace(/^https:\/\/(?:www\.)?gitlab\.com\//, '').replace(/\/(-\/.*)?$/, '').replace(/\.git$/, '');
  if (!/^[\w.-]+(?:\/[\w.-]+){0,4}$/.test(p) || /^https?:/.test(p)) throw new Error('send a gitlab.com project or user link');
  const enc = encodeURIComponent(p);
  if (!p.includes('/')) return chain([{ id: 'gitlab-user', url: `https://gitlab.com/api/v4/users?username=${enc}`, parse: (j) => j[0] && `${j[0].name} (@${j[0].username})\nState: ${j[0].state}\n${j[0].web_url}` }, { id: 'gitlab-group', url: `https://gitlab.com/api/v4/groups/${enc}`, parse: (g) => g.full_path && `${g.name} (group ${g.full_path})\n${(g.description || '').slice(0, 300)}\n${g.web_url}` }], { key: `gl:u:${p}` });
  return chain([{ id: 'gitlab-api', url: `https://gitlab.com/api/v4/projects/${enc}`, parse: (r) => `${r.path_with_namespace}\n${r.description || '(no description)'}\nStars ${n(r.star_count)} | Forks ${n(r.forks_count)} | Last activity ${String(r.last_activity_at).slice(0, 10)}\n${r.web_url}` },
    { id: 'gitlab-search', url: `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(p.split('/').pop())}&per_page=1`, parse: (j) => j[0] && `${j[0].path_with_namespace}\n${j[0].description || ''}\nStars ${n(j[0].star_count)}\n${j[0].web_url}` }], { key: `gl:${p}` });
});
const se = (name, label, siteOf) => info(name, label, `${name} <question link>`, async (a) => {
  const u = await host(url0(a)); const site = siteOf(u); const id = /\/(?:questions|q|a)\/(\d+)/.exec(u.pathname)?.[1]; if (!site || !id) throw new Error('send a link to one question');
  return chain([{ id: 'se-api', url: `https://api.stackexchange.com/2.3/questions/${id}?site=${site}`, parse: (j) => { const q = j.items?.[0]; return q && `${strip(q.title)}\nScore ${n(q.score)} | Answers ${n(q.answer_count)} | Views ${n(q.view_count)} | ${q.is_answered ? 'answered' : 'unanswered'}\nTags: ${(q.tags || []).join(', ')}\n${q.link}`; } },
    { id: 'se-page', run: async () => pageMeta(u.href), parse: (m) => m.title && `${m.title}\n${u.href}` }], { key: `se:${site}:${id}` });
});
se('stackoverflow', 'StackOverflow', (u) => (/(^|\.)stackoverflow\.com$/.test(u.hostname) ? 'stackoverflow' : null));
se('stackexchange', 'StackExchange', (u) => { const m = /^(?:([\w-]+)\.)?stackexchange\.com$/.exec(u.hostname); return m ? (m[1] || 'stackexchange') : (/(^|\.)(superuser|serverfault|askubuntu|mathoverflow)\.(com|net)$/.exec(u.hostname)?.[2] || null); });
info('roblox', 'Roblox', 'roblox <profile or game link>', async (a) => {
  const u = url0(a); if (!/(^|\.)roblox\.com$/.test(u.hostname)) throw new Error('send a roblox.com link');
  const uid = /\/users\/(\d+)/.exec(u.pathname)?.[1]; const gid = /\/games\/(\d+)/.exec(u.pathname)?.[1];
  if (uid) return chain(['users.roblox.com', 'users.roproxy.com'].map((h) => ({ id: `roblox-${h}`, url: `https://${h}/v1/users/${uid}`, parse: (r) => r.name && `${r.displayName} (@${r.name})${r.isBanned ? ' [banned]' : ''}\n${(r.description || '').slice(0, 300)}\nJoined ${String(r.created).slice(0, 10)}\nhttps://www.roblox.com/users/${uid}/profile` })), { key: `rb:u:${uid}` });
  if (gid) return chain(['apis.roblox.com', 'apis.roproxy.com'].map((h) => ({ id: `roblox-game-${h}`, run: async (g) => { const uni = await g(`https://${h}/universes/v1/places/${gid}/universe`); const gh = h.replace('apis', 'games'); return g(`https://${gh}/v1/games?universeIds=${uni.universeId}`); }, parse: (j) => { const x = j.data?.[0]; return x && `${x.name}\nPlaying ${n(x.playing)} | Visits ${n(x.visits)} | Favorites ${n(x.favoritedCount)}\nCreator: ${x.creator?.name}\n${(x.description || '').slice(0, 300)}`; } })), { key: `rb:g:${gid}` });
  throw new Error('send a link like roblox.com/users/ID/profile or roblox.com/games/ID');
});
info('discourse', 'Discourse', 'discourse <topic link>', async (a) => {
  const u = await host(url0(a)); const m = /\/t\/(?:[^/]+\/)?(\d+)/.exec(u.pathname); if (!m) throw new Error('send a link like https://forum/t/topic-slug/123');
  const base = `https://${u.hostname}`;
  return chain([{ id: 'discourse-json', url: `${base}/t/${m[1]}.json`, parse: (t) => t.title && `${t.title}\nPosts ${n(t.posts_count)} | Views ${n(t.views)} | Likes ${n(t.like_count)}\nTags: ${(t.tags || []).map((x) => x.name || x).join(', ') || 'none'}\n${base}/t/${m[1]}` },
    { id: 'discourse-og', run: async () => pageMeta(`${base}/t/${m[1]}`), parse: (x) => x.title && `${x.title}\n${base}/t/${m[1]}` }], { key: `dc:${u.hostname}:${m[1]}` });
});

// ---------- admin: health, backups, rollback (owner only) ----------
const DIRB = path.resolve('data/backups/platforms');
const SRC = ['src/downloaders/platforms.js', 'src/downloaders/index.js', 'src/downloaders/social.js', 'src/packs/x_platforms.js', 'src/commands/_download.js'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const sh = (cmd, args) => new Promise((r) => execFile(cmd, args, { timeout: 8000 }, (e, o) => r(e ? 'unknown' : String(o).trim().split('\n')[0])));
export async function snapshot(label = 'manual') {
  const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + crypto.randomBytes(2).toString('hex'); const dir = path.join(DIRB, id);
  await fs.mkdir(dir, { recursive: true }); const files = {};
  for (const f of [...SRC, 'data/platform-disabled.json', 'data/platform-health.json']) { try { const b = await fs.readFile(path.resolve(f)); await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true }); await fs.writeFile(path.join(dir, f), b); files[f] = sha(b); } catch { /* file missing */ } }
  let pkg = {}; try { pkg = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8')); } catch { /* none */ }
  const registry = (await reg()).list().map((c) => c.name).sort();
  const manifest = { id, label, at: new Date().toISOString(), node: process.version, ytdlp: await sh('yt-dlp', ['--version']), ffmpeg: (await sh('ffmpeg', ['-version'])).slice(0, 40), dependencies: pkg.dependencies || {}, platforms: PLATFORMS.map((p) => ({ name: p.name, hosts: p.hosts, yt: p.yt, og: p.og })), disabled: PLATFORMS.filter((p) => isDisabled(p.name)).map((p) => p.name), commandCount: registry.length, files };
  await fs.writeFile(path.join(dir, 'registry.json'), JSON.stringify(registry)); await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1)); // no .env, no secrets
  const all = (await fs.readdir(DIRB)).sort(); for (const old of all.slice(0, Math.max(0, all.length - 20))) await fs.rm(path.join(DIRB, old), { recursive: true, force: true });
  return manifest;
}
export async function listSnapshots() { try { return (await fs.readdir(DIRB)).sort().reverse(); } catch { return []; } }
export async function restoreSnapshot(id) {
  if (!/^[\d]{14}-[a-f0-9]{4}$/.test(id)) throw new Error('invalid snapshot id');
  const dir = path.join(DIRB, id); const man = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const pre = await snapshot('pre-restore'); const done = [];
  for (const f of Object.keys(man.files)) { const b = await fs.readFile(path.join(dir, f)); if (sha(b) !== man.files[f]) throw new Error(`snapshot file damaged: ${f}`); }
  for (const f of Object.keys(man.files)) { await fs.mkdir(path.dirname(path.resolve(f)), { recursive: true }); await fs.copyFile(path.join(dir, f), path.resolve(f)); done.push(f); }
  return { restored: done.length, before: pre.id, restartNeeded: done.some((f) => f.startsWith('src/')) };
}
export async function verifyModules() {
  const bad = [];
  for (const f of ['../downloaders/platforms.js', '../downloaders/index.js']) { try { await import(`${f}?v=${Date.now()}`); } catch (e) { bad.push(`${f}: ${e.message.slice(0, 80)}`); } }
  return bad;
}
export function healthRows() {
  return PLATFORMS.map((p) => {
    const h = health.get(p.name) || {}; const off = isDisabled(p.name);
    const prim = p.yt ? h.ytLast : h.ogLast; const back = p.yt ? (p.og ? h.ogLast : null) : (p.oembed ? 'ok' : null);
    const st = off ? 'OFFLINE' : (h.failures || 0) >= 3 && (!h.lastOk || h.lastFail > h.lastOk) ? 'OFFLINE' : 'ONLINE';
    const d = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) : 'never');
    return { name: p.label, status: st, primary: prim === 'fail' ? 'FAILED' : 'WORKING', backup: p.yt || p.oembed ? (back === 'fail' ? 'FAILED' : 'READY') : 'READY (page metadata only)', lastOk: d(h.lastOk), lastFail: d(h.lastFail), failures: h.failures || 0 };
  });
}
const ADM = [];
const adm = (name, description, usage, fn, check, minArgs = 0) => ADM.push({ name, description: description + ' (owner only)', usage, minArgs, ownerOnly: true, fn, tests: [['', null, check]] });
const find = (x) => { const p = PLATFORMS.find((q) => q.name === String(x).toLowerCase()); if (!p) throw new Error('unknown platform'); return p; };
adm('platformhealth', 'Health of every social downloader', 'platformhealth [name]', async (a) => { const rows = healthRows().filter((r) => !a[0] || r.name.toLowerCase() === a[0].toLowerCase()); if (!rows.length) throw new Error('unknown platform'); return rows.map((r) => `${r.name}: ${r.status}\n  Primary ${r.primary} | Backup ${r.backup}\n  Last OK ${r.lastOk} | Last fail ${r.lastFail} | Failures ${r.failures}`).join('\n').slice(0, 3400); }, (o) => /ONLINE|Could not/.test(o));
adm('platformbackup', 'Take a versioned snapshot of social modules and config', 'platformbackup', async () => { const m = await snapshot('manual'); return `Snapshot ${m.id}\nFiles ${Object.keys(m.files).length} | Commands ${m.commandCount} | yt-dlp ${m.ytdlp} | Node ${m.node}\nNo secrets are stored in snapshots.`; }, (o) => /^Snapshot \d{14}-[a-f0-9]{4}/.test(o));
adm('platformbackups', 'List social snapshots', 'platformbackups', async () => { const l = await listSnapshots(); return l.length ? l.slice(0, 15).join('\n') : 'No snapshots yet. Use /platformbackup.'; }, (o) => o.length > 0);
adm('platformdisable', 'Switch one social downloader off (rollback step 1)', 'platformdisable <name>', async (a) => { const p = find(a[0]); setDisabled(p.name, true); return `${p.label} is OFFLINE. Other platforms are not affected. Use /platformenable ${p.name} to switch it back.`; }, (o) => /Usage|Could not/.test(o), 1);
adm('platformenable', 'Switch one social downloader back on', 'platformenable <name>', async (a) => { const p = find(a[0]); setDisabled(p.name, false); return `${p.label} is ONLINE again.`; }, (o) => /Usage|Could not/.test(o), 1);
adm('platformrestore', 'Restore social modules from a snapshot', 'platformrestore <snapshot id>', async (a, t, ctx) => { if (!ctx?.isOwner) throw new Error('only the bot owner can restore code'); const r = await restoreSnapshot(a[0]); const bad = await verifyModules(); return `Restored ${r.restored} files from ${a[0]}. Pre-restore snapshot ${r.before}.\n${r.restartNeeded ? 'Restart the bot service to load the restored code.' : 'Config restored, active now.'}\nModule check: ${bad.length ? 'FAILED ' + bad.join('; ') : 'ok'}`; }, (o) => /Usage|Could not/.test(o), 1);
adm('platformrollback', 'Guided rollback: disable one platform, restore latest snapshot, verify', 'platformrollback <name>', async (a, t, ctx) => { if (!ctx?.isOwner) throw new Error('only the bot owner can roll back code'); const p = find(a[0]); setDisabled(p.name, true); const l = (await listSnapshots())[0]; if (!l) return `1. ${p.label} disabled.\n2. No snapshot to restore. Take one with /platformbackup next time.`; const r = await restoreSnapshot(l); const bad = await verifyModules(); return `1. ${p.label} disabled.\n2. Restored ${r.restored} files from ${l}.\n3. ${r.restartNeeded ? 'Restart the bot service to load restored code.' : 'No restart needed.'}\n4. Verify: ${bad.length ? 'FAILED ' + bad.join('; ') : 'modules load ok'}. Then /platformenable ${p.name} and test a link.`; }, (o) => /Usage|Could not/.test(o), 1);

// ---------- /social: installed, working platform commands ----------
const social = defineCommand(CAT, { name: 'social', description: 'List social platform commands with their verified status', usage: 'social', fn: async () => {
  const on = PLATFORMS.filter((p) => !isDisabled(p.name)).map((p) => p.name); const infos = E.map((e) => e.name);
  const g = (st) => on.filter((n) => statusOf(n) === st).join(', ') || 'none';
  const off = healthRows().filter((r) => r.status === 'OFFLINE').map((r) => r.name);
  return `Social platform commands (send /name <public link>)\nWORKING (real download checked): ${g('WORKING')}\nPREVIEW ONLY (cover image, not the video): ${g('PREVIEW')}\nBLOCKED from the bot server (anti-bot), may fail: ${g('BLOCKED')}\nNeeds a fix (extractor or sample failed): ${g('BROKEN')}\nNot checked yet: ${g('UNTESTED')}\nInfo lookups: ${infos.join(', ')}\nAlso: instagram, facebook, twitter, youtube, pinterest, github${off.length ? `\nTemporarily offline: ${off.join(', ')}` : ''}\nPublic content only, no login or paid content.`; }, tests: [['', null, (o) => /^Social platform commands/.test(o) && /WORKING/.test(o)]] });

export const platformInfoNames = E.map((e) => e.name);
export default [...PLATFORMS.map(dl), ...E.map((e) => defineCommand(CAT, e)), ...ADM.map((e) => defineCommand('Owner', e)), social];
