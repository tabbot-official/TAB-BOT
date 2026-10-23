import config from '../config/config.js';
import { downloadQueue } from '../utils/downloader.js';

export function limitsText(cfg = config, st = { mine: 0 }, prefix = '/') {
  const l = cfg.limits;
  const mb = (b) => Math.round(b / 1048576);
  return [
    '📏 *Bot limits*',
    `Command cooldown: ${Math.round(l.cooldownMs / 1000)} s between commands`,
    `Downloads: up to ${l.maxJobsPerUser} at once per person, queue holds ${l.maxQueue}`,
    `Max file size: ${mb(l.maxFileBytes)} MB`,
    `Max video quality: ${l.maxVideoHeight}p`,
    `Max download time: ${Math.round(l.maxDownloadSeconds / 60 * 10) / 10} min`,
    `AI video: 2 per 10 minutes per person`,
    `Cricket: 6 requests per minute`,
    '',
    `Your downloads right now: ${st.mine || 0} of ${l.maxJobsPerUser}`,
    `_See ${prefix}queue for your place in line. The owner can change these limits._`,
  ].join('\n');
}
export default {
  name: 'limits', aliases: ['quota', 'mylimits'], category: 'General',
  description: 'See the bot limits and your usage',
  usage: 'limits',
  minArgs: 0,
  async run(ctx) { return ctx.reply(limitsText(config, downloadQueue.userStatus(ctx.sender), config.prefix)); },
};
