// Tab: hosting-panel launcher (KataBump / Pterodactyl). Set the panel's start file to tab-start.cjs.
// Installs dependencies on first start (or after package.json changes), then runs the bot with a heap cap
// that fits small free servers. TAB_HEAP_MB overrides the cap (default 200 MB).
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
process.chdir(__dirname);
const stamp = path.join('node_modules', '.tab-installed');
let need = !fs.existsSync(stamp);
try { if (!need) need = fs.statSync(stamp).mtimeMs < fs.statSync('package.json').mtimeMs; } catch { need = true; }
if (need) {
  const cache = path.join(require('node:os').tmpdir(), 'tab-npm-cache');
  console.log('[tab-start] Installing packages (first start takes a few minutes)...');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { stdio: 'inherit', env: { ...process.env, npm_config_cache: cache } });
  fs.rmSync(cache, { recursive: true, force: true });
  if (r.status !== 0) { console.error('[tab-start] npm install failed (exit ' + r.status + ').'); process.exit(1); }
  fs.writeFileSync(stamp, new Date().toISOString());
  console.log('[tab-start] Packages installed.');
}
const heap = String(process.env.TAB_HEAP_MB || '200').replace(/\D/g, '') || '200';
// Young-generation cap: on Node 24 the default semi-space added ~50 MB of RSS at boot (253 -> 200 MB measured
// 2026-10-23, same code, QR screen). TAB_SEMI_MB overrides (default 8; 0 = Node's default).
const semi = String(process.env.TAB_SEMI_MB ?? '8').replace(/\D/g, '');
const child = spawn(process.execPath, ['--max-old-space-size=' + heap, ...(semi && semi !== '0' ? ['--max-semi-space-size=' + semi] : []), 'scripts/runner.js'], { stdio: 'inherit' });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
