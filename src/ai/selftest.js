// One-time check at boot: prints only the provider/model that answered, never keys.
import { askAi, configuredProviders } from './providers.js';
const ids = configuredProviders().map((p) => p.id).join(',') || 'none';
console.log(`[tab] ai providers with keys: ${ids}`);
try {
  const r = await askAi('Reply with exactly: ready');
  console.log(`[tab] ai selftest ok via ${r.id}/${r.model}: ${r.text.slice(0, 40).replace(/\s+/g, ' ')}`);
} catch (e) {
  console.log(`[tab] ai selftest failed: ${e.code || e.message}`);
}
try {
  const T = await import('../utils/imageTools.js');
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 80, b: 0, alpha: 1 } } }).png().toBuffer();
  const st = await T.toSticker(png, { animated: false });
  const meta = await sharp(st).metadata();
  console.log(`[tab] image selftest sticker ok ${meta.width}x${meta.height} ${meta.format}`);
  const { spawnSync } = await import('node:child_process');
  const cfg = (await import('../config/config.js')).default;
  const v = spawnSync(cfg.tools.ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1', '-pix_fmt', 'yuv420p', '/tmp/_st.mp4'], { stdio: 'ignore' });
  if (v.status !== 0) throw new Error('ffmpeg missing');
  const fs = await import('node:fs');
  const an = await T.toSticker(fs.readFileSync('/tmp/_st.mp4'), { animated: true });
  console.log(`[tab] image selftest animated ok ${Math.round(an.length / 1024)} KB`);
} catch (e) {
  console.log(`[tab] image selftest failed: ${e.message}`);
}
process.exit(0);
