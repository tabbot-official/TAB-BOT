// Route table + matcher. Each route: {method, path, summary, tag, auth: null | role, rate, body schema, handler(ctx)}.
export class Router {
  constructor() { this.routes = []; }
  add(r) { this.routes.push({...r, parts: r.path.split('/').filter(Boolean)}); return this; }
  match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean); let pathHit = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {}; let okp = true;
      for (let i = 0; i < segs.length; i++) { if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]); else if (r.parts[i] !== segs[i]) { okp = false; break; } }
      if (!okp) continue; pathHit = true;
      if (r.method === method) return {route: r, params};
    }
    return {route: null, pathHit};
  }
}
