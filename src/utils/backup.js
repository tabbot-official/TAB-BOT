import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

// Only plain settings/data files. Never the WhatsApp session (auth folder), keys, tokens, the install id or recovered messages.
const SKIP = /(^\.)|install-id|recover|key|token|secret|cred|session|\.tmp$/i;
export function backupFiles(dataDir) {
  let names = [];
  try { names = fs.readdirSync(dataDir, { withFileTypes: true }); } catch { return []; }
  return names.filter((d) => d.isFile() && /\.json$/i.test(d.name) && !SKIP.test(d.name)).map((d) => d.name).sort();
}
export function buildBackup(dataDir, now = new Date()) {
  const zip = new AdmZip();
  const files = backupFiles(dataDir);
  for (const f of files) zip.addFile(f, fs.readFileSync(path.join(dataDir, f)));
  zip.addFile('README.txt', Buffer.from(`Tab data backup, ${now.toISOString()}\nFiles: ${files.join(', ') || 'none'}\nRestore: stop the bot, copy these files into the data folder, start the bot.\nThis backup has no WhatsApp session, no API keys and no .env, so it cannot log anyone in.\n`));
  return { buffer: zip.toBuffer(), files };
}
