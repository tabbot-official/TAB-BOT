import {downloadMediaMessage} from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {createJobDir, removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {findAudio} from './stt.js';
import {resolveEffect, groupList, applyEffect, runFfmpeg, parseCustom, customFilter, COUNT, GROUPS, EFFECTS} from '../fun/voicefx.js';

const BASE = ['voicechanger', 'vc', 'voicefx', 'changevoice'];
// Every effect name (and its aliases) is also a direct command: /chipmunk, /bitcrush ...
const DIRECT = [...new Set(Object.entries(EFFECTS).flatMap(([k, v]) => [k, ...v.aliases]))];

const stamps = new Map();
const MAX_BYTES = 40 * 1048576;
const MAX_SECONDS = 30 * 60;
export default {
  name: 'voicechanger', aliases: ['vc', 'voicefx', 'changevoice', ...DIRECT], category: 'Voice Change',
  description: COUNT + ' voice effects + custom mode (reply to a voice note)',
  usage: 'voicechanger <effect|number|custom pitch=5 speed=1.2 echo=0.5> (reply to a voice note)',
  async run(ctx) {
    const p = config.prefix;
    const direct = ctx.commandName && !BASE.includes(ctx.commandName) && resolveEffect(ctx.commandName);
    const first = direct || String(ctx.args[0] || '').toLowerCase();
    if (!first || first === 'list' || first === 'effects' || first === 'help') {
      const g = ctx.args[1];
      const body = groupList(g);
      if (!body) return ctx.reply('No such group. Groups: ' + GROUPS.map((x) => x.group).join(', '));
      return ctx.reply('🎙️ *Voice changer* (' + COUNT + ' effects)\nReply to a voice note with ' + p + 'voicechanger <name or number>\nCustom: ' + p + 'voicechanger custom pitch=5 speed=1.2 echo=0.5 bass=3 [reverse] [robot] [crush=6]\n(pitch -12..12 semitones, speed 0.5..3, echo 0..1, bass -10..10, crush 4..16)\n\n' + body);
    }
    let effect = null, filter = null;
    if (first === 'custom') {
      const c = parseCustom(ctx.args.slice(1));
      if (c.error) return ctx.reply('Custom mode: ' + c.error + '.\nExample: ' + p + 'voicechanger custom pitch=5 speed=1.2 echo=0.5');
      filter = customFilter(c.opts); effect = 'custom';
    } else {
      effect = resolveEffect(first);
      if (!effect) return ctx.reply('Unknown effect "' + first.slice(0, 30) + '". See the list with ' + p + 'voicechanger list');
    }
    const a = findAudio(ctx.msg);
    if (!a) return ctx.reply('Reply to a voice note or audio with ' + p + 'voicechanger ' + effect);
    if (Number(a.node.fileLength) > MAX_BYTES) return ctx.reply('Audio is too big (max 40MB).');
    if (Number(a.node.seconds) > MAX_SECONDS) return ctx.reply('Audio is too long (max 30 minutes).');
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 60000);
    if (mine.length >= 3) return ctx.reply('Limit: 3 voice changes per minute. Try again shortly.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    let dir;
    try {
      await downloadQueue.add(ctx.sender, async () => {
        dir = await createJobDir();
        const inp = path.join(dir, 'in.audio'), out = path.join(dir, 'out.ogg');
        const buf = await downloadMediaMessage(a.message, 'buffer', {}, {logger, reuploadRequest: ctx.sock.updateMediaMessage});
        if (!buf?.length || buf.length > MAX_BYTES) return ctx.reply('Audio is too big (max 40MB).');
        await fs.writeFile(inp, buf);
        try { const secs = Math.max(1, Math.min(MAX_SECONDS, Number(a.node.seconds) || 60)); const fo = {ffmpeg: config.tools?.ffmpeg || 'ffmpeg', maxSeconds: MAX_SECONDS, timeoutMs: Math.min(25 * 60000, 60000 + secs * 1000)}; if (filter) await runFfmpeg(inp, out, filter, fo); else await applyEffect(inp, out, effect, fo); }
        catch (e) { logger.warn('voicechanger failed: ' + (e?.message || 'error')); return ctx.reply('Could not read or change that audio.'); }
        await ctx.sock.sendMessage(ctx.jid, {audio: await fs.readFile(out), mimetype: 'audio/ogg; codecs=opus', ptt: true}, {quoted: ctx.msg});
      });
    } catch (e) { logger.warn('voicechanger error: ' + (e?.message || 'error')); await ctx.reply('Voice changer failed.'); }
    finally { await removeJobDir(dir); }
  },
};
