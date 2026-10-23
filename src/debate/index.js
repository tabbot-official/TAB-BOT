export const MAX_TOPIC = 140;
const BLOCK = /\b(sex|porn|nude|suicide|self.?harm|kill (him|her|them|myself)|terror|rape|nazi|racist)\b/i;
export function cleanTopic(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC); }
export function allowed(topic) { return topic.length >= 3 && !BLOCK.test(topic); }
export function buildPrompt(topic, lang) {
  return `Run a fun, friendly debate on this topic: "${topic}".\n` +
    'Format exactly:\n🔵 *Team For* (3 short bullet arguments, one line each)\n🔴 *Team Against* (3 short bullet arguments, one line each)\n' +
    '🥊 *Rebuttals* (one line from each side answering the other)\n⚖️ *Verdict* (a playful judge picks a winner in 2 lines, and says why)\n' +
    `Keep the whole answer under 1400 characters, plain text with *bold* only for headings, family-friendly, no personal attacks, no real named people being insulted. ` +
    (lang ? `Reply in ${lang}. ` : 'Reply in the same language as the topic (Hinglish if the topic is Hinglish). ') +
    'If the topic is hateful, sexual, violent or about self-harm, reply only: "Pick a lighter topic 🙂".';
}
