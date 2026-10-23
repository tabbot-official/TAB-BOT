// P5 Voice Mode: ask Tab a question and get the answer as a voice note.
// /vask <question>            -> text question in, voice answer out
// /vask (reply to voice note) -> transcribe the voice note, then voice-answer it
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { askAi } from '../ai/providers.js';
import { speak, rateCheck, TtsError } from '../tts/index.js';
import { findAudio, toWav } from './stt.js';
import { makeLimiter, transcribeAudio } from '../services/publicAi.js';
import { createJobDir, removeJobDir } from '../utils/fileManager.js';
import { downloadQueue } from '../utils/downloader.js';

const sttLimiter = makeLimiter('VASKSTT', 'STT_PER_HOUR', 40);
const MAX_SECONDS = 120, MAX_BYTES = 8 * 1048576, MAX_ANSWER = 450;

async function voiceAnswer(ctx, question, note) {
  const live = await ctx.reply('🎙️ ' + note).catch(() => null);
  const r = await askAi(question.slice(0, 2000), { allowKeyless: true, temperature: 0.4, systemSuffix: 'Answer briefly - at most 3 short sentences, plain spoken English, no markdown, no emoji.' });
  const answer = String(r?.text || r || '').trim();
  if (!answer) {
    if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, { text: 'I could not find an answer. Try asking again.', edit: live.key }); return; } catch {} }
    return ctx.reply('I could not find an answer. Try asking again.');
  }
  const short = answer.slice(0, MAX_ANSWER);
  try {
    await ctx.sock.sendPresenceUpdate?.('recording', ctx.jid).catch(() => {});
    const out = await speak({ text: short });
    await ctx.sock.sendMessage(ctx.jid, { audio: out.buf, mimetype: out.mimetype, ptt: out.ptt }, { quoted: ctx.msg });
    if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, { text: '🎙️ ' + short, edit: live.key }); } catch {} }
    logger.info(`[vask] voice answer sent via ${out.provider}`);
  } catch (err) {
    logger.warn('[vask] tts failed: ' + (err?.message || 'error'));
    // Fall back to text so the user still gets the answer.
    if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, { text: short, edit: live.key }); return; } catch {} }
    await ctx.reply(short);
  } finally {
    await ctx.sock.sendPresenceUpdate?.('paused', ctx.jid).catch(() => {});
  }
}

export default {
  name: 'vask',
  aliases: ['v'],
  category: 'AI',
  description: 'Ask by voice, get a voice answer (or reply to a voice note)',
  usage: 'vask <question> | vask (reply to a voice note)',
  async run(ctx) {
    if (!featOn('voice')) return ctx.reply('Voice mode is turned off right now.');
    if (!ctx.isOwner) {
      const wait = rateCheck('vask:' + ctx.sender);
      if (wait) return ctx.reply(`Slow down a little. Try again in ${wait}s.`);
    }
    const question = ctx.args.join(' ').trim();
    if (question) return voiceAnswer(ctx, question, 'Listening...');
    // No text: look for a replied-to voice note.
    const a = findAudio(ctx.msg);
    if (!a) return ctx.reply('Ask me something after ' + config.prefix + 'vask, or reply to a voice note with ' + config.prefix + 'vask.');
    if (Number(a.node.fileLength) > MAX_BYTES) return ctx.reply('That voice note is too big (max 8MB).');
    if (Number(a.node.seconds) > 600) return ctx.reply('That voice note is too long (max 2 minutes).');
    if (!sttLimiter.ok()) return ctx.reply('Voice understanding is busy right now. Try again in a minute.');
    let dir;
    try {
      dir = await createJobDir();
      const inp = path.join(dir, 'in.audio'), wav = path.join(dir, 'a.wav');
      const buf = await downloadMediaMessage(a.message, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
      if (!buf?.length || buf.length > MAX_BYTES) return ctx.reply('That voice note is too big (max 8MB).');
      await fs.writeFile(inp, buf);
      try { await toWav(inp, wav); } catch { return ctx.reply('Could not read that voice note.'); }
      let text;
      const wavBuf = await fs.readFile(wav);
      try { text = await sttLimiter.run(() => transcribeAudio(wavBuf, { timeoutMs: 60000 })); }
      catch (e) { logger.warn('vask stt failed: ' + (e?.message || 'error')); return ctx.reply('I could not understand that voice note (free service busy). Try again in a minute.'); }
      if (!text) return ctx.reply('I heard no speech in that voice note.');
      await voiceAnswer(ctx, text, 'You said: "' + text.slice(0, 200) + '" - thinking...');
    } catch (e) {
      logger.warn('vask error: ' + (e?.message || 'error'));
      await ctx.reply('Voice mode failed. Try again in a moment.');
    } finally {
      await removeJobDir(dir);
    }
  },
};
