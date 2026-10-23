import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { publicAiEnhance, publicAiAvailable } from '../src/services/publicEnhance.js';

async function sample() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pe-'));
  const file = path.join(dir, 'in.png');
  await sharp({ create: { width: 64, height: 48, channels: 3, background: '#789' } }).png().toFile(file);
  return { dir, file };
}

test('public AI enhance rejects when the service errors, so callers can fall back', async () => {
  const { dir, file } = await sample();
  await assert.rejects(publicAiEnhance(file, dir, { request: async () => { throw new Error('boom'); } }));
});

test('public AI enhance refuses result URLs on another host', async () => {
  const { dir, file } = await sample();
  const { Readable } = await import('node:stream');
  const request = async (o) => {
    if (o.url.endsWith('/upload')) return { data: ['/tmp/x.jpg'] };
    if (o.url.endsWith('/queue/join')) return { data: {} };
    if (o.url.endsWith('/queue/data')) return { data: Readable.from([`data: ${JSON.stringify({ msg: 'process_completed', success: true, output: { data: [{ url: 'https://evil.example/x.jpg' }] } })}\n\n`]) };
    throw new Error('unexpected');
  };
  await assert.rejects(publicAiEnhance(file, dir, { request }), /unexpected result host/);
});

test('public AI can be switched off and is capped per hour', () => {
  assert.equal(publicAiAvailable({ PUBLIC_AI_ENHANCE: 'false' }), false);
  assert.equal(publicAiAvailable({}), true);
});
