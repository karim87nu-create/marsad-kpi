// Node runner (local use and tests). Production runs on ChatGPT Sites through sites/route.ts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './node-db.js';
import { buildCore } from './core.js';
import * as importRoute from './import-route.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function buildApp(config, { now } = {}) {
  const db = await open(config.databasePath);
  const app = buildCore(db, config, { now });
  importRoute.setup(app);
  await app.init();
  return app;
}

function configFromEnv(env = process.env) {
  const databasePath = env.DATABASE_PATH || path.join(here, '..', 'data', 'marsad.db');
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    databasePath,
    secret: env.MARSAD_SECRET || undefined,
    adminPassword: env.MARSAD_ADMIN_PASSWORD || undefined,
    adminPasswordHash: env.MARSAD_ADMIN_PASSWORD_HASH || undefined,
    deviceTokens: list(env.DEVICE_TOKENS),
    allowedOrigins: list(env.ALLOWED_ORIGINS || 'https://karim87nu-create.github.io'),
    telegramApi: env.TELEGRAM_API || undefined,
  };
}

// Node request → Fetch Request → app → Node response.
function nodeHandler(app) {
  return async (req, res) => {
    try {
      const url = 'http://' + (req.headers.host || 'localhost') + req.url;
      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const request = new Request(url, { method: req.method, headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => [k, x]) : [[k, v]])),
        body: hasBody ? req : undefined, duplex: hasBody ? 'half' : undefined });
      const response = await app.fetch(request, { ip: req.socket.remoteAddress || '' });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"server_error"}');
    }
  };
}

export { buildApp, configFromEnv, nodeHandler };
