// TAB API entry. OFF unless API_PORT is set. Listens on API_HOST (default 127.0.0.1); put nginx/HTTPS in front to expose it.
import http from 'node:http';
import {buildRouter, PREFIX} from './routes.js';
import {buildSpec, docsHtml, docsJs} from './openapi.js';
import {authenticate, requireRole, readJson, validate, corsHeaders, SECURITY_HEADERS, RateLimiter, requestId} from './middleware.js';
import {ApiError} from './errors.js';
import {fail} from './response.js';
import {log} from './logger.js';
import {setRegistry} from './services/botService.js';
import {setAdapter} from './services/sessionService.js';
import {startDispatcher} from './services/webhooks.js';

export function createHandler() {
  const router = buildRouter(); const spec = buildSpec(router); const limiter = new RateLimiter(60);
  return async (req, res) => {
    const rid = requestId(); const started = Date.now(); const origin = req.headers.origin;
    const base = {...SECURITY_HEADERS, ...corsHeaders(origin), 'x-request-id': rid};
    const send = (status, body, extra = {}) => { res.writeHead(status, {...base, 'content-type': 'application/json; charset=utf-8', ...extra}); res.end(JSON.stringify(body)); };
    let route = null;
    try {
      const url = new URL(req.url, 'http://x'); const path = url.pathname.replace(/\/+$/, '') || '/';
      if (req.method === 'OPTIONS') { res.writeHead(204, base); return res.end(); }
      if (path === PREFIX + '/openapi.json') return send(200, spec);
      if (path === PREFIX + '/docs') { res.writeHead(200, {...base, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src https://unpkg.com 'self' 'unsafe-inline'; style-src https://unpkg.com 'unsafe-inline'; img-src data: https:; connect-src 'self'; frame-ancestors 'none'"}); return res.end(docsHtml()); }
      if (path === PREFIX + '/docs.js') { res.writeHead(200, {...base, 'content-type': 'application/javascript', 'content-security-policy': "default-src 'none'"}); return res.end(docsJs()); }
      const m = router.match(req.method, path);
      if (!m.route) return send(m.pathHit ? 405 : 404, fail(m.pathHit ? 405 : 404, m.pathHit ? 'method_not_allowed' : 'not_found', m.pathHit ? 'Method not allowed' : 'Not found').body);
      route = m.route; const ip = String(req.socket.remoteAddress || '?');
      limiter.check('ip:' + ip + ':' + (route.auth ? 'a' : 'p'), route.rate || 120);
      const raw = await readJson(req, 16384, req.method === 'DELETE' && !!route.body); // body is read (bounded) before auth so the connection stays clean
      let caller = null; if (route.auth) { caller = authenticate(req.headers); limiter.check('id:' + caller.id); requireRole(caller, route.auth); }
      const body = route.raw ? raw : route.body ? validate(raw, route.body) : {}; // raw routes (telemetry ping) are validated strictly by their own service
      const out = await route.handler({body, params: m.params, query: Object.fromEntries(url.searchParams), headers: req.headers, caller, ip});
      send(out.status, out.body);
    } catch (e) {
      if (e instanceof ApiError) { const o = fail(e.status, e.code, e.message, e.details); send(o.status, o.body, e.retry ? {'retry-after': String(e.retry)} : {}); }
      else { log('error', 'unhandled', {rid, err: String(e?.message || e)}); const o = fail(500, 'internal_error', 'Internal error'); send(o.status, o.body); }
    } finally { log('info', 'request', {rid, method: req.method, route: route?.path || 'unmatched', ms: Date.now() - started, status: res.statusCode}); }
  };
}

export function startApi(registry) {
  const port = Number(process.env.API_PORT || 0); if (!port) return null;
  setRegistry(registry);
  import('../ops/index.js').then((o) => setAdapter({number: o.pairedNumber})).catch(() => {});
  import('./services/otpService.js').then((m) => import('../ops/index.js').then((o) => m.setOtpSender(o.sendPortalOtpText))).catch(() => {});
  import('../connection/whatsapp.js').then((w) => setAdapter({logout: w.logoutSession})).catch(() => {});
  startDispatcher();
  const srv = http.createServer(createHandler()); srv.requestTimeout = 15000; srv.headersTimeout = 10000; srv.maxHeadersCount = 40;
  srv.on('error', (e) => log('warn', 'api server error', {err: e.message}));
  srv.listen(port, process.env.API_HOST || '127.0.0.1', () => log('info', 'api listening', {port}));
  srv.unref?.(); return srv;
}
