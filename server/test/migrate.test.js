'use strict';
// The old server exposes the same admin API as this one, so a seeded instance plays "old".
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { cairoToUtc } = require('../src/time');
const { open } = require('../src/db');
const { fetchOld, applyExport } = require('../src/migrate');
const { createApp } = require('../src/app');

test('migration copies employees, admin users, history and day activity without passwords', async () => {
  const old = await start({ at: cairoToUtc(2026, 10, 22, 12, 0, 0) });
  try {
    const admin = await old.admin();
    const e = await old.employee(admin);
    await old.employee(admin, { name: 'Gone', code: 'E9', pin: '9090' });
    await admin('POST', '/api/admin-access', { name: 'Supervisor A', role: 'supervisor', password: 'sup-pass-1', confirmation: 'sup-pass-1' });
    const s = await old.session('1234');
    await old.event(s.token, 'heartbeat', { state: 'ready' });
    await old.tick(s.token, 5 * 60000, 'ready');
    await old.event(s.token, 'agentlinked', { callId: '42', phone: '0100', queue: '2001', callType: 'incoming', state: 'on_call' });
    await old.tick(s.token, 60000, 'on_call');
    await old.event(s.token, 'agentunlinked', { callId: '42', durationSeconds: 60, state: 'ready' });
    await old.tick(s.token, 60000, 'ready');
    const tok = (await admin('POST', '/api/history', { action: 'token' })).body.token;
    await old.call('POST', '/api/history', { headers: { 'x-history-token': tok }, body: { rows: [
      ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status', 'Trunk'],
      ['2001', '', '2026-10-22', '12:02:00', '12:02:20', '00:00:00', '00:00:20', '0111', 'Abandoned', 'T']], expectedCount: 1, reportDate: '2026-10-22' } });
    const before = (await admin('GET', '/api/dashboard?date=2026-10-22&attendance=1')).body;

    const data = await fetchOld({ baseUrl: old.base, adminPassword: 'master-pass', from: '2026-10-22', to: '2026-10-22' });
    const db = open(':memory:');
    const report = applyExport(db, data, { now: old.clock.now });
    assert.equal(report.employees, 2);
    assert.equal(report.adminAccounts, 1);
    assert.equal(report.historyDays, 1);
    assert.ok(report.sessions >= 1 && report.events > 0);
    // Running it again adds nothing.
    const again = applyExport(db, data, { now: old.clock.now });
    assert.equal(again.employees + again.adminAccounts + again.sessions + again.historyDays, 0);

    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(e.id);
    assert.equal(emp.employee_code, 'E1');
    assert.equal(emp.pin_hash, null, 'passwords are not readable through the API');
    assert.equal(db.prepare("SELECT active FROM admin_accounts WHERE name = 'Supervisor A'").get().active, 0);

    // The new server shows the same day: same call, same missed call.
    const { buildApp } = require('../src/index');
    const http = require('node:http');
    const { hashPassword } = require('../src/security');
    const app = createApp({ db, config: { secret: 'x', adminPasswordHash: hashPassword('new-master'), deviceTokens: [], allowedOrigins: [] }, now: () => old.clock.now });
    for (const m of ['./admin', './employees', './sessions', './dashboard', './breaks', './messages', './shifts', './history', './operations', './telegram']) require('../src/' + m.slice(2)).setup(app);
    void buildApp;
    const server = http.createServer((q, r) => app.handle(q, r));
    await new Promise(r => server.listen(0, r));
    try {
      const base = 'http://127.0.0.1:' + server.address().port, h = { 'x-admin-password': 'new-master' };
      const after = await (await fetch(base + '/api/dashboard?date=2026-10-22&attendance=1', { headers: h })).json();
      const p1 = before.performance.find(p => p.employeeId === e.id), p2 = after.performance.find(p => p.employeeId === e.id);
      assert.equal(p2.calls, p1.calls);
      assert.equal(p2.answered, p1.answered);
      assert.equal(p2.avgHandleTime, p1.avgHandleTime);
      const hist = await (await fetch(base + '/api/history?date=2026-10-22', { headers: h })).json();
      assert.equal(hist.missed.length, 1);
      assert.equal(hist.missed[0].waitSeconds, 20);
      // Employee can log in once the admin sets a new PIN.
      await fetch(base + '/api/employees', { method: 'PATCH', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ id: e.id, pin: '2468', pinConfirmation: '2468' }) });
      assert.ok(db.prepare('SELECT pin_hash FROM employees WHERE id = ?').get(e.id).pin_hash);
      assert.ok(db.prepare("SELECT count(*) n FROM legacy_archive").get().n >= 2, 'raw export archived');
    } finally { await new Promise(r => server.close(r)); }
  } finally { await old.close(); }
});
