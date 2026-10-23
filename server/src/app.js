'use strict';
const { URL } = require('node:url');
const { createSigner, createLimiter } = require('./security');
const { createLegacy } = require('./legacy');

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

const ALLOWED_HEADERS = 'content-type, x-admin-password, x-device-token, x-employee-session, x-history-token';

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'payload_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createApp({ db, config, now = () => Date.now() }) {
  const routes = new Map();
  const app = {
    db,
    config,
    now,
    signer: createSigner(config.secret),
    legacy: createLegacy({ deviceTokens: config.deviceTokens }),
    limiters: {
      employeeLogin: createLimiter({ limit: 10, windowMs: 15 * 60000 }),
      adminLogin: createLimiter({ limit: 10, windowMs: 15 * 60000 }),
    },
    route(method, path, handler, options = {}) { routes.set(method + ' ' + path, { handler, options }); },
    audit(action, employeeId, details) {
      db.prepare('INSERT INTO audit (occurred_at, action, employee_id, details) VALUES (?,?,?,?)')
        .run(now(), action, employeeId ?? null, JSON.stringify(details || {}));
    },
    HttpError,
    fail,
  };

  app.handle = async function handle(req, res) {
    const origin = req.headers.origin;
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (origin && config.allowedOrigins.includes(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers.vary = 'Origin';
      headers['access-control-allow-headers'] = ALLOWED_HEADERS;
      headers['access-control-allow-methods'] = 'GET, POST, PATCH, DELETE, OPTIONS';
      headers['access-control-max-age'] = '600';
    }
    const send = (status, body) => {
      res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    let url;
    try { url = new URL(req.url, 'http://local'); } catch { send(400, { error: 'bad_url' }); return; }
    if (url.pathname === '/health') { send(200, { ok: true }); return; }
    const route = routes.get(req.method + ' ' + url.pathname);
    if (!route) { send(404, { error: 'not_found' }); return; }
    try {
      const raw = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req, route.options.limit || 256 * 1024);
      const type = String(req.headers['content-type'] || '');
      let body = {};
      if (route.options.raw) body = raw;
      else if (raw.length) {
        if (!/json/i.test(type) && !/^\s*[{[]/.test(raw.toString('utf8', 0, 8))) fail(415, 'json_required');
        try { body = JSON.parse(raw.toString('utf8')); } catch { fail(400, 'invalid_json'); }
        if (!body || typeof body !== 'object') fail(400, 'invalid_json');
      }
      const ctx = {
        req, url, body, raw, type,
        query: Object.fromEntries(url.searchParams),
        header: name => String(req.headers[name] || ''),
        ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
        now: now(),
      };
      const out = await route.handler(ctx, app);
      send(out && out.__status ? out.__status : 200, out && out.__status ? out.body : out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.code, ...(e.extra || {}) });
      else {
        console.error(new Date().toISOString(), req.method, url.pathname, e);
        send(500, { error: 'server_error' });
      }
    }
  };
  return app;
}

module.exports = { createApp, HttpError, fail };
