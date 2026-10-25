#!/usr/bin/env node
// Converts the old system's database (marsad-kpi-live.sqlite) into a SQL file for this server's D1
// database on ChatGPT Sites:  node scripts/old-to-sql.js marsad-kpi-live.sqlite marsad-import.sql
// Then: wrangler d1 execute <DB> --remote --file marsad-import.sql   (or the Sites D1 import)
// Nothing is ever emptied or overwritten: every row is INSERT OR IGNORE, so running it again only adds
// rows that are missing and never touches accounts, passwords or activity already on the new server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open } from '../src/node-db.js';
import { importOldDatabase } from '../src/import-old-db.js';

const [oldPath, outPath] = process.argv.slice(2);
if (!oldPath || !outPath || !fs.existsSync(oldPath)) { console.error('Usage: old-to-sql.js <marsad-kpi-live.sqlite> <out.sql>'); process.exit(2); }
const temp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'marsad-')), 'converted.db');
const db = await open(temp);
const report = importOldDatabase(db.raw, oldPath, { log: m => console.error(new Date().toISOString().slice(11, 19), m) });

const TABLES = ['admin_accounts', 'admin_sessions', 'employees', 'employee_sessions', 'events', 'break_permissions', 'break_requests', 'messages', 'message_recipients',
  'shift_decisions', 'history_reports', 'history_calls', 'live_snapshots', 'collector_tokens', 'reviews', 'saved_reports', 'audit'];
const value = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const out = fs.openSync(outPath, 'w');
const write = s => fs.writeSync(out, s + '\n');
let rows = 0;
for (const t of TABLES) {
  const cols = db.raw.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name);
  const head = 'INSERT OR IGNORE INTO ' + t + ' (' + cols.join(', ') + ') VALUES ';
  for (const r of db.raw.prepare('SELECT * FROM ' + t).raw().iterate()) { write(head + '(' + r.map(value).join(', ') + ');'); rows++; }
}
fs.closeSync(out);
db.raw.close();
fs.rmSync(path.dirname(temp), { recursive: true, force: true });
console.error(JSON.stringify({ ...report, sqlRows: rows, file: outPath, bytes: fs.statSync(outPath).size }));
