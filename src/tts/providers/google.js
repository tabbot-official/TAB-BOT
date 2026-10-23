// Google Translate voice (the free web endpoint, no key). One voice per language, short chunks.
const CHUNK = 180;

export function splitText(text, size = CHUNK) {
  const out = [];
  let rest = text.trim();
  while (rest.length > size) {
    let cut = Math.max(rest.lastIndexOf('. ', size), rest.lastIndexOf(', ', size), rest.lastIndexOf(' ', size));
    if (cut < size * 0.4) cut = size;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export default {
  name: 'google',
  available: async () => typeof fetch === 'function',
  supports: (lang) => !!lang,
  async synth({ text, lang, timeoutMs }) {
    const parts = [];
    const deadline = Date.now() + timeoutMs;
    for (const piece of splitText(text)) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('timeout');
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(piece)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(left), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parts.push(Buffer.from(await res.arrayBuffer()));
    }
    const buf = Buffer.concat(parts);
    if (buf.length < 500) throw new Error('empty audio');
    return { buf, ext: 'mp3' };
  },
};
