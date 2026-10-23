// Feedback text rules shared by the sender (bot) and the receiver (collector). Phone numbers and e-mail addresses are removed before sending.
export const MIN = 10;
export const MAX = 500;
export const FB_KEYS = ['v', 'k', 'id', 't'];
export function clean(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\+?\d[\d ()\-.]{6,}\d/g, '[number removed]').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email removed]').replace(/\s+/g, ' ').trim().slice(0, MAX);
}
export const valid = (text) => { const c = clean(text); return c.length >= MIN ? c : null; };
