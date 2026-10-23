// .spotify: Spotify metadata parsing (mocked fetch), YouTube matching and the command flow (mocked yt-dlp/ffmpeg/sender).
process.env.PREFIX = '.';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-'));
const sp = await import('../src/downloaders/spotify.js');
const mod = await import('../src/commands/spotify.js');
const cmd = mod.default;

const TRACK_HTML = `<html><head><meta property="og:title" content="Tum Hi Ho"/><meta property="og:description" content="Arijit Singh, Mithoon · Aashiqui 2 · Song · 2013"/>
<meta property="og:restrictions:country:allowed" content="IN"/><meta property="og:image" content="https://i.scdn.co/image/abc"/>
<meta name="music:duration" content="262"/><meta name="music:release_date" content="2013-04-06"/><meta name="music:musician_description" content="Arijit Singh, Mithoon"/></head></html>`;
const embed = (entity) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`;
const PLAYLIST = embed({ type: 'playlist', name: 'Hot Hits Hindi', subtitle: 'Spotify', trackList: Array.from({ length: 14 }, (_, i) => ({ uri: `spotify:track:${String(i).padStart(22, 'a')}`, title: `Song ${i + 1}`, subtitle: 'Arijit Singh,\u00a0Pritam', duration: 200000 + i * 1000 })) });
function mockFetch(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    for (const [re, body, status = 200] of routes) if (re.test(String(url))) {
      const text = typeof body === 'function' ? body(url, opts) : body;
      return { ok: status < 400, status, url: String(url), body: null, text: async () => (typeof text === 'string' ? text : JSON.stringify(text)), json: async () => (typeof text === 'string' ? JSON.parse(text) : text) };
    }
    return { ok: false, status: 404, url: String(url), body: null, text: async () => '' };
  };
  f.calls = calls; return f;
}

test('parses track/album/playlist links, intl paths, URIs; rejects others', () => {
  assert.deepEqual(sp.parseSpotifyLink('https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di?si=x'), { type: 'track', id: '56zZ48jdyY2oDXHVnwg5Di' });
  assert.deepEqual(sp.parseSpotifyLink('https://open.spotify.com/intl-de/album/0Rkv5iqjF2uenfL0OVB8hg'), { type: 'album', id: '0Rkv5iqjF2uenfL0OVB8hg' });
  assert.deepEqual(sp.parseSpotifyLink('spotify:playlist:37i9dQZF1DX0XUfTFmNBRM'), { type: 'playlist', id: '37i9dQZF1DX0XUfTFmNBRM' });
  assert.equal(sp.parseSpotifyLink('https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw'), null);
  assert.equal(sp.parseSpotifyLink('https://evil.com/track/56zZ48jdyY2oDXHVnwg5Di'), null);
  assert.equal(sp.isShortSpotifyLink('https://spotify.link/AbC123'), true);
});

test('getTrack reads title, artists, album, cover, duration from page meta (mocked fetch)', async () => {
  const f = mockFetch([[/open\.spotify\.com\/track\//, TRACK_HTML]]);
  const t = await sp.getTrack('56zZ48jdyY2oDXHVnwg5Di', { fetchImpl: f });
  assert.equal(t.title, 'Tum Hi Ho'); assert.deepEqual(t.artists, ['Arijit Singh', 'Mithoon']);
  assert.equal(t.album, 'Aashiqui 2'); assert.equal(t.duration, 262); assert.equal(t.year, '2013'); assert.equal(t.cover, 'https://i.scdn.co/image/abc');
  assert.match(f.calls[0].opts.headers['User-Agent'], /facebookexternalhit/);
});

test('getTrack falls back to the embed page when the page has no meta', async () => {
  const f = mockFetch([[/open\.spotify\.com\/track\//, '<html></html>'], [/embed\/track/, embed({ type: 'track', title: 'Blinding Lights', artists: [{ name: 'The Weeknd' }], duration: 200040, visualIdentity: { image: [{ url: 'small', maxWidth: 64 }, { url: 'big', maxWidth: 640 }] }, releaseDate: { isoString: '2019-11-29T00:00:00Z' } })]]);
  const t = await sp.getTrack('0VjIjW4GlUZAMYd2vXMi3b', { fetchImpl: f });
  assert.equal(t.title, 'Blinding Lights'); assert.deepEqual(t.artists, ['The Weeknd']); assert.equal(t.duration, 200); assert.equal(t.cover, 'big'); assert.equal(t.year, '2019');
});

test('getTrack throws NOT_FOUND when nothing answers', async () => {
  await assert.rejects(sp.getTrack('x'.repeat(22), { fetchImpl: mockFetch([]) }), (e) => e.code === 'NOT_FOUND');
});

test('getCollection lists the first 10 playlist tracks', async () => {
  const c = await sp.getCollection('playlist', '37i9dQZF1DX0XUfTFmNBRM', { fetchImpl: mockFetch([[/embed\/playlist/, PLAYLIST]]) });
  assert.equal(c.name, 'Hot Hits Hindi'); assert.equal(c.total, 14); assert.equal(c.tracks.length, 10);
  assert.deepEqual(c.tracks[0].artists, ['Arijit Singh', 'Pritam']); assert.equal(c.tracks[0].duration, 200);
  const text = mod.formatList(c, '.');
  assert.match(text, /^📃 \*Hot Hits Hindi\*/); assert.match(text, /10\. Song 10/); assert.match(text, /4 more/); assert.match(text, /\.spotify <number>/);
});

test('optional API search is skipped without env and used with client credentials', async () => {
  assert.equal(await sp.apiSearch('x', { env: {}, fetchImpl: mockFetch([]) }), null);
  sp._resetToken();
  const f = mockFetch([[/accounts\.spotify\.com/, { access_token: 'T', expires_in: 3600 }], [/api\.spotify\.com\/v1\/search/, { tracks: { items: [{ id: 'abc', name: 'Kesariya', artists: [{ name: 'Arijit Singh' }], album: { name: 'Brahmastra', images: [{ url: 'img', width: 640 }], release_date: '2022-07-17' }, duration_ms: 268000, external_urls: { spotify: 'https://open.spotify.com/track/abc' } }] } }]]);
  const r = await sp.apiSearch('kesariya', { env: { SPOTIFY_CLIENT_ID: 'a', SPOTIFY_CLIENT_SECRET: 'b' }, fetchImpl: f });
  assert.equal(r.title, 'Kesariya'); assert.equal(r.album, 'Brahmastra'); assert.equal(r.duration, 268); assert.equal(r.year, '2022');
  assert.equal(f.calls[1].opts.headers.Authorization, 'Bearer T');
});

test('matching prefers the closest duration from the right artist over covers and videos', () => {
  const track = { title: 'Blinding Lights', artists: ['The Weeknd'], duration: 200 };
  const c = sp.parseCandidates(['4NRXx6U8ABQ\t263\tThe Weeknd\tThe Weeknd - Blinding Lights (Official Video)', 'aaaaaaaaaaa\t201\tSomeone\tBlinding Lights (slowed + reverb)', 'fHI8X4OXluQ\t204\tThe Weeknd\tThe Weeknd - Blinding Lights (Official Audio)', 'bad line'].join('\n'));
  assert.equal(c.length, 3);
  assert.equal(sp.pickBest(c, track).id, 'fHI8X4OXluQ');
  assert.equal(sp.fmtDuration(262), '4:22'); assert.equal(sp.fmtDuration(3725), '1:02:05');
});

test('mp3 args: 192k mp3, front cover attached, tags written, input tags dropped', () => {
  const a = mod.mp3Args({ input: 'in.m4a', cover: 'c.jpg', output: 'o.mp3', bitrate: '192k', t: { title: 'Tum Hi Ho', artists: ['Arijit Singh', 'Mithoon'], album: 'Aashiqui 2', year: '2013' } });
  const j = a.join(' ');
  assert.match(j, /-map 1:0/); assert.match(j, /attached_pic/); assert.match(j, /libmp3lame -b:a 192k/); assert.match(j, /-map_metadata -1/);
  assert.ok(a.includes('artist=Arijit Singh, Mithoon')); assert.ok(a.includes('album=Aashiqui 2')); assert.equal(a.at(-1), 'o.mp3');
  assert.ok(!mod.mp3Args({ input: 'i', cover: null, output: 'o', bitrate: '128k', t: { title: 'x' } }).includes('attached_pic'));
});

function ctx(args, { jid = '120363000000000099@g.us', sender = '933333333333' } = {}) {
  const out = []; const sent = [];
  return { out, sent, jid, isGroup: jid.endsWith('@g.us'), sender, args, msg: { key: { id: 'q' } }, sock: {}, reply: async (t) => { out.push(String(t)); return {}; } };
}
function stubDeps({ size = 1000 } = {}) {
  const saved = { ...mod.deps }; const log = { yt: [], ff: [], sent: [], meta: [] };
  Object.assign(mod.deps, {
    getTrack: async (id) => ({ id, url: `https://open.spotify.com/track/${id}`, title: 'Tum Hi Ho', artists: ['Arijit Singh', 'Mithoon'], album: 'Aashiqui 2', cover: 'https://i.scdn.co/image/abc', duration: 262, year: '2013' }),
    getCollection: async (type) => ({ type, name: 'Hot Hits Hindi', owner: 'Spotify', total: 2, tracks: [{ id: 'a'.repeat(22), title: 'One', artists: ['A'], duration: 100 }, { id: 'b'.repeat(22), title: 'Two', artists: ['B'], duration: 120 }] }),
    apiSearch: async () => null,
    freeDiskBytes: async () => 1e12,
    runYtDlp: async (args, opts) => {
      log.yt.push(args);
      if (String(args[0]).startsWith('ytsearch')) return { stdout: 'BjL7AuPsmEk\t263\tArijit Singh\tTum Hi Ho\nUmqb9KENgmk\t268\tT-Series\tTum Hi Ho full song\n' };
      if (String(args[0]).includes('music.youtube.com')) return { stdout: 'J7p4bzqLvCw\tNA\tNA\tBlinding Lights\n' };
      fs.writeFileSync(path.join(opts.cwd, 'src.m4a'), 'x');
      return { stdout: 'Blinding Lights\tThe Weeknd\tAfter Hours\t200\thttps://i.ytimg.com/vi/J7p4bzqLvCw/maxresdefault.jpg\tBlinding Lights\t2020\n' };
    },
    download: async (u, file) => { fs.writeFileSync(file, 'img'); },
    ffmpeg: async (args) => { log.ff.push(args); fs.writeFileSync(args.at(-1), Buffer.alloc(args.at(-1).endsWith('.mp3') ? size : 10)); },
    sendMediaFile: async (sock, jid, file, quoted, caption) => { log.sent.push({ type: file.type, mimetype: file.mimetype, fileName: file.fileName, caption, exists: fs.existsSync(file.path) }); },
  });
  return { log, restore: () => Object.assign(mod.deps, saved) };
}

test('.spotify with no args shows usage; alias spdl; Downloaders category; no owner gate', async () => {
  assert.deepEqual(cmd.aliases, ['spdl']); assert.equal(cmd.category, 'Downloaders'); assert.equal(cmd.ownerOnly, undefined);
  const c = ctx([]); await cmd.run(c); assert.match(c.out[0], /Spotify downloader/);
});

test('track link in a group: matches by duration, sends cover+caption then MP3 audio, cleans temp files', async () => {
  const { log, restore } = stubDeps();
  try {
    const c = ctx(['https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di']); await cmd.run(c);
    assert.match(c.out[0], /Tum Hi Ho - Arijit Singh, Mithoon/);
    const dl = log.yt.find((a) => a.includes('--no-simulate'));
    assert.ok(dl.at(-1).endsWith('BjL7AuPsmEk'));
    assert.equal(log.sent.length, 2);
    assert.equal(log.sent[0].type, 'image'); assert.match(log.sent[0].caption, /Tum Hi Ho[\s\S]*Arijit Singh, Mithoon[\s\S]*Aashiqui 2[\s\S]*4:22/);
    assert.equal(log.sent[1].type, 'audio'); assert.equal(log.sent[1].mimetype, 'audio/mpeg'); assert.equal(log.sent[1].fileName, 'Arijit Singh Mithoon - Tum Hi Ho.mp3');
    const mp3Call = log.ff.find((a) => a.at(-1).endsWith('song.mp3'));
    assert.ok(!fs.existsSync(path.dirname(mp3Call.at(-1))), 'job dir removed');
  } finally { restore(); }
});

test('over 16 MB goes as a document with the caption', async () => {
  const { log, restore } = stubDeps({ size: 17 * 1048576 });
  try {
    const c = ctx(['https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di'], { sender: '944444444444' }); await cmd.run(c);
    assert.equal(log.sent.length, 1); assert.equal(log.sent[0].type, 'document'); assert.match(log.sent[0].caption, /over 16 MB/);
  } finally { restore(); }
});

test('song name in a DM: YouTube Music search, tags filled from the YouTube Music track', async () => {
  const { log, restore } = stubDeps();
  try {
    const c = ctx(['blinding', 'lights'], { jid: '955555555555@s.whatsapp.net', sender: '955555555555' }); await cmd.run(c);
    assert.match(c.out[0], /Searching YouTube Music/);
    assert.ok(log.yt[0][0].startsWith('https://music.youtube.com/search?q=blinding%20lights'));
    assert.match(log.sent[0].caption, /Blinding Lights[\s\S]*The Weeknd[\s\S]*After Hours[\s\S]*3:20/);
    const mp3Call = log.ff.find((a) => a.at(-1).endsWith('song.mp3'));
    assert.ok(mp3Call.includes('artist=The Weeknd'));
  } finally { restore(); }
});

test('playlist link lists tracks; .spotify <n> downloads that one; out-of-range is refused; lists are per user', async () => {
  const { log, restore } = stubDeps();
  try {
    const c = ctx(['https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM'], { sender: '966666666666' }); await cmd.run(c);
    assert.match(c.out[0], /Hot Hits Hindi[\s\S]*1\. One - A[\s\S]*2\. Two - B/);
    assert.equal(log.sent.length, 0);
    const bad = ctx(['5'], { sender: '966666666666' }); await cmd.run(bad); assert.match(bad.out[0], /1 to 2/);
    const pick = ctx(['2'], { sender: '966666666666' }); await cmd.run(pick);
    assert.equal(log.sent.filter((s) => s.type === 'audio').length, 1);
    const other = mod.getList(ctx([], { sender: '977777777777' })); assert.equal(other, null);
  } finally { restore(); }
});

test('artist/podcast links get a clear message', async () => {
  const c = ctx(['https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw']); await cmd.run(c);
  assert.match(c.out[0], /track\*, \*album\* or \*playlist/);
});
