'use strict';
// Hashes are produced with WebCrypto exactly as the old server's lib/employee-auth.ts and
// lib/admin-access.ts do, then checked by this server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, DEVICE } = require('./helpers');
const { createLegacy } = require('../src/legacy');

const enc = new TextEncoder();
const hex = a => [...new Uint8Array(a)].map(x => x.toString(16).padStart(2, '0')).join('');
async function oldPinHash(pin, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return 'pbkdf2:100000:' + salt + ':' + hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
}
async function oldAdminHash(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return salt + ':' + hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
}
const oldestPinHash = async pin => hex(await crypto.subtle.digest('SHA-256', enc.encode(DEVICE + ':' + pin)));

test('old password formats verify', async () => {
  const l = createLegacy({ deviceTokens: [DEVICE] });
  assert.equal(l.verify('1234', await oldPinHash('1234')), true);
  assert.equal(l.verify('1235', await oldPinHash('1234')), false);
  assert.equal(l.verify('77', await oldestPinHash('77')), true);
  assert.equal(l.verify('78', await oldestPinHash('77')), false);
  assert.equal(l.verifyAdmin('Sup#2026', await oldAdminHash('Sup#2026')), true);
  assert.equal(l.verifyAdmin('Sup#2027', await oldAdminHash('Sup#2026')), false);
});

test('imported employees and admin users log in with their old passwords', async () => {
  const t = await start();
  try {
    const db = t.app.db;
    db.prepare("INSERT INTO employees (id, name, employee_code, legacy_pin_hash, active, created_at) VALUES (5, 'Old Emp', 'E5', ?, 1, 0)").run(await oldPinHash('4455'));
    db.prepare("INSERT INTO employees (id, name, employee_code, legacy_pin_hash, active, created_at) VALUES (6, 'Older Emp', 'E6', ?, 1, 0)").run(await oldestPinHash('9911'));
    db.prepare("INSERT INTO admin_accounts (name, role, password_hash, active, created_at) VALUES ('Old Sup', 'supervisor', ?, 1, 0)").run(await oldAdminHash('OldSup!1'));
    const a = await t.session('4455', '101');
    assert.equal(a.status, 200);
    assert.equal(a.employee.id, 5);
    assert.equal((await t.session('9911')).employee.id, 6);
    assert.equal((await t.session('4456')).status, 401);
    // Upgraded to the new format on first login; old hash cleared; still works.
    const row = db.prepare('SELECT pin_hash, legacy_pin_hash FROM employees WHERE id = 5').get();
    assert.match(row.pin_hash, /^scrypt\$/);
    assert.equal(row.legacy_pin_hash, null);
    // A new employee cannot reuse an imported, not-yet-upgraded password.
    const admin = await t.admin();
    assert.equal((await admin('POST', '/api/employees', { name: 'X', employeeCode: 'X1', pin: '9911', pinConfirmation: '9911' })).body.error, 'password_in_use');
    const sup = await t.call('POST', '/api/admin-access', { body: { action: 'login', password: 'OldSup!1' } });
    assert.equal(sup.status, 200);
    assert.equal(sup.body.identity.role, 'supervisor');
    assert.match(db.prepare("SELECT password_hash FROM admin_accounts WHERE name = 'Old Sup'").get().password_hash, /^scrypt\$/);
    assert.equal((await t.call('POST', '/api/admin-access', { body: { action: 'login', password: 'OldSup!1' } })).status, 200);
  } finally { await t.close(); }
});
