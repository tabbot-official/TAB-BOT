// Layered phone number lookup: offline parsing + WhatsApp presence + search links. Third-party APIs are separate and opt-in.
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const names = new Intl.DisplayNames(['en'], { type: 'region' });
const TYPE = { MOBILE: 'Mobile', FIXED_LINE: 'Landline', FIXED_LINE_OR_MOBILE: 'Mobile or landline', VOIP: 'VoIP (internet number)', TOLL_FREE: 'Toll free', PREMIUM_RATE: 'Premium rate', SHARED_COST: 'Shared cost', PERSONAL_NUMBER: 'Personal number', PAGER: 'Pager', UAN: 'Company number', VOICEMAIL: 'Voicemail' };
const flag = (cc) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '');

export function parseNumber(input, defaultRegion = 'IN') {
  const raw = String(input || '').trim();
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 6) return null;
  const p = parsePhoneNumberFromString(digits.startsWith('+') ? digits : (raw.startsWith('00') ? '+' + digits.slice(2) : digits), digits.startsWith('+') || raw.startsWith('00') ? undefined : defaultRegion)
    || parsePhoneNumberFromString('+' + digits.replace(/\D/g, ''));
  if (!p) return null;
  const type = p.getType();
  const lines = {
    e164: p.number,
    international: p.formatInternational(),
    national: p.formatNational(),
    country: p.country || null,
    countryName: p.country ? names.of(p.country) : null,
    flag: flag(p.country),
    callingCode: p.countryCallingCode,
    valid: p.isValid(),
    possible: p.isPossible(),
    type: type ? TYPE[type] || type : null,
  };
  return lines;
}

export function searchLinks(e164) {
  const n = e164.replace('+', '');
  const q = encodeURIComponent(`"${e164}" OR "${n}"`);
  return [
    ['Google', `https://www.google.com/search?q=${q}`],
    ['Truecaller', `https://www.truecaller.com/search/${'in'}/${n.slice(-10)}`],
    ['Sync.me', `https://sync.me/search/?number=${n}`],
    ['Facebook', `https://www.facebook.com/search/top?q=${encodeURIComponent(e164)}`],
    ['Spam reports', `https://www.google.com/search?q=${encodeURIComponent(`"${e164}" spam OR scam OR fraud`)}`],
  ];
}

export function carrierNote(info) {
  if (info?.country === 'IN') return 'India: the original operator, may have ported (number portability), cannot be read offline.';
  return null;
}
