// Style-clone helpers: build the prompt from the owner's own sample messages and keep replies safe.
export const TAG = ' 🤖';
const URL_RE = /https?:\/\/|www\./i;
export function cleanSample(t) {
  const c = String(t || '').replace(/\s+/g, ' ').trim();
  if (c.length < 2 || c.length > 200 || URL_RE.test(c) || /\d{6,}/.test(c)) return null;
  return c;
}
/** Messages the clone must not answer: money, codes, credentials, emergencies. The plain busy message goes out instead. */
export function isRisky(text) {
  return /\b(otp|pin|password|cvv|upi|bank|account number|transfer|send money|paytm|gpay|phonepe|loan|emergency|accident|hospital|urgent)\b|(?:₹|rs\.?|\$)\s?\d|\b\d{4,6}\b/i.test(String(text || ''));
}
export function styledPrompt(samples, incoming) {
  return 'You are replying on behalf of the owner of this phone, who is busy. Copy his texting style (language mix, length, slang, emoji use, punctuation) from his real messages below.\n' +
    'His messages:\n' + samples.slice(-25).map((x) => '- ' + x).join('\n') + '\n\n' +
    'Rules: reply in 1 or 2 short lines like him. Say he is busy and will reply properly later if a real answer is needed. Never promise anything, never agree to meet, pay, lend or share any detail, never give personal information, and never write numbers, links or codes. ' +
    'If the message is rude, sexual or odd, only say he will reply later. Output only the reply text.\n\n' +
    'Message to answer: "' + String(incoming || '').slice(0, 300).replace(/"/g, "'") + '"';
}
export function tidyReply(t, tag = true) {
  let o = String(t || '').replace(/^["'\s]+|["'\s]+$/g, '').replace(/\n{2,}/g, '\n').slice(0, 220);
  if (!o || URL_RE.test(o) || /\d{5,}/.test(o)) return null;
  return tag ? o + TAG : o;
}
