/** Display name for the dashboard activity list. Never a phone number: digit-heavy names fall back to a generic label. */
export function cleanWho(name, isOwner = false) {
  const n = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const digits = n.replace(/\D/g, '').length;
  if (!n || digits >= 6 || /@/.test(n)) return isOwner ? 'Owner' : 'Someone';
  return n;
}
