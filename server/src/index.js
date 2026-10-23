'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./db');
const { createApp } = require('./app');
const { hashPassword, randomToken } = require('./security');

const { MODULES } = require('./modules');

function buildApp(config, { now } = {}) {
  const db = open(config.databasePath);
  const app = createApp({ db, config, now });
  for (const m of MODULES) require(m).setup(app);
  return app;
}

// Without MARSAD_SECRET the server keeps its own secret next to the database, so sign-ins and the sealed Telegram token survive restarts.
function storedSecret(databasePath) {
  if (databasePath === ':memory:') return randomToken();
  const file = path.join(path.dirname(databasePath), '.marsad-secret');
  try { const s = fs.readFileSync(file, 'utf8').trim(); if (s.length >= 32) return s; } catch {}
  const s = randomToken() + randomToken();
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

function configFromEnv(env = process.env) {
  const databasePath = env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'marsad.db');
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    databasePath,
    secret: env.MARSAD_SECRET || storedSecret(databasePath),
    adminPasswordHash: env.MARSAD_ADMIN_PASSWORD_HASH || (env.MARSAD_ADMIN_PASSWORD ? hashPassword(env.MARSAD_ADMIN_PASSWORD) : null),
    // The connector's device token ships inside the published extension, so it is not a secret; it can still be overridden.
    deviceTokens: list(env.DEVICE_TOKENS || '7000865f1220458f86506b41a97cab7d'),
    allowedOrigins: list(env.ALLOWED_ORIGINS || 'https://karim87nu-create.github.io'),
    telegramApi: env.TELEGRAM_API || undefined,
  };
}

if (require.main === module) {
  const config = configFromEnv();
  const app = buildApp(config);
  const port = Number(process.env.PORT) || 8080;
  const server = http.createServer((req, res) => app.handle(req, res));
  // Keep idle connections open longer than the hosting proxy does, so a reused connection is never closed mid-request.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.listen(port, () => console.log('marsad-kpi server on :' + port));
}

module.exports = { MODULES, buildApp, configFromEnv };
