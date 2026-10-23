'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./db');
const { createApp } = require('./app');
const { hashPassword, randomToken } = require('./security');

const MODULES = ['./admin', './employees', './sessions', './dashboard', './breaks', './messages', './shifts', './history', './missed', './legacy-dashboard', './operations', './telegram'];

function buildApp(config, { now } = {}) {
  const db = open(config.databasePath);
  const app = createApp({ db, config, now });
  for (const m of MODULES) require(m).setup(app);
  return app;
}

function configFromEnv(env = process.env) {
  const databasePath = env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'marsad.db');
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  if (!env.MARSAD_SECRET && env.NODE_ENV === 'production') throw Error('MARSAD_SECRET is required in production');
  const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    databasePath,
    secret: env.MARSAD_SECRET || randomToken(),
    adminPasswordHash: env.MARSAD_ADMIN_PASSWORD_HASH || (env.MARSAD_ADMIN_PASSWORD ? hashPassword(env.MARSAD_ADMIN_PASSWORD) : null),
    deviceTokens: list(env.DEVICE_TOKENS),
    allowedOrigins: list(env.ALLOWED_ORIGINS || 'https://karim87nu-create.github.io'),
  };
}

if (require.main === module) {
  const config = configFromEnv();
  const app = buildApp(config);
  const port = Number(process.env.PORT) || 8080;
  http.createServer((req, res) => app.handle(req, res)).listen(port, () => console.log('marsad-kpi server on :' + port));
}

module.exports = { buildApp, configFromEnv };
