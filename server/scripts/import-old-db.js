#!/usr/bin/env node
'use strict';
// Usage: DATABASE_PATH=./data/marsad.db node scripts/import-old-db.js /path/to/marsad-kpi-live.sqlite
// Opens the old file read-only. Refuses to run into a database that already has data.
const path = require('node:path');
const fs = require('node:fs');
const { open } = require('../src/db');
const { importOldDatabase } = require('../src/import-old-db');

const oldPath = process.argv[2];
if (!oldPath || !fs.existsSync(oldPath)) { console.error('Usage: import-old-db.js <old marsad-kpi-live.sqlite>'); process.exit(2); }
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'marsad.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const report = importOldDatabase(open(dbPath), oldPath, { log: m => console.log(new Date().toISOString().slice(11, 19), m) });
console.log(JSON.stringify(report, null, 2));
