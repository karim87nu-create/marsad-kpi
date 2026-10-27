// HTTP layer on the Fetch API (Request → Response), so the same app runs under Node and on Cloudflare.
import { createSigner, createLimiter, hashPassword, randomToken } from './security.js';
import { createLegacy } from './legacy.js';
import { migrate } from './db.js';

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

const ALLOWED_HEADERS = 'content-type, x-admin-password, x-device-token, x-employee-session, x-history-token, x-compressed';
// The connector's device token ships inside the published extension, so it is not a secret.
const DEFAULT_DEVICE_TOKEN = '7000865f1220458f86506b41a97cab7d';

async function readBody(request, limit) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > limit) fail(413, 'payload_too_large');
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { reader.cancel().catch(() => {}); fail(413, 'payload_too_large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// config: { secret?, adminPassword?, adminPasswordHash?, deviceTokens?, allowedOrigins?, telegramApi?, telegramTimer? }
function createApp({ db, config: input = {}, now = () => Date.now() }) {
  const routes = new Map(), afterRequest = [];
  const config = {
    allowedOrigins: ['https://karim87nu-create.github.io'],
    ...input,
    deviceTokens: input.deviceTokens?.length ? input.deviceTokens : [DEFAULT_DEVICE_TOKEN],
  };
  const app = {
    db,
    config,
    now,
    legacy: createLegacy({ deviceTokens: config.deviceTokens }),
    limiters: {
      employeeLogin: createLimiter({ limit: 10, windowMs: 15 * 60000 }),
      adminLogin: createLimiter({ limit: 10, windowMs: 15 * 60000 }),
    },
    route(method, path, handler, options = {}) { routes.set(method + ' ' + path, { handler, options }); },
    afterRequest(fn) { afterRequest.push(fn); },
    audit(action, employeeId, details) {
      return db.prepare('INSERT INTO audit (occurred_at, action, employee_id, details) VALUES (?,?,?,?)')
        .run(now(), action, employeeId ?? null, JSON.stringify(details || {}));
    },
    heavy: (fn, ...args) => app[fn](...args),
    HttpError,
    fail,
  };

  // Schema, and the server's own secret when none is configured (kept in the database).
  let ready = null;
  app.init = () => ready ??= (async () => {
    await migrate(db);
    if (!config.secret) {
      await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('secret', ?)").run(randomToken(32) + randomToken(32));
      config.secret = (await db.prepare("SELECT value FROM settings WHERE key = 'secret'").get()).value;
    }
    if (!config.adminPasswordHash && config.adminPassword) config.adminPasswordHash = await hashPassword(config.adminPassword);
    app.signer = createSigner(config.secret);
  })().catch(e => { ready = null; throw e; });

  // waitUntil: keeps background work alive after the response (Cloudflare); Node just lets it run.
  app.fetch = async function handle(request, { ip = '', waitUntil = p => p.catch(() => {}) } = {}) {
    const origin = request.headers.get('origin');
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (origin && config.allowedOrigins.includes(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers.vary = 'Origin';
      headers['access-control-allow-headers'] = ALLOWED_HEADERS;
      headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
      headers['access-control-max-age'] = '600';
    }
    const send = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let url;
    try { url = new URL(request.url); } catch { return send(400, { error: 'bad_url' }); }
    if (url.pathname === '/health' || url.pathname === '/api/health') return send(200, { ok: true });
    const route = routes.get(request.method + ' ' + url.pathname);
    if (!route) return send(404, { error: 'not_found' });
    let response;
    try {
      await app.init();
      const raw = request.method === 'GET' || route.options.stream ? new Uint8Array(0) : await readBody(request, route.options.limit || 256 * 1024);
      const type = String(request.headers.get('content-type') || '');
      let body = {};
      if (route.options.raw) body = raw;
      else if (raw.length) {
        const text = new TextDecoder().decode(raw);
        if (!/json/i.test(type) && !/^\s*[{[]/.test(text.slice(0, 8))) fail(415, 'json_required');
        try { body = JSON.parse(text); } catch { fail(400, 'invalid_json'); }
        if (!body || typeof body !== 'object') fail(400, 'invalid_json');
      }
      const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || ip;
      const ctx = {
        request, url, body, raw, type,
        query: Object.fromEntries(url.searchParams),
        header: name => String(request.headers.get(name) || ''),
        ip: String(forwarded || '').split(',')[0].trim(),
        now: now(),
        waitUntil,
      };
      const out = await route.handler(ctx, app);
      response = send(out && out.__status ? out.__status : 200, out && out.__status ? out.body : out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) response = send(e.status, { error: e.code, ...(e.extra || {}) });
      else {
        console.error(new Date().toISOString(), request.method, url.pathname, e);
        response = send(500, { error: 'server_error' });
      }
    }
    for (const fn of afterRequest) { try { const p = fn(now()); if (p) waitUntil(Promise.resolve(p)); } catch {} }
    return response;
  };
  return app;
}

export { createApp, HttpError, fail, DEFAULT_DEVICE_TOKEN };
