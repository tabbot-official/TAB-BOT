// PDF / long text -> chunks for text-to-speech voice notes.
export const MAX_CHUNK = 420;
export const MAX_NOTES = 5;

/** Clean extracted text and cut it into sentence-aligned chunks of at most `max` characters. */
export function chunkText(raw, max = MAX_CHUNK) {
  const text = String(raw || '').replace(/\r/g, '').replace(/-\n(?=[a-z])/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) || [text];
  const out = []; let cur = '';
  for (let s of sentences) {
    while (s.length > max) { // very long sentence: cut at a space
      let cut = s.lastIndexOf(' ', max); if (cut < max * 0.5) cut = max;
      if (cur) { out.push(cur.trim()); cur = ''; }
      out.push(s.slice(0, cut).trim()); s = s.slice(cut);
    }
    if ((cur + s).length > max) { out.push(cur.trim()); cur = s; } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

export async function pdfToText(buf, { maxPages = 15 } = {}) {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pages = Math.min(pdf.numPages, maxPages);
  let text = '';
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    text += c.items.map((x) => x.str).join(' ') + '\n\n';
    if (text.length > 20000) break;
  }
  return { text, pages: pdf.numPages, read: pages };
}
