import crypto from 'node:crypto';
import { section, tx } from './_kit.js';
// Encode & Crypto: pure offline encoders, hashes and generators.
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hash = (alg) => (t) => crypto.createHash(alg).update(t).digest('hex');
const hmac = (alg) => (t) => { const i = t.indexOf(' '); if (i < 1) throw new Error('use: <secret> <message>'); return crypto.createHmac(alg, t.slice(0, i)).update(t.slice(i + 1)).digest('hex'); };
const crc32 = (s) => { let c, crc = -1; for (const b of Buffer.from(s)) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0'); };
const adler32 = (s) => { let a = 1, b = 0; for (const x of Buffer.from(s)) { a = (a + x) % 65521; b = (b + a) % 65521; } return (((b << 16) | a) >>> 0).toString(16).padStart(8, '0'); };
const caesar = (t, k) => t.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + k + 26) % 26) + b); });
const vig = (t, key, dir) => { let i = 0; return t.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; const k = key[i++ % key.length].toLowerCase().charCodeAt(0) - 97; return String.fromCharCode(((c.charCodeAt(0) - b + dir * k + 26) % 26) + b); }); };
const rnd = (n, set) => { let o = ''; const b = crypto.randomBytes(n * 2); for (let i = 0; i < n; i++) o += set[b.readUInt16BE(i * 2) % set.length]; return o; };
const num = (t, lo, hi) => { const n = Number(t); if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`give a whole number ${lo} to ${hi}`); return n; };
const base = (r) => (t) => { const [b, n] = t.split(/\s+/); const B = Number(b); if (!n || !Number.isInteger(B) || B < 2 || B > 36) throw new Error('use: <base 2-36> <number>'); const v = parseInt(n, B); if (Number.isNaN(v)) throw new Error('not a valid number in that base'); return r(v, B); };
const E = [
  tx('base64enc', 'Base64 encode', (t) => Buffer.from(t).toString('base64'), 'hello', 'aGVsbG8='),
  tx('base64dec', 'Base64 decode', (t) => { if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(t.trim())) throw new Error('not valid base64'); return Buffer.from(t.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }, 'aGVsbG8=', 'hello'),
  tx('base64url', 'URL-safe Base64 encode', (t) => b64u(t), 'hi??>>', 'aGk_Pz4-'),
  tx('base32enc', 'Base32 encode', (t) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const b of Buffer.from(t)) bits += b.toString(2).padStart(8, '0'); let o = ''; for (let i = 0; i < bits.length; i += 5) o += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; while (o.length % 8) o += '='; return o; }, 'hi', 'NBUQ===='),
  tx('base32dec', 'Base32 decode', (t) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of t.toUpperCase().replace(/=+$/, '')) { const i = A.indexOf(c); if (i < 0) throw new Error('not valid base32'); bits += i.toString(2).padStart(5, '0'); } const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes).toString('utf8'); }, 'NBUQ====', 'hi'),
  tx('hexenc', 'Text to hex', (t) => Buffer.from(t).toString('hex'), 'hi', '6869'),
  tx('hexdec', 'Hex to text', (t) => { const h = t.replace(/\s|0x/g, ''); if (!/^([0-9a-f]{2})+$/i.test(h)) throw new Error('not valid hex'); return Buffer.from(h, 'hex').toString('utf8'); }, '6869', 'hi'),
  tx('binenc', 'Text to binary', (t) => [...Buffer.from(t)].map((b) => b.toString(2).padStart(8, '0')).join(' '), 'A', '01000001'),
  tx('bindec', 'Binary to text', (t) => { const p = t.trim().split(/\s+/); if (!p.every((x) => /^[01]{8}$/.test(x))) throw new Error('give 8-bit groups like 01000001'); return Buffer.from(p.map((x) => parseInt(x, 2))).toString('utf8'); }, '01000001', 'A'),
  tx('octenc', 'Text to octal', (t) => [...Buffer.from(t)].map((b) => b.toString(8).padStart(3, '0')).join(' '), 'A', '101'),
  tx('octdec', 'Octal to text', (t) => { const p = t.trim().split(/\s+/); if (!p.every((x) => /^[0-7]{1,3}$/.test(x))) throw new Error('give octal groups like 101'); return Buffer.from(p.map((x) => parseInt(x, 8))).toString('utf8'); }, '101', 'A'),
  tx('asciicodes', 'Text to ASCII codes', (t) => [...t].map((c) => c.codePointAt(0)).join(' '), 'Hi', '72 105'),
  tx('fromascii', 'ASCII codes to text', (t) => { const p = t.trim().split(/\s+/).map(Number); if (p.some((x) => !Number.isInteger(x) || x < 0 || x > 0x10ffff)) throw new Error('give numbers like 72 105'); return String.fromCodePoint(...p); }, '72 105', 'Hi'),
  tx('urlenc', 'URL encode', (t) => encodeURIComponent(t), 'a b&c', 'a%20b%26c'),
  tx('urldec', 'URL decode', (t) => decodeURIComponent(t), 'a%20b%26c', 'a b&c'),
  tx('htmlenc', 'HTML escape', (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]), '<a>', '&lt;a&gt;'),
  tx('htmldec', 'HTML unescape', (t) => t.replace(/&(amp|lt|gt|quot|#39);/g, (_, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[c]), '&lt;a&gt;', '<a>'),
  tx('unicodeesc', 'Text to \\u escapes', (t) => [...t].map((c) => (c.charCodeAt(0) > 126 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join(''), 'é', '\\u00e9'),
  tx('unicodeunesc', 'Decode \\u escapes', (t) => t.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), '\\u00e9', 'é'),
  tx('jsonescape', 'Escape text for JSON', (t) => JSON.stringify(t).slice(1, -1), 'a"b', 'a\\"b'),
  tx('md5', 'MD5 hash', hash('md5'), 'hello', '5d41402abc4b2a76b9719d911017c592'),
  tx('sha1', 'SHA-1 hash', hash('sha1'), 'hello', 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'),
  tx('sha256', 'SHA-256 hash', hash('sha256'), 'hello', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'),
  tx('sha384', 'SHA-384 hash', hash('sha384'), 'hello', (o) => o.length === 96 && o.startsWith('59e1748777448c69')),
  tx('sha512', 'SHA-512 hash', hash('sha512'), 'hello', (o) => o.length === 128 && o.startsWith('9b71d224bd62f378')),
  tx('sha3', 'SHA3-256 hash', hash('sha3-256'), 'hello', '3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392'),
  tx('ripemd', 'RIPEMD-160 hash', (t) => { try { return crypto.createHash('ripemd160').update(t).digest('hex'); } catch { throw new Error('not supported on this server'); } }, 'hello', (o) => /^[0-9a-f]{40}$/.test(o) || /not supported/.test(o)),
  tx('crc32', 'CRC32 checksum', crc32, 'hello', '3610a686'),
  tx('adler32', 'Adler-32 checksum', adler32, 'hello', '062c0215'),
  tx('hmac256', 'HMAC-SHA256 (hmac256 <secret> <message>)', hmac('sha256'), 'key msg', (o) => /^[0-9a-f]{64}$/.test(o)),
  tx('hmac512', 'HMAC-SHA512 (hmac512 <secret> <message>)', hmac('sha512'), 'key msg', (o) => /^[0-9a-f]{128}$/.test(o)),
  tx('hashall', 'MD5, SHA1 and SHA256 together', (t) => `MD5 ${hash('md5')(t)}\nSHA1 ${hash('sha1')(t)}\nSHA256 ${hash('sha256')(t)}`, 'a', (o) => o.startsWith('MD5 0cc175b9c0f1b6a831c399e269772661')),
  tx('hashcompare', 'Do two texts have the same hash? (a | b)', (t) => { const [a, b] = t.split('|').map((x) => x.trim()); if (b == null) throw new Error('use: first | second'); return hash('sha256')(a) === hash('sha256')(b) ? 'Same SHA-256: texts are identical' : 'Different SHA-256: texts differ'; }, 'a | a', 'Same SHA-256: texts are identical'),
  tx('caesar3', 'Caesar cipher shift 3', (t) => caesar(t, 3), 'abc xyz', 'def abc'),
  tx('caesarn', 'Caesar cipher (caesarn <shift> <text>)', (t) => { const m = /^(-?\d{1,2})\s+(.+)$/s.exec(t); if (!m) throw new Error('use: caesarn <shift> <text>'); return caesar(m[2], +m[1] % 26); }, '1 abc', 'bcd'),
  tx('caesarbrute', 'Try all 25 Caesar shifts', (t) => Array.from({ length: 25 }, (_, i) => `${i + 1}: ${caesar(t, i + 1)}`).join('\n'), 'abc', (o) => o.split('\n').length === 25 && o.includes('3: def')),
  tx('vigenere', 'Vigenere encrypt (vigenere <key> <text>)', (t) => { const m = /^([a-z]+)\s+(.+)$/is.exec(t); if (!m) throw new Error('use: vigenere <letters key> <text>'); return vig(m[2], m[1], 1); }, 'lemon attackatdawn', 'lxfopvefrnhr'),
  tx('unvigenere', 'Vigenere decrypt (unvigenere <key> <text>)', (t) => { const m = /^([a-z]+)\s+(.+)$/is.exec(t); if (!m) throw new Error('use: unvigenere <letters key> <text>'); return vig(m[2], m[1], -1); }, 'lemon lxfopv', 'attack'),
  tx('xorhex', 'XOR text with a key, output hex (xorhex <key> <text>)', (t) => { const i = t.indexOf(' '); if (i < 1) throw new Error('use: xorhex <key> <text>'); const k = Buffer.from(t.slice(0, i)); return Buffer.from(t.slice(i + 1)).map((b, j) => b ^ k[j % k.length]).toString('hex'); }, 'k hi', '0302'),
  tx('railfence', 'Rail fence cipher, 3 rails', (t) => { const s = t.replace(/\s/g, ''); const r = [[], [], []]; let row = 0, d = 1; for (const c of s) { r[row].push(c); if (row === 0) d = 1; if (row === 2) d = -1; row += d; } return r.flat().join(''); }, 'WEAREDISCOVERED', 'WECRERDSOEEAIVD'),
  tx('affine', 'Affine cipher a=5 b=8', (t) => t.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((5 * (c.charCodeAt(0) - b) + 8) % 26) + b); }), 'affine', 'ihhwvc'),
  tx('password', 'Strong random password (password [length 8-64])', () => '', '', ''),
  tx('passgen', 'Random password (passgen [length 8-64])', (t) => rnd(t ? num(t, 8, 64) : 16, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'), '12', (o) => o.length === 12, { minArgs: 0, usage: 'passgen [length]' }),
  tx('pingen', 'Random numeric PIN (pingen [digits 4-12])', (t) => rnd(t ? num(t, 4, 12) : 6, '0123456789'), '5', (o) => /^\d{5}$/.test(o), { minArgs: 0, usage: 'pingen [digits]' }),
  tx('passphrase', 'Random passphrase of words', (t) => { const W = ['river', 'maple', 'orbit', 'candle', 'tiger', 'planet', 'silver', 'forest', 'cobalt', 'ember', 'harbor', 'violet', 'meadow', 'rocket', 'sunset', 'pepper', 'glacier', 'lantern', 'marble', 'thunder', 'velvet', 'whistle', 'anchor', 'breeze']; const n = t ? num(t, 3, 8) : 4; return Array.from({ length: n }, () => W[crypto.randomInt(W.length)]).join('-'); }, '3', (o) => o.split('-').length === 3, { minArgs: 0, usage: 'passphrase [words]' }),
  tx('hexcolor', 'Random hex color', () => '#' + rnd(6, '0123456789abcdef'), '', (o) => /^#[0-9a-f]{6}$/.test(o), { minArgs: 0, usage: 'hexcolor' }),
  tx('randhex', 'Random hex string (randhex [bytes 1-32])', (t) => crypto.randomBytes(t ? num(t, 1, 32) : 8).toString('hex'), '4', (o) => /^[0-9a-f]{8}$/.test(o), { minArgs: 0, usage: 'randhex [bytes]' }),
  tx('uuid', 'Random UUID v4', () => crypto.randomUUID(), '', (o) => /^[0-9a-f-]{36}$/.test(o), { minArgs: 0, usage: 'uuid' }),
  tx('uuidlist', 'Several UUIDs (uuidlist [1-10])', (t) => Array.from({ length: t ? num(t, 1, 10) : 3 }, () => crypto.randomUUID()).join('\n'), '2', (o) => o.split('\n').length === 2, { minArgs: 0, usage: 'uuidlist [count]' }),
  tx('apikeygen', 'Random API-key style token', (t) => 'key_' + rnd(t ? num(t, 16, 64) : 32, 'abcdefghijklmnopqrstuvwxyz0123456789'), '20', (o) => o.length === 24 && o.startsWith('key_'), { minArgs: 0, usage: 'apikeygen [length]' }),
  tx('salt', 'Random salt (hex, 16 bytes)', () => crypto.randomBytes(16).toString('hex'), '', (o) => o.length === 32, { minArgs: 0, usage: 'salt' }),
  tx('passstrength', 'Rate a password (not stored)', (t) => { let s = 0; if (t.length >= 8) s++; if (t.length >= 12) s++; if (/[a-z]/.test(t) && /[A-Z]/.test(t)) s++; if (/\d/.test(t)) s++; if (/[^\w]/.test(t)) s++; return `Strength ${s}/5: ${['very weak', 'weak', 'fair', 'good', 'strong', 'very strong'][s]}`; }, 'Abcdef12!xyz', 'Strength 5/5: very strong'),
  tx('entropy', 'Password entropy in bits', (t) => { let pool = 0; if (/[a-z]/.test(t)) pool += 26; if (/[A-Z]/.test(t)) pool += 26; if (/\d/.test(t)) pool += 10; if (/[^a-zA-Z0-9]/.test(t)) pool += 32; return `${(t.length * Math.log2(pool || 1)).toFixed(1)} bits (pool ${pool}, length ${t.length})`; }, 'abcd', '18.8 bits (pool 26, length 4)'),
  tx('bin2dec', 'Binary to decimal', (t) => { if (!/^[01]+$/.test(t.trim())) throw new Error('only 0 and 1'); return String(parseInt(t.trim(), 2)); }, '1010', '10'),
  tx('dec2bin', 'Decimal to binary', (t) => (num(t, 0, 2 ** 40)).toString(2), '10', '1010'),
  tx('dec2hex', 'Decimal to hex', (t) => num(t, 0, 2 ** 48).toString(16).toUpperCase(), '255', 'FF'),
  tx('hex2dec', 'Hex to decimal', (t) => { if (!/^(0x)?[0-9a-f]+$/i.test(t.trim())) throw new Error('not hex'); return String(parseInt(t.trim(), 16)); }, 'ff', '255'),
  tx('dec2oct', 'Decimal to octal', (t) => num(t, 0, 2 ** 48).toString(8), '8', '10'),
  tx('oct2dec', 'Octal to decimal', (t) => { if (!/^[0-7]+$/.test(t.trim())) throw new Error('not octal'); return String(parseInt(t.trim(), 8)); }, '10', '8'),
  tx('basecvt', 'Convert between bases (basecvt <from> <to> <number>)', (t) => { const [f, to, n] = t.split(/\s+/); const F = +f, T = +to; if (!n || ![F, T].every((x) => Number.isInteger(x) && x >= 2 && x <= 36)) throw new Error('use: basecvt <from 2-36> <to 2-36> <number>'); const v = parseInt(n, F); if (Number.isNaN(v)) throw new Error('not a valid number in that base'); return v.toString(T).toUpperCase(); }, '2 16 11111111', 'FF'),
  tx('jwtdecode', 'Decode a JWT header and payload (not verified)', (t) => { const p = t.trim().split('.'); if (p.length < 2) throw new Error('not a JWT'); const d = (x) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return `Header: ${JSON.stringify(d(p[0]))}\nPayload: ${JSON.stringify(d(p[1]))}\nSignature is NOT verified.`; }, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.x', (o) => o.includes('Payload: {"sub":"1"}')),
  tx('dataurl', 'Text to a data: URL', (t) => `data:text/plain;base64,${Buffer.from(t).toString('base64')}`, 'hi', 'data:text/plain;base64,aGk='),
  tx('queryparse', 'Parse URL query parameters', (t) => { const u = new URL(/^https?:/.test(t) ? t : 'http://x/?' + t.replace(/^\?/, '')); const o = [...u.searchParams].map(([k, v]) => `${k} = ${v}`); return o.join('\n') || 'no parameters'; }, 'a=1&b=two', 'a = 1\nb = two'),
  tx('urlparts', 'Split a URL into parts', (t) => { const u = new URL(t); return `Protocol ${u.protocol}\nHost ${u.hostname}\nPort ${u.port || 'default'}\nPath ${u.pathname}\nQuery ${u.search || '-'}\nHash ${u.hash || '-'}`; }, 'https://a.com:8080/x?y=1#z', (o) => o.includes('Host a.com\nPort 8080\nPath /x\nQuery ?y=1\nHash #z')),
  tx('gravatarhash', 'MD5 of a lowercase email', (t) => hash('md5')(t.trim().toLowerCase()), 'A@B.com', hash('md5')('a@b.com')),
  tx('totpwindow', 'Seconds left in the current 30 s code window', () => `${30 - (Math.floor(Date.now() / 1000) % 30)} seconds left in this 30 s window`, '', (o) => /^\d+ seconds left/.test(o), { minArgs: 0, usage: 'totpwindow' }),
  tx('timestampid', 'Sortable time-based ID', () => Date.now().toString(36) + rnd(4, '0123456789abcdefghijklmnopqrstuvwxyz'), '', (o) => /^[0-9a-z]{12,14}$/.test(o), { minArgs: 0, usage: 'timestampid' }),
  tx('nanoid', 'Short random ID (nanoid [length 4-40])', (t) => rnd(t ? num(t, 4, 40) : 12, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'), '8', (o) => o.length === 8, { minArgs: 0, usage: 'nanoid [length]' }),
];
const base1 = E.findIndex((e) => e.name === 'password'); E.splice(base1, 1); // "password" already exists as a command
export default section('Encode & Crypto', E);
