// Coarse hosting-environment detection for the install ping. Returns ONE value from a fixed list, never a hostname, path, IP or env value.
import fs from 'node:fs';

export const ENVS = ['pterodactyl', 'replit', 'codespaces', 'gitpod', 'heroku', 'railway', 'render', 'fly', 'koyeb', 'aws', 'oracle', 'termux', 'docker', 'windows', 'macos', 'linux', 'unknown'];
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim().slice(0, 80); } catch { return ''; } };

export function detectEnv(env = process.env, platform = process.platform, readFn = read, exists = fs.existsSync) {
  const has = (...k) => k.some((x) => env[x]);
  if (has('P_SERVER_UUID', 'P_SERVER_LOCATION') || (has('STARTUP') && has('SERVER_IP', 'SERVER_PORT'))) return 'pterodactyl'; // Katabump, HeavenCloud, Daki and similar panels
  if (has('REPL_ID', 'REPLIT_DB_URL')) return 'replit';
  if (has('CODESPACES')) return 'codespaces';
  if (has('GITPOD_WORKSPACE_ID')) return 'gitpod';
  if (has('DYNO')) return 'heroku';
  if (has('RAILWAY_ENVIRONMENT', 'RAILWAY_PROJECT_ID')) return 'railway';
  if (has('RENDER')) return 'render';
  if (has('FLY_APP_NAME')) return 'fly';
  if (has('KOYEB_APP_NAME')) return 'koyeb';
  if (String(env.PREFIX || '').includes('com.termux')) return 'termux';
  if (platform === 'linux') {
    const vendor = readFn('/sys/class/dmi/id/sys_vendor').toLowerCase(); const tag = readFn('/sys/class/dmi/id/chassis_asset_tag').toLowerCase();
    if (has('AWS_EXECUTION_ENV') || vendor.includes('amazon')) return 'aws';
    if (tag.includes('oraclecloud')) return 'oracle';
    if (exists('/.dockerenv')) return 'docker';
    return 'linux';
  }
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'unknown';
}
