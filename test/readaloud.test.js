import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkText, pdfToText} from '../src/readaloud/index.js';
import PDFDocument from 'pdfkit';
test('chunks stay under limit and keep sentences', () => {
  const t = 'Hello world. '.repeat(100) + 'X'.repeat(900);
  const c = chunkText(t, 200);
  assert.ok(c.length > 5); assert.ok(c.every((x) => x.length <= 200)); assert.ok(c[0].startsWith('Hello world.'));
  assert.deepEqual(chunkText('   '), []);
});
test('pdf text extraction', async () => {
  const d = new PDFDocument(); const bufs = []; d.on('data', (b) => bufs.push(b));
  d.text('Hello reader. Second line.'); d.end();
  await new Promise((r) => d.on('end', r));
  const r = await pdfToText(Buffer.concat(bufs));
  assert.match(r.text, /Hello reader/); assert.equal(r.pages, 1);
});
