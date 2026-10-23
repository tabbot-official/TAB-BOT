export const MAX_IN = 300;
const EMOJI = /\p{Extended_Pictographic}/gu;
export const emojiCount = (s) => (String(s).match(EMOJI) || []).length;
export const isMostlyEmoji = (s) => { const t = String(s).replace(/\s/g, ''); return t.length > 0 && emojiCount(t) >= Math.max(2, Math.floor([...t].length * 0.4)); };
export function encodePrompt(text) {
  return 'Translate this text into emojis only, like a fun emoji puzzle: use 1 to 3 emojis per important word, keep the meaning guessable, no letters, no explanation, family-friendly.\nText: "' + text.replace(/"/g, "'") + '"\nOutput only the emojis.';
}
export function decodePrompt(emo) {
  return 'Decode this emoji message into a short natural sentence in the most likely language (Hinglish if it looks Indian). Family-friendly. Output only the sentence.\nEmojis: ' + emo;
}
export function cleanEncoded(out) {
  const t = String(out || '').replace(/[^\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\s]/gu, '').replace(/[ \t]+/g, ' ').trim();
  return emojiCount(t) >= 1 ? t.slice(0, 600) : null;
}
