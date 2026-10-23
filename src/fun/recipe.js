import { getJson } from './limiter.js';
const BASE = { food: 'https://www.themealdb.com/api/json/v1/1/', drink: 'https://www.thecocktaildb.com/api/json/v1/1/' };
export async function findRecipe(query, { kind = 'food', fetchImpl = fetch } = {}) {
  const q = String(query || '').trim().slice(0, 60);
  const j = await getJson(BASE[kind] + (q ? 'search.php?s=' + encodeURIComponent(q) : 'random.php'), 12000, fetchImpl);
  const m = (j.meals || j.drinks || [])[0];
  if (!m) return null;
  const ing = [];
  for (let i = 1; i <= 20; i++) { const n = (m['strIngredient' + i] || '').trim(); if (n) ing.push(`${(m['strMeasure' + i] || '').trim()} ${n}`.trim()); }
  return { title: m.strMeal || m.strDrink, area: m.strArea || m.strCategory || '', category: m.strCategory || '', ing, steps: (m.strInstructions || '').replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim(), image: m.strMealThumb || m.strDrinkThumb || '', kind };
}
export function formatRecipe(r) {
  let s = r.steps; if (s.length > 1400) s = s.slice(0, 1400).replace(/\s+\S*$/, '') + '…';
  return `${r.kind === 'drink' ? '🍹' : '🍽️'} *${r.title}*${r.area ? ` (${r.area})` : ''}\n\n*Ingredients*\n${r.ing.map((x) => '• ' + x).join('\n')}\n\n*Method*\n${s}`;
}
