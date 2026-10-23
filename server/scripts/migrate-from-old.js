#!/usr/bin/env node
'use strict';
// Usage:
//   OLD_URL=https://marsad-kpi-live.karim87nu.chatgpt.site OLD_ADMIN_PASSWORD=... \
//   DATABASE_PATH=./data/marsad.db node scripts/migrate-from-old.js [from YYYY-MM-DD] [to YYYY-MM-DD]
// Reads the old server only (GET + login). Saves the raw export next to the database first.
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('../src/db');
const { fetchOld, applyExport, defaultRange, validDate } = require('../src/migrate');

(async () => {
  const baseUrl = String(process.env.OLD_URL || '').replace(/\/$/, ''), password = process.env.OLD_ADMIN_PASSWORD;
  if (!baseUrl || !password) { console.error('Set OLD_URL and OLD_ADMIN_PASSWORD'); process.exit(2); }
  const range = defaultRange();
  const from = process.argv[2] || range.from, to = process.argv[3] || range.to;
  if (!validDate(from) || !validDate(to) || from > to) { console.error('Bad date range'); process.exit(2); }
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'marsad.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const data = await fetchOld({ baseUrl, adminPassword: password, from, to, log: m => process.stdout.write(m + '\n') });
  const backup = path.join(path.dirname(dbPath), 'old-export-' + data.fetchedAt.replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(backup, JSON.stringify(data));
  console.log('raw export saved:', backup);
  const report = applyExport(open(dbPath), data);
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
