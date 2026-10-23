#!/usr/bin/env node
// Usage: DATABASE_PATH=./data/marsad.db node scripts/import-old-db.js /path/to/marsad-kpi-live.sqlite
// Opens the old file read-only. Refuses to run into a database that already has data.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { open } from '../src/node-db.js';
import { importOldDatabase } from '../src/import-old-db.js';

const oldPath = process.argv[2];
if (!oldPath || !fs.existsSync(oldPath)) { console.error('Usage: import-old-db.js <old marsad-kpi-live.sqlite>'); process.exit(2); }
const dbPath = process.env.DATABASE_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'marsad.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const report = importOldDatabase((await open(dbPath)).raw, oldPath, { log: m => console.log(new Date().toISOString().slice(11, 19), m) });
console.log(JSON.stringify(report, null, 2));
