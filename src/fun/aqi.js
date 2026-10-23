import { getJson } from './limiter.js';
export const BANDS = [[50, '🟢 Good'], [100, '🟡 Moderate'], [150, '🟠 Unhealthy for sensitive groups'], [200, '🔴 Unhealthy'], [300, '🟣 Very unhealthy'], [Infinity, '🟤 Hazardous']];
export const band = (n) => BANDS.find(([max]) => n <= max)[1];
export async function getAqi(city, { fetchImpl = fetch } = {}) {
  const name = String(city || 'Kolkata').trim().slice(0, 60) || 'Kolkata';
  const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`, 12000, fetchImpl);
  const p = g.results?.[0]; if (!p) return null;
  const a = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}&current=us_aqi,pm10,pm2_5&timezone=auto`, 12000, fetchImpl);
  const c = a.current; if (!c || c.us_aqi == null) return null;
  return { place: [p.name, p.admin1, p.country].filter(Boolean).join(', '), aqi: Math.round(c.us_aqi), pm25: c.pm2_5, pm10: c.pm10 };
}
export const formatAqi = (r) => `🌫️ *Air quality - ${r.place}*\nUS AQI: *${r.aqi}* ${band(r.aqi)}\nPM2.5: ${r.pm25} µg/m³\nPM10: ${r.pm10} µg/m³\n_Modelled estimate (Open-Meteo/CAMS), may differ from local stations._`;
