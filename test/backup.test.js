import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { backupFiles, buildBackup } from '../src/utils/backup.js';
test('includes plain json data, excludes secrets and recovered messages', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  for (const f of ['db.json', 'autoreply.json', 'api-keys.json', 'token.json', 'install-id', '.hidden.json', 'notes.txt']) fs.writeFileSync(path.join(d, f), '{}');
  fs.mkdirSync(path.join(d, 'recover'));
  assert.deepEqual(backupFiles(d), ['autoreply.json', 'db.json']);
  const { buffer } = buildBackup(d);
  const names = new AdmZip(buffer).getEntries().map((e) => e.entryName).sort();
  assert.deepEqual(names, ['README.txt', 'autoreply.json', 'db.json']);
});
test('missing folder gives empty list', () => { assert.deepEqual(backupFiles('/nope/x'), []); });
