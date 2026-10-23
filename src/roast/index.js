export const MAX_SONGS = 30;
export const MIN_SONGS = 3;

/** Splits a pasted playlist (lines, commas, numbering, bullets) into clean song entries. */
export function parseSongs(text) {
  const raw = String(text || '').replace(/https?:\/\/\S+/g, ' ');
  const parts = raw.split(/\n|;|,(?=\s*[^\d])/).map((s) => s.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s*/, '').replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 2 && s.length <= 100);
  const seen = new Set(); const out = [];
  for (const p of parts) { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out.slice(0, MAX_SONGS);
}

export const hasLink = (text) => /https?:\/\/\S+/.test(String(text || ''));

export function buildPrompt(songs, mode = 'medium') {
  const spice = mode === 'mild' ? 'very gentle and sweet teasing' : 'playful, funny teasing like a best friend';
  return `You are a witty friend roasting someone's music playlist for fun. Tone: ${spice}.\nRules: family-friendly, no swearing, no sexual content, nothing about religion, caste, race, gender, body, health or politics. Only joke about the music taste itself (repeats, cringe-nostalgia, mood swings, genre chaos). Mix Hinglish if the songs look Indian, otherwise English. Mention 2-3 specific songs or artists from the list by name.\nFormat: a funny one-line title, then 4 to 6 short roast lines, then a one-line "Verdict" and a sweet compliment at the end so it ends kindly. Max 900 characters. Use a few emojis.\nPlaylist:\n${songs.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

export function cleanRoast(out) {
  const t = String(out || '').replace(/\*\*/g, '*').replace(/\n{3,}/g, '\n\n').trim();
  return t.length >= 20 ? t.slice(0, 1200) : null;
}
