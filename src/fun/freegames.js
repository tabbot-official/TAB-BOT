import { getJson } from './limiter.js';
const URL_ = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-IN&country=IN&allowCountries=IN';
const offer = (e, key) => (e.promotions?.[key] || []).flatMap((p) => p.promotionalOffers || []).find((o) => o.discountSetting?.discountPercentage === 0);
const slug = (e) => e.offerMappings?.[0]?.pageSlug || e.productSlug?.replace(/\/home$/, '') || e.urlSlug;
export function parseFree(j) {
  const els = j?.data?.Catalog?.searchStore?.elements || [];
  const map = (key) => els.map((e) => ({ e, o: offer(e, key) })).filter((x) => x.o).map(({ e, o }) => ({ title: e.title, start: o.startDate, end: o.endDate, url: slug(e) ? 'https://store.epicgames.com/en-US/p/' + slug(e) : '' }));
  return { now: map('promotionalOffers'), next: map('upcomingPromotionalOffers') };
}
export const getFreeGames = async ({ fetchImpl = fetch } = {}) => parseFree(await getJson(URL_, 12000, fetchImpl));
const d = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
export function formatFree(r) {
  const row = (g) => `• *${g.title}* (until ${d(g.end)})${g.url ? '\n  ' + g.url : ''}`;
  const nxt = (g) => `• *${g.title}* (from ${d(g.start)})`;
  if (!r.now.length && !r.next.length) return '🎮 No free Epic games listed right now.';
  return '🎮 *Free on Epic Games Store*\n\n' + (r.now.length ? r.now.map(row).join('\n') : 'Nothing free right now.') + (r.next.length ? '\n\n*Coming next*\n' + r.next.map(nxt).join('\n') : '');
}
