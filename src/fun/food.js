import { getJson } from './limiter.js';
export async function findFood(query, { fetchImpl = fetch } = {}) {
  const q = String(query || '').trim().slice(0, 60);
  let p;
  if (/^\d{8,14}$/.test(q)) { const j = await getJson('https://world.openfoodfacts.org/api/v2/product/' + q + '.json', 15000, fetchImpl); p = j.status === 1 ? j.product : null; }
  else {
    const fields = 'product_name,brands,nutriscore_grade,nova_group,nutriments,ingredients_text,image_front_small_url,quantity';
    try { const j = await getJson('https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&page_size=5&search_simple=1&fields=' + fields + '&search_terms=' + encodeURIComponent(q), 20000, fetchImpl); p = (j.products || []).find((x) => x.product_name && x.nutriments); }
    catch { // the main search is sometimes overloaded (503): use the second search endpoint
      const j = await getJson('https://search.openfoodfacts.org/search?page_size=5&fields=' + fields + '&q=' + encodeURIComponent(q), 20000, fetchImpl);
      p = (j.hits || []).map((x) => ({ ...x, brands: Array.isArray(x.brands) ? x.brands.join(', ') : x.brands })).find((x) => x.product_name && x.nutriments);
    }
  }
  if (!p || !p.product_name) return null;
  return p;
}
const v = (x, u = 'g') => (x == null || x === '' ? '-' : `${Math.round(Number(x) * 10) / 10}${u}`);
export function formatFood(p) {
  const n = p.nutriments || {};
  const ns = p.nutriscore_grade && /^[a-e]$/i.test(p.nutriscore_grade) ? p.nutriscore_grade.toUpperCase() : null;
  const nova = p.nova_group ? ['', 'unprocessed', 'processed ingredient', 'processed', 'ultra-processed'][p.nova_group] : null;
  let ing = String(p.ingredients_text || '').replace(/\s+/g, ' ').trim(); if (ing.length > 300) ing = ing.slice(0, 300) + '…';
  return [`🥫 *${p.product_name}*${p.brands ? ' - ' + String(p.brands).split(',')[0] : ''}${p.quantity ? ` (${p.quantity})` : ''}`, '*Per 100 g*',
    `Energy: ${v(n['energy-kcal_100g'], ' kcal')}  Protein: ${v(n.proteins_100g)}`, `Carbs: ${v(n.carbohydrates_100g)} (sugar ${v(n.sugars_100g)})`, `Fat: ${v(n.fat_100g)} (saturated ${v(n['saturated-fat_100g'])})  Salt: ${v(n.salt_100g)}`,
    ns && `Nutri-Score: *${ns}* (A best, E worst)`, nova && `Processing: ${nova}`, ing && `\nIngredients: ${ing}`, '_Data from Open Food Facts, crowd-sourced; check the pack._'].filter(Boolean).join('\n');
}
