// Sets the master password of a local (Node) install: node scripts/set-password.js
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/security.js';
import { open } from '../src/node-db.js';

const databasePath = process.env.DATABASE_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'marsad.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const a = await rl.question('New master password (at least 8 characters): ');
const b = await rl.question('Type it again: ');
rl.close();
if (a !== b) { console.log('They do not match. Run this again.'); process.exit(1); }
if (a.length < 8) { console.log('At least 8 characters. Run this again.'); process.exit(1); }
const db = await open(databasePath);
await db.prepare("INSERT INTO settings (key, value) VALUES ('admin_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(await hashPassword(a));
console.log('Saved. If the server is running, close it and start it again.');
