// Sound board: short effects synthesized on demand with ffmpeg (no audio files, no copyright, tiny RAM).
import {spawn} from 'node:child_process';
import config from '../config/config.js';

const S = (f) => `sin(2*PI*${f}*t)`;
const env = (k) => `exp(-${k}*t)`;
const seq = (notes, step) => notes.reduceRight((acc, f, i) => (acc === null ? S(f) : `if(lt(t,${(i + 1) * step}),${S(f)},${acc})`), null);
const chirp = (f0, f1, d) => `sin(2*PI*(${f0}*t+(${f1 - f0})/(2*${d})*t*t))`;

export const SOUNDS = {
  airhorn: {d: 1.3, desc: 'loud airhorn', x: `0.35*(${S(466)}+${S(587)}+0.6*${S(932)})*(0.8+0.2*sin(2*PI*28*t))*min(1,t*40)*min(1,(1.3-t)*6)`},
  ding: {d: 1.2, desc: 'bell ding', x: `0.7*(${S(1318)}+0.3*${S(2636)})*${env(4)}`},
  buzzer: {d: 0.8, desc: 'wrong answer buzzer', x: `0.4*sgn(${S(120)})*min(1,(0.8-t)*8)`},
  tada: {d: 1.6, desc: 'tada fanfare', x: `0.5*(${seq([523, 659, 784], 0.12).replace(/ /g, '')}*(lt(t,0.36))+(gte(t,0.36))*(${S(1046)}+${S(784)}+${S(659)})/2*${env(2.2)})`},
  sadtrombone: {d: 2.6, desc: 'sad trombone', x: `0.5*(0.7*${seq([311, 294, 277], 0.5).replace(/ /g, '')}*lt(t,1.5)+gte(t,1.5)*sin(2*PI*(277*t-12*t*t))*(1+0.15*sin(2*PI*6*t)))*min(1,(2.6-t)*4)`},
  drumroll: {d: 2.2, desc: 'drum roll', x: `0.9*(random(0)*0.5+0.5*sin(2*PI*60*t))*(0.5+0.5*sin(2*PI*22*t)*sin(2*PI*22*t))*(0.3+0.7*t/2.2)`},
  laser: {d: 0.45, desc: 'laser zap', x: `0.6*${chirp(2400, 250, 0.45)}*min(1,(0.45-t)*10)`},
  boing: {d: 0.9, desc: 'cartoon boing', x: `0.7*sin(2*PI*(260*t+25*sin(2*PI*9*t)/9))*${env(3.2)}`},
  coin: {d: 0.7, desc: 'game coin', x: `0.6*(lt(t,0.09)*${S(988)}+gte(t,0.09)*${S(1319)}*${env(5)})`},
  levelup: {d: 1.2, desc: 'level up', x: `0.5*${seq([523, 659, 784, 1046, 1318], 0.14).replace(/ /g, '')}*lt(t,0.7)+0.5*gte(t,0.7)*${S(1318)}*${env(3)}`},
  applause: {d: 2.5, desc: 'clapping crowd', x: `0.8*random(0)*(0.45+0.55*abs(sin(2*PI*9*t+3*sin(2*PI*1.3*t))))*min(1,t*6)*min(1,(2.5-t)*3)`},
  rimshot: {d: 1.1, desc: 'ba dum tss', x: `0.8*(lt(t,0.12)*${S(180)}*${env(25)}+between(t,0.24,0.36)*${S(140)}*${env(25)}+gte(t,0.5)*random(0)*${env(5)}*1.2)`},
  whoosh: {d: 0.9, desc: 'swoosh', x: `0.7*random(0)*sin(PI*t/0.9)*sin(PI*t/0.9)`},
  heartbeat: {d: 1.4, desc: 'heartbeat', x: `0.9*(${S(55)}*(lt(t,0.15)*${env(18)}+between(t,0.3,0.45)*exp(-18*(t-0.3))*0.8)+${S(55)}*(between(t,0.7,0.85)*exp(-18*(t-0.7))+between(t,1.0,1.15)*exp(-18*(t-1.0))*0.8))`},
  siren: {d: 2.4, desc: 'police siren', x: `0.5*sin(2*PI*(700*t+150*(1-cos(2*PI*1.25*t))/(2*PI*1.25)*2))`},
};

const cache = new Map();
export const names = () => Object.keys(SOUNDS);

export function render(name, {ffmpeg = config.tools?.ffmpeg || 'ffmpeg', timeoutMs = 10000} = {}) {
  const s = SOUNDS[name]; if (!s) return Promise.reject(new Error('unknown sound'));
  if (cache.has(name)) return Promise.resolve(cache.get(name));
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${s.x}':s=48000:d=${s.d}`, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1'], {stdio: ['ignore', 'pipe', 'pipe']});
    const out = []; let n = 0; const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (c) => { n += c.length; if (n > 400000) p.kill('SIGKILL'); else out.push(c); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); if (code !== 0 || !n) return reject(new Error('ffmpeg ' + code)); const b = Buffer.concat(out); if (cache.size >= 20) cache.clear(); cache.set(name, b); resolve(b); });
  });
}
