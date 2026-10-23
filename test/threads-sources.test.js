// .threads sources: the post page first, sssthreads second; a profile picture is never sent.
import './_prefix.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { mediaFromJson, mediaFromHtml, shortcodeOf, isAvatarUrl } = await import('../src/downloaders/threadsDirect.js');
const { threadsMedia } = await import('../src/packs/x_zenbot.js');

const AV = 'https://scontent.cdninstagram.com/v/t51.2885-19/1_n.jpg?stp=dst-jpg_s150x150';
const post = { code: 'ABC123', media_type: 8, image_versions2: { candidates: [] }, carousel_media: [
  { code: 'x1', video_versions: [{ url: 'https://cdn/v1.mp4' }], image_versions2: { candidates: [{ url: 'https://cdn/t1.jpg', width: 10, height: 10 }] } },
  { code: 'x2', image_versions2: { candidates: [{ url: 'https://cdn/small.jpg', width: 100, height: 100 }, { url: 'https://cdn/big.jpg', width: 1080, height: 1350 }] } },
] };

test('shortcodeOf reads threads.net and threads.com post links', () => {
  assert.equal(shortcodeOf('https://www.threads.net/@a/post/DE-efFqyStv'), 'DE-efFqyStv');
  assert.equal(shortcodeOf('https://www.threads.com/@a/post/Dcd8qfSEbEV/some-slug?x=1'), 'Dcd8qfSEbEV');
  assert.equal(shortcodeOf('https://example.com/@a/post/ABCDE'), null);
});

test('mediaFromJson takes the right post, carousel items in order, biggest image', () => {
  const root = { data: { replies: [{ code: 'OTHER', video_versions: [{ url: 'https://cdn/wrong.mp4' }], media_type: 2 }], post } };
  assert.deepEqual(mediaFromJson(root, 'ABC123').map((x) => [x.type, x.url]), [['video', 'https://cdn/v1.mp4'], ['image', 'https://cdn/big.jpg']]);
  assert.deepEqual(mediaFromJson({ code: 'T', media_type: 19, image_versions2: { candidates: [] } }, 'T'), []);
});

test('mediaFromHtml reads the JSON script tags of the page', () => {
  const html = `<script type="application/json" data-sjs>{"x":1}</script><script type="application/json" nonce="n">${JSON.stringify({ a: [post] })}</script>`;
  assert.equal(mediaFromHtml(html, 'ABC123').length, 2);
});

test('avatar urls are recognised', () => { assert.ok(isAvatarUrl(AV)); assert.ok(!isAvatarUrl('https://cdn/v/t51.71878-15/x.jpg')); });

test('threadsMedia: post page first', async () => {
  const r = await threadsMedia('u', { direct: async () => [{ type: 'video', url: 'https://cdn/a.mp4' }], sss: async () => { throw new Error('should not run'); }, pause: 0 });
  assert.equal(r.via, 'threads.com');
});

test('threadsMedia: falls back to sssthreads, skipping avatar answers', async () => {
  let n = 0;
  const r = await threadsMedia('u', { direct: async () => { throw new Error('no media'); }, sss: async () => (++n === 1 ? { type: 'video', url: AV } : { type: 'video', url: 'https://cdn/real.mp4' }), pause: 0 });
  assert.deepEqual(r, { items: [{ type: 'video', url: 'https://cdn/real.mp4' }], via: 'sssthreads' });
});

test('threadsMedia: only avatars anywhere is an error, never a profile picture', async () => {
  await assert.rejects(threadsMedia('u', { direct: async () => [{ type: 'image', url: AV }], sss: async () => ({ type: 'video', url: AV }), pause: 0 }), /avatar/);
});
