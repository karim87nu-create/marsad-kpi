'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { start } = require('./helpers.cjs');

// Karim 11-17 «انقل علي كلاود فلير دون وقف الشغل»: the whole data, passwords included, moves to the new server.
test('migrate: everything copied (employee passwords and settings keep working), then locked', async () => {
  const a = await start(), b = await start();
  try {
    const adminA = await a.admin();
    await a.employee(adminA, { name: 'Sara', code: 'E7', pin: '4321' });
    await adminA('POST', '/api/admin-access', { name: 'مشرف', role: 'supervisor', password: 'sup-pass-1', confirmation: 'sup-pass-1' });
    await adminA('PUT', '/api/ops-settings/rules', { kind: 'item', name: 'صنف تجربة', no: '0101001' });
    assert.equal((await a.call('POST', '/api/migrate/export', { headers: { 'x-admin-password': 'sup-pass-1' }, body: {} })).status, 403, 'not for other accounts');
    const run = (env) => new Promise((ok, no) => execFile(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'migrate-to-cloudflare.mjs')], { env: { ...process.env, FROM: a.base, TO: b.base, MARSAD_ADMIN_PASSWORD: 'master-pass', ...env }, encoding: 'utf8' }, (e, out) => e ? no(Error(out + e.message)) : ok(out)));
    const out = await run({});
    assert.match(out, /all tables copied/);
    // On the new server: the employee's password, the supervisor's password, the extra rule.
    const emp = (await (await b.admin())('GET', '/api/employees')).body.employees.find(e => e.employeeCode === 'E7');
    assert.ok(emp);
    assert.equal((await b.session('4321', '101')).status, 200);
    assert.equal((await b.call('POST', '/api/admin-access', { body: { action: 'login', password: 'sup-pass-1' } })).status, 200);
    const rules = (await (await b.admin())('GET', '/api/ops-settings')).body.rules;
    assert.equal(rules.items[0]?.no, '0101001');
    // A second run replaces, never doubles.
    await run({});
    assert.equal(b.app.db.raw.prepare('SELECT COUNT(*) n FROM employees').get().n, a.app.db.raw.prepare('SELECT COUNT(*) n FROM employees').get().n);
    await (await b.admin())('POST', '/api/migrate/lock', {});
    await assert.rejects(run({}), /409|failed/);
  } finally { await a.close(); await b.close(); }
});

// The move page: the fresh server pulls page by page from the old one with the old main password (no keys copied by hand).
test('migrate: the fresh server pulls everything from the old one through the move page', async () => {
  const a = await start();
  const b = await start({ config: { adminPasswordHash: null } });
  b.app.config.migrateFrom = a.base;
  try {
    const adminA = await a.admin();
    await a.employee(adminA, { name: 'Mona', code: 'E9', pin: '5555' });
    const pull = (pw, body) => b.call('POST', '/api/migrate/pull', { headers: { 'x-old-password': pw }, body });
    assert.equal((await pull('wrong-pass', {})).status, 401);
    const { tables, full } = (await pull('master-pass', {})).body;
    assert.equal(full, true);
    for (const table of tables) { let after = 0; for (;;) { const p = (await pull('master-pass', { table, after })).body; assert.ok(p.table, table + ' ' + JSON.stringify(p)); if (p.next == null) break; after = p.next; } }
    assert.equal((await b.session('5555', '102')).status, 200, 'the employee password works on the new server');
    assert.equal((await b.call('POST', '/api/admin-access', { body: { action: 'login', password: 'master-pass' } })).status, 200, 'and the main password');
    // Now this server has the main password: a wrong one is refused here too, then the move is closed.
    assert.equal((await pull('nope', { table: 'employees' })).status, 401);
    await (await b.admin())('POST', '/api/migrate/lock', {});
    assert.equal((await pull('master-pass', {})).status, 409);
  } finally { await a.close(); await b.close(); }
});

// The cashier PC's key works on the Cloudflare copy without copying it by hand: checked once against the old server.
test('migrate: the cashier PC key is adopted from the old server, a wrong one is not', async () => {
  const a = await start();
  const b = await start({ config: { adminPasswordHash: null } });
  b.app.config.adoptFrom = a.base;
  try {
    const { token } = (await (await a.admin())('POST', '/api/orders/token')).body;
    const st = tok => b.call('POST', '/api/archive/status', { headers: { 'x-orders-token': tok }, body: { freeGb: 9 } });
    assert.equal((await st('wrong-token-123')).status, 401);
    assert.equal((await st(token)).status, 200, 'adopted on its first call');
    assert.equal((await st(token)).status, 200);
  } finally { await a.close(); await b.close(); }
});
