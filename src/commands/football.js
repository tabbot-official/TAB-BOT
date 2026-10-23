// FOOTBALL: live scores + fixtures from football-data.org free tier (10 calls/min).
// Needs FOOTBALL_DATA_API_KEY in the env. Cached 60s to stay inside the free quota.
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { featOn } from '../config/features.js';

const cache = new Map();
const cached = async (k, ttlMs, fn) => {
  const c = cache.get(k);
  if (c && Date.now() - c.t < ttlMs) return c.v;
  const v = await fn();
  cache.set(k, { t: Date.now(), v });
  if (cache.size > 30) cache.clear();
  return v;
};
const fmt = (m) => {
  const score = m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'FINISHED'
    ? ` ${m.score.fullTime.home ?? m.score.halfTime.home ?? 0}-${m.score.fullTime.away ?? m.score.halfTime.away ?? 0}` : '';
  const when = m.status === 'IN_PLAY' ? ' (LIVE ' + (m.minute || '') + "')" : m.status === 'FINISHED' ? ' (FT)' : ' - ' + new Date(m.utcDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `• ${m.homeTeam.shortName || m.homeTeam.name}${score} ${m.awayTeam.shortName || m.awayTeam.name}${when}`;
};

export default {
  name: 'football', aliases: ['epl', 'laliga', 'soccer'], category: 'Info',
  description: 'Live scores and upcoming matches (football-data.org)',
  usage: 'football [live|today|epl|laliga|ucl|wc]',
  async run(ctx) {
    if (!featOn('football')) return ctx.reply('Football scores are turned off right now.');
    const key = process.env.FOOTBALL_DATA_API_KEY;
    if (!key) return ctx.reply('Football scores are not set up yet. Ask my owner to add the API key.');
    const MAP = { epl: 'PL', laliga: 'PD', ucl: 'CL', wc: 'WC', bundesliga: 'BL1', seriea: 'SA' };
    const arg = (ctx.args[0] || 'today').toLowerCase();
    try {
      let url, title;
      if (arg === 'live') { url = 'https://api.football-data.org/v4/matches?status=LIVE'; title = '⚽ Live matches'; }
      else if (MAP[arg]) { url = `https://api.football-data.org/v4/competitions/${MAP[arg]}/matches?status=SCHEDULED&limit=10`; title = '⚽ Upcoming - ' + arg.toUpperCase(); }
      else { url = 'https://api.football-data.org/v4/matches'; title = '⚽ Matches today'; }
      const data = await cached(url, 60000, async () => {
        const r = await fetch(url, { headers: { 'X-Auth-Token': key }, signal: AbortSignal.timeout(15000) });
        if (r.status === 429) throw new Error('Rate limit hit - try again in a minute.');
        if (!r.ok) throw new Error('API error ' + r.status);
        return r.json();
      });
      const matches = (data.matches || []).slice(0, 12);
      if (!matches.length) return ctx.reply(arg === 'live' ? 'No live matches right now.' : 'No matches found. Try /football epl or /football ucl.');
      return ctx.reply('*' + title + '*\n\n' + matches.map(fmt).join('\n'));
    } catch (e) {
      logger.warn('[football] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ ' + (e?.message || 'Scores are not available right now.'));
    }
  },
};
