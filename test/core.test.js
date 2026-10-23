import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseCommand } from '../src/handlers/commandHandler.js';
import { canonicalUrl } from '../src/downloaders/youtube.js';
import { pickMedia } from '../src/downloaders/pinterest.js';
import { detectPlatform } from '../src/downloaders/index.js';
import { safeFileName, isInside } from '../src/utils/fileManager.js';
import { DownloadQueue, classifyYtDlpError } from '../src/utils/downloader.js';
import { extractText, classify } from '../src/handlers/messageHandler.js';

test('parseCommand', () => {
  assert.deepEqual(parseCommand('/ytvideo https://x.y'), { name: 'ytvideo', args: ['https://x.y'] });
  assert.equal(parseCommand('hello'), null);
  assert.equal(parseCommand('/'), null);
  assert.equal(parseCommand('/ ; rm -rf'), null);
  assert.equal(parseCommand('/a$(id)'), null);
});

test('youtube canonicalUrl', () => {
  const c = (u) => canonicalUrl(new URL(u));
  assert.equal(c('https://youtu.be/jNQXAC9IVRw?t=3'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.equal(c('https://www.youtube.com/shorts/jNQXAC9IVRw'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.equal(c('https://m.youtube.com/watch?v=jNQXAC9IVRw&list=x'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.equal(c('https://www.youtube.com/watch?v=bad'), null);
  assert.equal(c('https://www.youtube.com/watch?v=--exec%20id'), null);
});

test('platform routing and rejection', () => {
  assert.equal(detectPlatform('https://www.pinterest.com/pin/123456/').downloader.name, 'pinterest');
  assert.equal(detectPlatform('https://pin.it/abc').downloader.name, 'pinterest');
  assert.equal(detectPlatform('https://music.youtube.com/watch?v=jNQXAC9IVRw').downloader.name, 'youtube');
  assert.equal(detectPlatform('https://evil.com/youtube.com').downloader, null);
  assert.equal(detectPlatform('https://youtube.com.evil.com/').downloader, null);
  assert.equal(detectPlatform('file:///etc/passwd').url, null);
  assert.equal(detectPlatform('ftp://youtube.com/').url, null);
});

test('pinterest pickMedia', () => {
  assert.deepEqual(pickMedia({ images: { orig: { url: 'https://i.pinimg.com/a.jpg' } } }), { kind: 'image', url: 'https://i.pinimg.com/a.jpg' });
  const v = pickMedia({ videos: { video_list: { V_HLSV3: { url: 'https://v.pinimg.com/x.m3u8' }, V_720P: { url: 'https://v.pinimg.com/x.mp4', height: 720 }, V_480P: { url: 'https://v.pinimg.com/y.mp4', height: 480 } } } });
  assert.deepEqual(v, { kind: 'video', url: 'https://v.pinimg.com/x.mp4' });
  assert.equal(pickMedia({}), null);
});

test('file safety', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'etcpasswd');
  assert.equal(safeFileName(''), 'file');
  assert.equal(isInside('/tmp/a', '/tmp/a/b'), true);
  assert.equal(isInside('/tmp/a', '/tmp/a'), false);
  assert.equal(isInside('/tmp/a', '/tmp/ab'), false);
  assert.equal(isInside('/tmp/a', path.join('/tmp/a', '..', 'x')), false);
});

test('queue limits concurrency and per-user jobs', async () => {
  const q = new DownloadQueue({ concurrency: 1, maxQueue: 2, maxPerUser: 2 });
  let active = 0, peak = 0;
  const task = async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 20)); active--; };
  const a = q.add('u1', task), b = q.add('u1', task);
  assert.throws(() => q.add('u1', task), /already have/);
  const c = q.add('u2', task);
  assert.throws(() => q.add('u3', task), /queue is full/);
  await Promise.all([a, b, c]);
  assert.equal(peak, 1);
  assert.deepEqual(q.stats, { running: 0, waiting: 0 });
});

test('error classification', () => {
  assert.equal(classifyYtDlpError('ERROR: Private video. Sign in'), 'PRIVATE');
  assert.equal(classifyYtDlpError('This video is unavailable'), 'UNAVAILABLE');
  assert.equal(classifyYtDlpError('weird'), 'FAILED');
});

test('message helpers', () => {
  assert.equal(extractText({ extendedTextMessage: { text: ' /ping ' } }), '/ping');
  assert.equal(extractText({ ephemeralMessage: { message: { conversation: '/menu' } } }), '/menu');
  assert.equal(classify({ key: { remoteJid: 'status@broadcast' } }), 'status');
  assert.equal(classify({ key: { remoteJid: '1@g.us' } }), 'group');
  assert.equal(classify({ key: { remoteJid: '1@s.whatsapp.net', fromMe: true } }), 'self');
  assert.equal(classify({ key: { remoteJid: '1@s.whatsapp.net' } }), 'private');
});
