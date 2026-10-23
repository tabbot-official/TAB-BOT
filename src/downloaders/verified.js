// Result of the real per-platform check (2026-10-10, one public sample link each, true download through the bot pipeline, from the build server).
// WORKING = real media file downloaded. PREVIEW = only the public preview image. BLOCKED = site refused this server (anti-bot / 403 / 412). BROKEN = extractor or sample failed. UNTESTED = no usable public sample link found.
export const VERIFIED = {
  bandlab: 'WORKING', bluesky: 'WORKING', kickcom: 'WORKING', steam: 'WORKING', weibo: 'WORKING', zhihu: 'WORKING', flickr: 'WORKING', moj: 'WORKING',
  lemon8: 'PREVIEW', minds: 'PREVIEW', niconico: 'PREVIEW',
  gab: 'BLOCKED', bilibili: 'BLOCKED', douyin: 'BLOCKED', smule: 'BLOCKED', clapper: 'BLOCKED', cara: 'BLOCKED', douban: 'BLOCKED', mixcloud: 'BLOCKED',
  audiomack: 'BROKEN', xiaohongshu: 'BROKEN', xbox: 'BROKEN',
};
export const statusOf = (name) => VERIFIED[name] || 'UNTESTED';
