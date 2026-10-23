'use strict';
// Sets the master password for an install that runs without environment variables (the office PC).
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { hashPassword } = require('../src/security');
const { adminHashFile } = require('../src/index');

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'marsad.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('New master password (at least 8 characters): ', a => {
  rl.question('Type it again: ', b => {
    rl.close();
    if (a !== b) { console.log('They do not match. Run this again.'); process.exit(1); }
    if (a.length < 8) { console.log('At least 8 characters. Run this again.'); process.exit(1); }
    fs.writeFileSync(adminHashFile(databasePath), hashPassword(a), { mode: 0o600 });
    console.log('Saved. If the server is running, close it and start it again.');
  });
});
