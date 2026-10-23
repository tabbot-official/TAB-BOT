// Private recovery kit: generated command files + manifest + data backups in
// one zip, delivered only to the owner's own WhatsApp DM. Never published.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import config from '../config/config.js';
import { buildBackup } from './backup.js';
import { loadGenerated } from './genregistry.js';

export function buildKit() {
  const zip = new AdmZip();
  // 1) regular private data backup (already filtered: no secrets/session)
  const dataBackup = buildBackup(config.paths.data);
  zip.addFile('data-backup.zip', dataBackup.buffer);
  // 2) generated command files
  const gen = loadGenerated();
  const included = [];
  for (const e of gen) {
    const f = path.join('src', 'commands', e.name + '.js');
    try { zip.addFile('commands/' + e.name + '.js', fs.readFileSync(f)); included.push(e.name); } catch { /* missing file */ }
  }
  // 3) manifest
  let deps = {};
  try { deps = JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies || {}; } catch { /* none */ }
  const manifest = { createdAt: new Date().toISOString(), generated: gen, dependencies: deps };
  zip.addFile('recovery-manifest.json', Buffer.from(JSON.stringify(manifest, null, 1)));
  zip.addFile('README.txt', Buffer.from(
    'Tab private recovery kit, ' + manifest.createdAt + '\n' +
    'Contains: generated commands (' + included.join(', ') + 'none'.slice(included.length ? 4 : 0) + '), manifest with package versions, and a data backup zip.\n' +
    'Keep it private. Restore: send this zip back to Tab quoted with "/agent restore".\n' +
    'After a FULL server wipe the base bot must be redeployed first - this kit cannot start the bot by itself.\n'));
  return { buffer: zip.toBuffer(), count: included.length };
}

/** Extract an uploaded kit zip into a staging dir. Returns {dir, manifest} or throws. */
export function unpackKit(buffer) {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('recovery-manifest.json');
  if (!manifestEntry) throw new Error('not a Tab recovery kit (no manifest)');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  const dir = path.join('data', 'restore-staging');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    if (!/^(commands\/[\w-]+\.js|data-backup\.zip|recovery-manifest\.json)$/.test(name)) continue;
    if (name === 'data-backup.zip' || name === 'recovery-manifest.json') {
      fs.writeFileSync(path.join(dir, name.replace(/\//g, '_')), entry.getData());
    } else {
      fs.writeFileSync(path.join(dir, name.replace('commands/', 'cmd_')), entry.getData());
    }
  }
  return { dir, manifest };
}
