// Portal OTP / S-ID delivery through the bot's own WhatsApp session. Fixed wording only: the portal can send a 6-digit code or an S-ID, never free text.
let send = async () => false; const last = new Map();
export const setOtpSender = (fn) => { send = fn; };
export async function sendPortalOtp(number, code, now = Date.now(), sid = '') {
  const okCode = /^\d{6}$/.test(code || ''), okSid = /^S-[A-Z0-9]{6}$/.test(sid || '');
  if (!/^[1-9]\d{9,14}$/.test(number) || okCode === okSid) return {sent: false, why: 'invalid'};
  if (now - (last.get(number) || 0) < 20000) return {sent: false, why: 'rate'};
  last.set(number, now); if (last.size > 2000) for (const [k, t] of last) if (now - t > 60000) last.delete(k);
  return {sent: !!(await send(number, okSid ? {sid} : {code}))};
}
