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
