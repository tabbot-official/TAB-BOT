// Offline panel preflight. Never connects WhatsApp or calls media/AI providers.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const failures=[];
if(Number(process.versions.node.split('.')[0])<20) failures.push('Node20+ required.');
for(const name of ['dotenv','@whiskeysockets/baileys','@gradio/client','axios','ffmpeg-static','sharp']) {
  try { const m=await import(name); if(name==='sharp')await m.default({create:{width:2,height:2,channels:3,background:'blue'}}).png().toBuffer(); }
  catch { failures.push(name+' unavailable. Run npm ci on this host.'); }
}
let config;
try { config=(await import('../src/config/config.js')).default; }
catch { failures.push('Config cannot load. Check dependencies and .env.'); }
if(config) {
 const ff=spawnSync(config.tools.ffmpeg,['-version'],{encoding:'utf8',timeout:10000});
 if(ff.status!==0)failures.push('ffmpeg cannot run. Install it and set FFMPEG_PATH.');
}
try { await fs.access(root,fs.constants.W_OK); }catch{failures.push('Repository folder is not writable.');}
if(failures.length){for(const line of failures)console.error('[panel] '+line);process.exitCode=1;}
else {console.log('[panel] PASS: Node'+process.versions.node+', imports, Sharp, ffmpeg, writable project. No WhatsApp connection attempted.');console.log('[panel] Keep .env/auth/data private and persistent; one active bot per auth directory. Provider keys and host limits still apply.');}
