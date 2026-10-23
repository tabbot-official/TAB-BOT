import { getJson } from './limiter.js';
export async function pincodeLookup(pin, { fetchImpl = fetch } = {}) {
  const p = String(pin || '').trim();
  if (!/^[1-9]\d{5}$/.test(p)) return { error: 'BAD' };
  const j = await getJson('https://api.postalpincode.in/pincode/' + p, 12000, fetchImpl);
  const e = Array.isArray(j) ? j[0] : null;
  if (!e || e.Status !== 'Success' || !e.PostOffice?.length) return { error: 'NONE' };
  return { pin: p, offices: e.PostOffice };
}
export function formatPincode(r) {
  const o = r.offices[0];
  const names = r.offices.slice(0, 8).map((x) => x.Name).join(', ');
  return `📮 *PIN ${r.pin}*\n📍 ${o.District}, ${o.State}\nRegion: ${o.Region || '-'} · Division: ${o.Division || '-'}\nPost offices (${r.offices.length}): ${names}${r.offices.length > 8 ? '…' : ''}`;
}
export async function ifscLookup(code, { fetchImpl = fetch } = {}) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(c)) return { error: 'BAD' };
  try { return { bank: await getJson('https://ifsc.razorpay.com/' + c, 12000, fetchImpl) }; }
  catch (e) { if (/404/.test(e.message)) return { error: 'NONE' }; throw e; }
}
export const formatIfsc = ({ bank: b }) => [`🏦 *${b.BANK}*`, `IFSC: ${b.IFSC}`, b.MICR && `MICR: ${b.MICR}`, `Branch: ${b.BRANCH}`, `Address: ${b.ADDRESS}`, `${b.CITY}, ${b.STATE}`, b.CONTACT && `Phone: ${b.CONTACT}`,
  `UPI: ${b.UPI ? '✅' : '❌'}  NEFT: ${b.NEFT ? '✅' : '❌'}  RTGS: ${b.RTGS ? '✅' : '❌'}  IMPS: ${b.IMPS ? '✅' : '❌'}`].filter(Boolean).join('\n');
