import {spawn} from 'node:child_process';

const A = 'aresample=48000';
// Pitch shift by factor f (speed unchanged).
const P = (f) => `${A},asetrate=${Math.round(48000 * f)},aresample=48000,${tempo(1 / f)}`;
// Pitch and speed change together (like a tape), no tempo correction.
const T = (f) => `${A},asetrate=${Math.round(48000 * f)},aresample=48000`;
// atempo only accepts 0.5-2 per stage, so chain stages.
export function tempo(x) {
  const out = []; let r = x;
  while (r > 2) { out.push('atempo=2'); r /= 2; }
  while (r < 0.5) { out.push('atempo=0.5'); r *= 2; }
  out.push('atempo=' + r.toFixed(4));
  return out.join(',');
}
const E = (g, d, dec) => `aecho=0.8:${g}:${d}:${dec}`;
const RING = (f, d = 1) => `tremolo=f=${f}:d=${d}`;
const ROBOT = (w, o) => `afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=${w}:overlap=${o}`;
const BAND = (hi, lo) => `highpass=f=${hi},lowpass=f=${lo}`;
const CRUSH = (bits, mix = 0.8) => `acrusher=bits=${bits}:mix=${mix}:mode=log:aa=1`;

// [name, description, filter, aliases?]
const G = {
  'Pitch up': [
    ['chipmunk', 'high, squeaky', P(1.6), ['high', 'squeak', 'helium']],
    ['helium2', 'extra high', P(1.9)], ['mouse', 'tiny mouse', P(2.2)], ['kid', 'child voice', P(1.35)],
    ['tiny', 'very small voice', P(1.75)], ['pixie', 'fairy, shimmering', P(1.5) + ',' + RING(7, 0.3)],
    ['baby', 'baby-ish', P(1.7) + ',' + tempo(0.9)], ['girlish', 'a bit higher', P(1.2)],
  ],
  'Pitch down': [
    ['deep', 'deep voice', P(0.75) + ',bass=g=6', ['low', 'bass', 'heavy']],
    ['lowman', 'slightly lower', P(0.85)], ['giant', 'big giant', P(0.65) + ',' + E(0.6, 80, 0.3)], ['titan', 'huge, rumbling', P(0.55) + ',bass=g=8'],
    ['grumpy', 'grumpy grandpa', P(0.7) + ',' + RING(5, 0.25)], ['bassboost', 'heavy bass', P(0.8) + ',bass=g=12'], ['bear', 'bear growl', P(0.62) + ',' + CRUSH(8, 0.4)],
    ['elder', 'old man', P(0.8) + ',' + RING(4, 0.35)],
  ],
  'Speed': [
    ['fast', 'faster talk', `${A},${tempo(1.6)}`, ['quick']], ['faster', 'much faster', `${A},${tempo(2)}`], ['turbo', 'super fast', `${A},${tempo(3)}`],
    ['slow', 'slower talk', `${A},${tempo(0.7)}`, ['slowmo']], ['slower', 'much slower', `${A},${tempo(0.55)}`], ['snail', 'very slow', `${A},${tempo(0.4)}`],
    ['rapper', 'quick, slightly high', P(1.1) + ',' + tempo(1.4)], ['sleepy', 'slow and low', P(0.9) + ',' + tempo(0.7)],
  ],
  'Music vibes': [
    ['nightcore', 'faster and higher', T(1.25)], ['nightcore2', 'even faster and higher', T(1.4)], ['daycore', 'slower and lower', T(0.8)],
    ['slowedreverb', 'slowed + reverb', T(0.85) + ',' + E(0.85, '90|180|320', '0.4|0.3|0.2')], ['vaporwave', 'dreamy slow', T(0.75) + ',chorus=0.5:0.9:50:0.4:0.25:2'],
    ['lofi', 'lo-fi tape', BAND(120, 3500) + ',' + CRUSH(10, 0.3)], ['chorus', 'choir-ish', `${A},chorus=0.6:0.9:55:0.4:0.25:2`], ['concert', 'big stage', E(0.9, '70|140', '0.5|0.3') + ',bass=g=4'],
    ['karaoke', 'wide echoey', E(0.88, '120|240', '0.45|0.3')], ['radiohit', 'bright radio', BAND(150, 7000) + ',treble=g=5'],
  ],
  'Monsters': [
    ['monster', 'low, growly', P(0.6) + ',' + E(0.7, 40, 0.4), ['giantmon']], ['demon', 'evil demon', P(0.55) + ',' + RING(30, 0.5) + ',' + E(0.7, 60, 0.4)],
    ['ogre', 'ogre', P(0.65) + ',' + CRUSH(7, 0.5)], ['ghost', 'spooky ghost', P(0.85) + ',' + RING(6, 0.5) + ',' + E(0.9, '300|600', '0.4|0.3')],
    ['zombie', 'zombie moan', P(0.7) + ',' + tempo(0.8) + ',' + RING(3, 0.6)], ['dragon', 'dragon roar', P(0.5) + ',' + CRUSH(9, 0.5) + ',bass=g=8'],
    ['troll', 'troll', P(0.72) + ',' + RING(8, 0.4)], ['vader', 'dark lord', P(0.6) + ',' + ROBOT(512, 0.75)],
  ],
  'Robots': [
    ['robot', 'classic robot', `${A},${ROBOT(512, 0.75)}`, ['bot', 'droid']], ['robot2', 'rough robot', `${A},${ROBOT(256, 0.5)}`], ['robot3', 'smooth robot', `${A},${ROBOT(1024, 0.85)}`],
    ['cyborg', 'half-robot', P(0.9) + ',' + ROBOT(512, 0.75)], ['dalek', 'ring-mod voice', P(0.9) + ',' + RING(50, 1)], ['android', 'high robot', P(1.2) + ',' + ROBOT(512, 0.75)],
    ['mech', 'giant mech', P(0.7) + ',' + ROBOT(1024, 0.8) + ',' + E(0.6, 50, 0.3)], ['glitch', 'digital glitch', `${A},${CRUSH(5, 0.9)}`],
    ['laser', 'sci-fi wobble', `${A},vibrato=f=20:d=1`], ['transformer', 'big robot', P(0.8) + ',' + RING(70, 1)],
  ],
  'Aliens & space': [
    ['alien', 'wobbly alien', P(1.3) + ',' + RING(9, 0.7), ['ufo', 'martian']], ['alien2', 'deep alien', P(0.8) + ',' + RING(12, 0.8)], ['squid', 'weird gurgle', `${A},vibrato=f=14:d=0.9,` + P(1.1)],
    ['space', 'floating in space', `${A},` + E(0.9, '400|800|1200', '0.5|0.4|0.3')], ['astronaut', 'radio from space', BAND(300, 3400) + ',' + RING(2, 0.2) + ',' + E(0.8, 200, 0.3)],
    ['cosmic', 'spacey wobble', `${A},vibrato=f=5:d=0.6,` + E(0.88, '250|500', '0.4|0.3')], ['blackhole', 'sinking', P(0.6) + ',' + E(0.9, '500|1000', '0.5|0.4')],
    ['martian2', 'higher martian', P(1.45) + ',' + RING(15, 0.8)],
  ],
  'Echo & rooms': [
    ['echo', 'echo', `${A},${E(0.9, '400|800', '0.5|0.3')}`, ['reverb']], ['bigecho', 'long echo', `${A},${E(0.9, '600|1200|1800', '0.5|0.4|0.3')}`], ['cave', 'in a cave', `${A},${E(0.88, '60|120|240', '0.4|0.3|0.2')}`],
    ['hall', 'big hall', `${A},${E(0.88, '80|160|320', '0.35|0.3|0.2')}`], ['canyon', 'canyon shout', `${A},${E(0.9, '900|1800', '0.6|0.4')}`], ['tunnel', 'in a tunnel', `${A},${E(0.9, '150|300', '0.5|0.4')},lowpass=f=4000`],
    ['bathroom', 'tiled bathroom', `${A},${E(0.85, '30|60|90', '0.4|0.3|0.25')}`], ['stadium', 'stadium', `${A},${E(0.9, '200|500|900', '0.4|0.35|0.3')}`, ['church']],
    ['pingpong', 'fast repeats', `${A},${E(0.9, '120|240|360', '0.6|0.5|0.4')}`], ['doubletrack', 'doubled voice', `${A},aecho=1:0.8:20:0.6`],
  ],
  'Devices & places': [
    ['telephone', 'old phone', `${A},${BAND(500, 3000)},volume=1.5`, ['phone']], ['radio', 'AM radio', `${A},${BAND(300, 3400)},${CRUSH(10, 0.3)},volume=1.4`], ['walkie', 'walkie-talkie', `${A},${BAND(400, 2800)},${CRUSH(8, 0.5)},volume=1.6`],
    ['megaphone', 'megaphone', `${A},${BAND(500, 4000)},volume=2,${E(0.7, 40, 0.3)}`], ['intercom', 'intercom', `${A},${BAND(600, 2500)},volume=1.6`], ['tincan', 'tin can phone', `${A},${BAND(800, 2200)},volume=1.8`],
    ['tv', 'old TV', `${A},${BAND(200, 5000)},${RING(50, 0.15)}`], ['underwater', 'underwater', `${A},lowpass=f=700,vibrato=f=4:d=0.5,${E(0.8, 70, 0.4)}`], ['muffled', 'behind a wall', `${A},lowpass=f=500,volume=1.8`],
    ['speaker', 'small speaker', `${A},${BAND(250, 6000)},volume=1.2`],
  ],
  'Distortion': [
    ['bitcrush', 'crushed 8-bit', `${A},${CRUSH(6, 0.9)}`], ['crunch', 'crunchy', `${A},${CRUSH(8, 0.7)}`], ['broken', 'broken speaker', `${A},${CRUSH(4, 0.9)},${BAND(200, 3500)}`],
    ['overdrive', 'overdriven', `${A},volume=6,alimiter=limit=0.6:level=disabled`], ['static', 'radio static', `${A},${CRUSH(7, 0.6)},${RING(120, 0.3)}`], ['arcade', 'old arcade', `${A},${CRUSH(5, 0.8)},${P(1.15)}`],
    ['scream', 'harsh scream', P(1.25) + ',' + CRUSH(6, 0.7) + ',volume=3'], ['fuzz', 'fuzzy guitar voice', `${A},volume=8,alimiter=limit=0.4:level=disabled,lowpass=f=4500`],
  ],
  'Wobble & weird': [
    ['reverse', 'backwards voice', `${A},areverse`, ['backwards']], ['reverseecho', 'backwards echo', `${A},areverse,${E(0.9, '300|600', '0.5|0.3')},areverse`], ['tremble', 'trembling', `${A},${RING(8, 0.8)}`],
    ['vibrato', 'wavy pitch', `${A},vibrato=f=7:d=0.8`], ['wobble', 'slow wobble', `${A},vibrato=f=2:d=1`], ['flanger', 'jet flanger', `${A},flanger=delay=5:depth=6:speed=1`],
    ['phaser', 'phase swirl', `${A},aphaser=type=t:speed=1.5`], ['stutter', 'choppy', `${A},${RING(10, 1)}`], ['shaky', 'nervous shake', `${A},vibrato=f=12:d=0.4,${RING(6, 0.3)}`],
    ['drunk', 'drunk & slurry', P(0.9) + ',' + tempo(0.85) + ',vibrato=f=3:d=0.6'], ['seasick', 'seasick', `${A},vibrato=f=1:d=1,${P(0.95)}`], ['whisperish', 'airy quiet', `${A},highpass=f=1200,volume=2.5`],
    ['sing', 'warbly singer', `${A},vibrato=f=6:d=0.5,${E(0.85, 90, 0.35)}`], ['cartoon', 'cartoon voice', P(1.4) + ',' + RING(5, 0.3)],
  ],
  'Characters': [
    ['goblin', 'sneaky goblin', P(1.25) + ',' + RING(6, 0.3) + ',' + CRUSH(9, 0.3)], ['wizard', 'old wizard', P(0.85) + ',' + E(0.85, '120|240', '0.4|0.3') + ',treble=g=3'],
    ['witch', 'cackling witch', P(1.3) + ',vibrato=f=5:d=0.5,' + RING(4, 0.3)], ['pirate', 'rough pirate', P(0.8) + ',' + tempo(0.9) + ',' + BAND(150, 4000) + ',' + CRUSH(9, 0.3)],
    ['granny', 'shaky grandma', P(1.15) + ',vibrato=f=4:d=0.5,' + tempo(0.9)], ['superhero', 'heroic', P(0.85) + ',bass=g=5,' + E(0.7, 50, 0.3)],
    ['villain', 'evil villain', P(0.7) + ',' + E(0.85, '90|180', '0.4|0.3') + ',' + RING(3, 0.3)], ['minion', 'fast squeaky helper', P(1.55) + ',' + tempo(1.25) + ',' + RING(5, 0.2)],
    ['genie', 'magic genie', P(0.8) + ',' + E(0.85, '150|300|450', '0.5|0.4|0.3') + ',chorus=0.5:0.9:50:0.4:0.25:2'], ['dwarf', 'gruff dwarf', P(0.78) + ',bass=g=6,' + tempo(0.95)],
    ['elf', 'light elf', P(1.3) + ',' + E(0.8, '60|120', '0.3|0.2') + ',treble=g=4'], ['vampire', 'creepy vampire', P(0.82) + ',' + E(0.85, '200|400', '0.4|0.3') + ',' + BAND(100, 5000)],
  ],
  'Moods': [
    ['panic', 'panicking', P(1.15) + ',' + tempo(1.5) + ',vibrato=f=9:d=0.4'], ['calm', 'calm and soft', `${A},${tempo(0.85)},lowpass=f=5000,bass=g=3`],
    ['angry', 'angry', P(0.8) + ',' + CRUSH(8, 0.4) + ',volume=2.5'], ['shy', 'shy and quiet', P(1.1) + ',' + tempo(0.85) + ',volume=0.6'],
    ['excited', 'excited', P(1.25) + ',' + tempo(1.3)], ['sad', 'sad and slow', P(0.9) + ',' + tempo(0.8) + ',vibrato=f=4:d=0.3'],
  ],
  'Studio & retro': [
    ['vinyl', 'old record', `${A},${BAND(80, 6000)},${CRUSH(12, 0.25)},${RING(2, 0.1)}`], ['cassette', 'old tape', `${A},${BAND(100, 5000)},vibrato=f=0.8:d=0.3,${CRUSH(11, 0.3)}`],
    ['gramophone', 'antique player', `${A},${BAND(300, 3000)},vibrato=f=1.5:d=0.4,${CRUSH(9, 0.3)}`], ['jukebox', 'diner jukebox', `${A},${BAND(200, 4500)},${E(0.8, 60, 0.3)}`],
    ['announcer', 'big announcer', `${A},${BAND(120, 6000)},bass=g=4,${E(0.7, 40, 0.3)}`], ['podcast', 'rich podcast', `${A},bass=g=4,treble=g=2,acompressor=threshold=0.1:ratio=4`],
    ['studio', 'clean studio', `${A},acompressor=threshold=0.1:ratio=3,treble=g=3`], ['headset', 'gamer headset', `${A},${BAND(300, 3800)},${CRUSH(11, 0.3)}`],
    ['club', 'in a club', `${A},bass=g=10,${E(0.8, '50|100', '0.4|0.3')}`], ['cinema', 'movie trailer', P(0.85) + ',bass=g=3,' + E(0.85, '100|200|400', '0.4|0.3|0.2')],
  ],
  'Sci-fi & game': [
    ['hologram', 'flickering hologram', P(1.1) + ',' + RING(20, 0.5) + ',' + E(0.8, '30|60', '0.4|0.3')], ['portal', 'warping portal', `${A},vibrato=f=3:d=1,${E(0.9, '400|800', '0.5|0.4')},` + P(0.9)],
    ['matrix', 'green-code voice', `${A},${ROBOT(256, 0.5)},${E(0.8, 70, 0.3)}`], ['neon', 'bright synthwave', P(1.1) + ',chorus=0.6:0.9:45:0.4:0.3:2,treble=g=4'],
    ['cyber', 'cyber robot', `${A},${ROBOT(256, 0.75)},${CRUSH(8, 0.5)}`], ['terminal', 'old computer', `${A},${CRUSH(5, 0.8)},${BAND(300, 3000)},${RING(25, 0.5)}`],
    ['warp', 'warp speed', P(0.8) + ',vibrato=f=16:d=1'], ['pulse', 'pulsing', `${A},${RING(4, 1)}`],
    ['pixel', '8-bit pixel', P(1.2) + ',' + CRUSH(4, 0.8)], ['console', 'retro console', `${A},${CRUSH(6, 0.7)},${BAND(150, 5000)}`],
  ],
  'Nature & places': [
    ['forest', 'in a forest', `${A},${E(0.8, '250|500', '0.3|0.2')},lowpass=f=6000`], ['ocean', 'under ocean waves', `${A},lowpass=f=900,vibrato=f=0.5:d=1,${E(0.9, '500|1000', '0.5|0.4')}`],
    ['rain', 'rainy window', `${A},highpass=f=400,${RING(60, 0.2)}`], ['storm', 'stormy and loud', P(0.8) + ',bass=g=6,' + E(0.9, '300|600', '0.5|0.4')],
    ['mountain', 'shouting on a mountain', `${A},${E(0.9, '1200|2400', '0.5|0.3')}`], ['pool', 'swimming pool', `${A},lowpass=f=1500,vibrato=f=3:d=0.6,${E(0.8, 30, 0.4)}`],
    ['subway', 'in a subway', `${A},${BAND(200, 3500)},${E(0.8, '40|80', '0.4|0.3')},${RING(30, 0.2)}`], ['attic', 'dusty attic', `${A},${E(0.85, '25|50', '0.4|0.3')},lowpass=f=3500`],
    ['deepwell', 'down a well', P(0.9) + ',' + E(0.9, '100|200|300', '0.6|0.5|0.4') + ',lowpass=f=2500'], ['balcony', 'from a balcony', `${A},${E(0.8, 500, 0.3)}`],
  ],
};

export const GROUPS = Object.entries(G).map(([group, rows]) => ({group, effects: rows.map(([name]) => name)}));
export const EFFECTS = {};
let n = 0;
for (const [group, rows] of Object.entries(G)) {
  for (const [name, desc, filter, aliases = []] of rows) {
    if (EFFECTS[name]) throw new Error('duplicate voice effect ' + name);
    EFFECTS[name] = {group, desc, filter, aliases, number: ++n};
  }
}
export const COUNT = n;

export function resolveEffect(name) {
  const s = String(name ?? '').toLowerCase().trim();
  if (/^\d+$/.test(s)) { const hit = Object.entries(EFFECTS).find(([, v]) => v.number === Number(s)); return hit ? hit[0] : null; }
  const k = s.replace(/[^a-z0-9]/g, '');
  if (!k) return null;
  if (EFFECTS[k]) return k;
  for (const [key, v] of Object.entries(EFFECTS)) if (v.aliases.includes(k)) return key;
  return null;
}
export function groupList(filter) {
  const f = String(filter || '').toLowerCase();
  const gs = f ? GROUPS.filter((g) => g.group.toLowerCase().includes(f)) : GROUPS;
  return gs.map((g) => `*${g.group}*\n` + g.effects.map((e) => `${EFFECTS[e].number}. ${e}`).join(', ')).join('\n\n');
}
export const effectList = () => groupList();

// Custom: pitch (semitones -12..12), speed (0.5..3), echo (0..1), bass (-10..10 dB), crush (4..16 bits), flags reverse/robot.
export function parseCustom(args) {
  const o = {}; const err = [];
  for (const raw of args) {
    const [k0, v0] = String(raw).toLowerCase().split('=');
    const k = k0.trim();
    if (k === 'reverse' || k === 'robot') { o[k] = true; continue; }
    const v = Number(v0);
    const lim = {pitch: [-12, 12], speed: [0.5, 3], echo: [0, 1], bass: [-10, 10], crush: [4, 16]}[k];
    if (!lim) { err.push('unknown option "' + k0 + '"'); continue; }
    if (!Number.isFinite(v) || v < lim[0] || v > lim[1]) { err.push(k + ' must be between ' + lim[0] + ' and ' + lim[1]); continue; }
    o[k] = v;
  }
  if (!err.length && !Object.keys(o).length) err.push('give at least one option');
  return err.length ? {error: err.join('; ')} : {opts: o};
}
export function customFilter(o) {
  const f = [A];
  if (o.pitch) f.push(P(Math.pow(2, o.pitch / 12)).slice(A.length + 1));
  if (o.speed && o.speed !== 1) f.push(tempo(o.speed));
  if (o.robot) f.push(ROBOT(512, 0.75));
  if (o.crush) f.push(CRUSH(Math.round(o.crush), 0.8));
  if (o.bass) f.push('bass=g=' + o.bass);
  if (o.reverse) f.push('areverse');
  if (o.echo) f.push(E(0.9, '250|500', `${(0.6 * o.echo).toFixed(2)}|${(0.4 * o.echo).toFixed(2)}`));
  return f.join(',');
}

export function runFfmpeg(input, output, filter, {ffmpeg = 'ffmpeg', maxSeconds = 60, timeoutMs = 60000} = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-nostdin', '-y', '-threads', '1', '-i', input, '-t', String(maxSeconds), '-vn', '-af', filter + ',alimiter=limit=0.95', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', output], {stdio: 'ignore'});
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (err) => { clearTimeout(t); reject(err); });
    p.on('close', (c) => { clearTimeout(t); c === 0 ? resolve() : reject(new Error('ffmpeg ' + c)); });
  });
}
export function applyEffect(input, output, effect, opts) {
  const e = EFFECTS[effect]; if (!e) return Promise.reject(new Error('unknown effect'));
  return runFfmpeg(input, output, e.filter, opts);
}
