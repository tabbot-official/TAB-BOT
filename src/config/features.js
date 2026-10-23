// Per-module feature flags. Default: everything on.
// Disable without redeploy: set JARVIS_FEAT_<NAME>=off in the panel .env and restart.
// Example: JARVIS_FEAT_VOICE=off turns off Voice Mode if RAM gets tight.
const FLAGS = ['agent', 'memory', 'automod', 'automation', 'voice', 'plugins',
  'vision', 'askpdf', 'weatheralert', 'newsdigest', 'split', 'habit', 'flashcard', 'typerace', 'pricealert', 'wordoftheday', 'catchup', 'dlqueue',
  'fancy', 'morse', 'ipinfo', 'afk', 'vcf', 'handwrite',
  'telesticker', 'mega', 'antiedit', 'menuvid', 'logofx', 'clan',
  'uno', 'pets', 'werewolf', 'statusreact', 'anticall', 'autobio',
  'joinreq', 'rpg', 'antilinkx', 'antipromote', 'privacy', 'gitclone',
  'mediafire', 'emojimix', 'autoreact', 'runcode', 'webinspect', 'getdevice',
  'getabout', 'rankcard', 'autosticker', 'football', 'stickersearch', 'numerology', 'colorcode', 'ownershell'];
export function featOn(name) {
  const v = String(process.env['JARVIS_FEAT_' + String(name).toUpperCase()] ?? 'on').trim().toLowerCase();
  return !['off', '0', 'false', 'no'].includes(v);
}
export function featList() {
  return FLAGS.map((n) => n + '=' + (featOn(n) ? 'on' : 'off')).join(' ');
}
export function featReply(ctx, name) {
  return ctx.reply('This feature (' + name + ') is turned off on the bot right now. Ask the owner to enable it.');
}
