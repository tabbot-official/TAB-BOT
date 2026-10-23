// Image ops: pure sharp pipelines, used by the Image & Sticker pack and tested on a generated picture.
export const num = (a, d, lo, hi) => { const n = parseFloat(a?.[0]); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const sep = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
const tintOf = (c) => (s) => s.grayscale().tint(c);
// name -> {d: description, u: usage hint, op: (sharp pipeline, args, meta) => pipeline, out?: 'png'|'jpeg'|'webp', sticker?: true}
export const OPS = {
  grayscale: { d: 'Turn a photo black and white', op: (s) => s.grayscale() },
  sepia: { d: 'Old-photo sepia look', op: (s) => s.recomb(sep) },
  negative: { d: 'Invert the colors', op: (s) => s.negate({ alpha: false }) },
  blurimg: { d: 'Blur a photo (blurimg 1-20)', u: '[1-20]', op: (s, a) => s.blur(num(a, 6, 0.5, 20)) },
  sharpenimg: { d: 'Sharpen a photo', op: (s) => s.sharpen({ sigma: 2 }) },
  rotateright: { d: 'Rotate 90 degrees clockwise', op: (s) => s.rotate(90) },
  rotateleft: { d: 'Rotate 90 degrees counter-clockwise', op: (s) => s.rotate(270) },
  upsidedown: { d: 'Rotate 180 degrees', op: (s) => s.rotate(180) },
  mirror: { d: 'Mirror left to right', op: (s) => s.flop() },
  flipvert: { d: 'Flip top to bottom', op: (s) => s.flip() },
  brighten: { d: 'Make a photo brighter', op: (s, a) => s.modulate({ brightness: num(a, 1.3, 1, 3) }) },
  darken: { d: 'Make a photo darker', op: (s, a) => s.modulate({ brightness: 1 / num(a, 1.4, 1, 3) }) },
  saturate: { d: 'Boost the colors', op: (s, a) => s.modulate({ saturation: num(a, 1.8, 1, 4) }) },
  fade: { d: 'Washed-out faded look', op: (s) => s.modulate({ saturation: 0.5, brightness: 1.15 }) },
  hueshift: { d: 'Shift colors around the wheel (0-360)', u: '[0-360]', op: (s, a) => s.modulate({ hue: num(a, 90, 0, 360) }) },
  warm: { d: 'Warm orange tone', op: (s) => s.recomb([[1.1, 0, 0], [0, 1, 0], [0, 0, 0.85]]) },
  cool: { d: 'Cool blue tone', op: (s) => s.recomb([[0.85, 0, 0], [0, 1, 0], [0, 0, 1.15]]) },
  goldtone: { d: 'Gold tint', op: tintOf('#d4af37') },
  bluetone: { d: 'Blue tint', op: tintOf('#3b6fd4') },
  redtone: { d: 'Red tint', op: tintOf('#d43b3b') },
  gammaimg: { d: 'Adjust gamma (1-3)', u: '[1-3]', op: (s, a) => s.gamma(num(a, 2.2, 1, 3)) },
  blackwhite: { d: 'Pure black and white (threshold)', op: (s, a) => s.grayscale().threshold(num(a, 128, 1, 254)) },
  edges: { d: 'Edge detection look', op: (s) => s.grayscale().convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] }) },
  emboss: { d: 'Embossed look', op: (s) => s.grayscale().convolve({ width: 3, height: 3, kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2] }) },
  autolevel: { d: 'Auto-fix contrast and levels', op: (s) => s.normalise() },
  smoothgrain: { d: 'Smooth out grain (median filter)', op: (s) => s.median(5) },
  squarecrop: { d: 'Crop to a centered square', op: (s, a, m) => { const z = Math.min(m.width, m.height); return s.extract({ left: Math.floor((m.width - z) / 2), top: Math.floor((m.height - z) / 2), width: z, height: z }); } },
  widecrop: { d: 'Crop to a 16:9 banner', op: (s, a, m) => { const h = Math.min(m.height, Math.floor(m.width * 9 / 16)); return s.extract({ left: 0, top: Math.floor((m.height - h) / 2), width: m.width, height: h }); } },
  zoomin: { d: 'Zoom into the center (1.2-4)', u: '[1.2-4]', op: (s, a, m) => { const z = num(a, 2, 1.2, 4); const w = Math.floor(m.width / z), h = Math.floor(m.height / z); return s.extract({ left: Math.floor((m.width - w) / 2), top: Math.floor((m.height - h) / 2), width: w, height: h }); } },
  shrinkimg: { d: 'Make an image smaller in size (percent)', u: '[10-90]', op: (s, a, m) => s.resize(Math.max(8, Math.floor(m.width * num(a, 50, 10, 90) / 100))) },
  thumbnail: { d: 'Make a 200px thumbnail', op: (s) => s.resize(200, 200, { fit: 'cover' }) },
  addborder: { d: 'Add a white border', op: (s, a) => s.extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#ffffff' }) },
  polaroid: { d: 'Polaroid-style frame', op: (s) => s.extend({ top: 20, left: 20, right: 20, bottom: 70, background: '#fafafa' }) },
  pixelate: { d: 'Pixelate a photo', op: (s, a, m) => { const k = num(a, 24, 4, 96); return s.resize(Math.max(4, Math.floor(m.width / k)), null, { kernel: 'nearest' }); }, post: (b, m, S) => S(b).resize(m.width, m.height, { kernel: 'nearest' }) },
  topng: { d: 'Convert to PNG', op: (s) => s, out: 'png' },
  tojpg: { d: 'Convert to JPG', op: (s) => s.flatten({ background: '#fff' }), out: 'jpeg' },
  towebp: { d: 'Convert to WebP', op: (s) => s, out: 'webp' },
  stickerfit: { d: 'Make a sticker, whole picture fits (no crop)', op: (s) => s.resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }), out: 'webp', sticker: true },
  stickercrop: { d: 'Make a sticker, cropped to fill the square', op: (s) => s.resize(512, 512, { fit: 'cover' }), out: 'webp', sticker: true },
  stickerblur: { d: 'Make a sticker with soft blur', op: (s) => s.resize(512, 512, { fit: 'cover' }).blur(1.5), out: 'webp', sticker: true },
};
export async function runOp(S, name, input, args = []) {
  const o = OPS[name];
  const meta = await S(input, { limitInputPixels: 16e6, failOn: 'error' }).metadata();
  let s = S(input, { limitInputPixels: 16e6, failOn: 'error' }).rotate();
  s = o.op(s, args, meta);
  const fmt = o.out || (meta.hasAlpha ? 'png' : 'jpeg');
  s = fmt === 'png' ? s.png() : fmt === 'webp' ? s.webp({ quality: 85 }) : s.jpeg({ quality: 90 });
  let buf = await s.toBuffer();
  if (o.post) buf = await o.post(buf, meta, S).jpeg({ quality: 90 }).toBuffer();
  return { buf, fmt };
}
