const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function parseTweet(args) {
  const raw = (args || []).join(' ').trim();
  const parts = raw.split('|').map((x) => x.trim());
  let name, handle, text;
  if (parts.length >= 3) { name = parts[0]; handle = parts[1]; text = parts.slice(2).join(' | '); }
  else if (parts.length === 2) { name = parts[0]; text = parts[1]; }
  else return null;
  if (!name || !text) return null;
  name = name.slice(0, 30);
  handle = (handle || name).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'user';
  return { name, handle, text: text.slice(0, 240) };
}
export function wrap(text, max = 38) {
  const lines = [];
  for (const para of text.split(/\n/)) {
    let line = '';
    for (let w of para.split(/\s+/).filter(Boolean)) {
      while (w.length > max) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, max)); w = w.slice(max); }
      if ((line + ' ' + w).trim().length > max) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
    }
    lines.push(line);
  }
  return lines.slice(0, 9);
}
export function tweetSvg({ name, handle, text }, now = new Date()) {
  const lines = wrap(text);
  const W = 800, top = 150, lh = 44, H = top + lines.length * lh + 190;
  const d = now.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' · ' + now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' });
  let seed = 0; for (const c of name + text) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));
  const rt = 50 + (seed % 9000), lk = rt * (3 + (seed % 5)), re = 10 + (seed % 700);
  const initial = esc([...name][0].toUpperCase());
  const body = lines.map((l, i) => `<text x="40" y="${top + 30 + i * lh}" font-size="32" fill="#0f1419">${esc(l)}</text>`).join('');
  const y = top + lines.length * lh + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, DejaVu Sans, sans-serif">
<rect width="100%" height="100%" fill="#ffffff"/>
<circle cx="76" cy="76" r="36" fill="#1d9bf0"/><text x="76" y="89" font-size="36" font-weight="bold" fill="#fff" text-anchor="middle">${initial}</text>
<text x="132" y="68" font-size="30" font-weight="bold" fill="#0f1419">${esc(name)}</text>
<circle cx="${132 + Math.min(name.length, 30) * 17 + 22}" cy="58" r="11" fill="#1d9bf0"/>
<text x="132" y="104" font-size="26" fill="#536471">@${esc(handle)}</text>
${body}
<text x="40" y="${y}" font-size="24" fill="#536471">${esc(d)}</text>
<line x1="40" x2="${W - 40}" y1="${y + 24}" y2="${y + 24}" stroke="#eff3f4" stroke-width="2"/>
<text x="40" y="${y + 70}" font-size="26" fill="#536471"><tspan font-weight="bold" fill="#0f1419">${fmt(rt)}</tspan> Retweets   <tspan font-weight="bold" fill="#0f1419">${fmt(re)}</tspan> Quotes   <tspan font-weight="bold" fill="#0f1419">${fmt(lk)}</tspan> Likes</text>
</svg>`;
}
