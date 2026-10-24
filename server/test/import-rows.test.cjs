'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, DEVICE } = require('./helpers.cjs');

const EMP = ['id', 'name', 'employee_code', 'legacy_pin_hash', 'active', 'created_at'];

test('old data can be moved in and topped up with a newer copy, only with the main password, until real work starts here', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    assert.deepEqual((await admin('GET', '/api/import-old')).body, { available: true, backfill: false, imported: false, lastImportAt: null });
    const post = body => admin('POST', '/api/import-old/rows', body);
    assert.equal((await post({ action: 'begin' })).body.topUp, false);
    assert.equal((await post({ action: 'rows', table: 'employees', columns: EMP, key: ['id'], rows: [[7, 'Mona', 'M7', 'oldhash', 1, 1]] })).status, 200);
    assert.equal((await post({ action: 'rows', table: 'settings', columns: ['key', 'value'], key: ['key'], rows: [['admin_hash', 'x']] })).status, 400);
    assert.equal((await post({ action: 'rows', table: 'employees', columns: ['id); DROP TABLE events; --'], key: ['id'], rows: [[1]] })).status, 400);
    assert.equal((await post({ action: 'rows', table: 'employees', columns: EMP, key: ['name'], rows: [] })).status, 200);
    const log = (id, action) => [1000 + id, action, null, JSON.stringify({ legacyId: id })];
    const AUD = ['occurred_at', 'action', 'employee_id', 'details'];
    assert.equal((await post({ action: 'rows', table: 'audit', columns: AUD, key: ['details'], rows: [log(1, 'a'), log(2, 'b')] })).status, 200);
    assert.equal((await post({ action: 'finish', report: { employees: 1 } })).status, 200);
    assert.equal((await admin('GET', '/api/import-old')).body.imported, true);

    // A newer copy: the employee was renamed, one more joined, and the log grew; nothing is doubled.
    assert.equal((await post({ action: 'begin' })).body.topUp, true);
    await post({ action: 'rows', table: 'employees', columns: EMP, key: ['id'], rows: [[7, 'Mona Ali', 'M7', 'oldhash', 1, 1], [8, 'Sara', 'S8', 'h8', 1, 2]] });
    await post({ action: 'rows', table: 'audit', columns: AUD, key: ['details'], rows: [log(1, 'a'), log(2, 'b'), log(3, 'c')] });
    const list = (await admin('GET', '/api/employees')).body.employees;
    assert.deepEqual(list.map(e => e.name).sort(), ['Mona Ali', 'Sara']);
    const legacyLog = t.app.db.raw.prepare("SELECT COUNT(*) n FROM audit WHERE json_extract(details, '$.legacyId') IS NOT NULL").get().n;
    assert.equal(legacyLog, 3);

    // The first sign-in on this server closes the move.
    t.app.db.raw.prepare("INSERT INTO employee_sessions (employee_id, device, extension, issued_at, last_seen, expires_at) VALUES (8, 'dev-1', '101', 1, 1, 9e15)").run();
    assert.equal((await admin('GET', '/api/import-old')).body.available, false);
    assert.equal((await post({ action: 'begin' })).status, 409);
  } finally { await t.close(); }
});

test('after the switch, the old system\'s later data is added without touching what was recorded here', async () => {
  const t = await start();
  try {
    const admin = await t.admin(), post = body => admin('POST', '/api/import-old/backfill', body), raw = t.app.db.raw;
    await admin('POST', '/api/import-old/rows', { action: 'rows', table: 'employees', columns: EMP, key: ['id'], rows: [[7, 'Mona', 'M7', 'oldhash', 1, 1]] });
    raw.prepare("INSERT INTO employee_sessions (employee_id, device, extension, issued_at, last_seen, expires_at) VALUES (7, 'dev-new', '101', 5, 5, 9e15)").run();   // first sign-in here
    assert.equal((await admin('GET', '/api/import-old')).body.backfill, true);
    const S = ['employee_id', 'device', 'extension', 'issued_at', 'last_seen', 'expires_at', 'revoked_at'];
    await post({ action: 'rows', table: 'employee_sessions', columns: S, rows: [[7, 'legacy:a1', '101', 1, 2, 9e15, null]] });
    await post({ action: 'rows', table: 'employee_sessions', columns: S, rows: [[7, 'legacy:a1', '101', 1, 3, 9e15, 3]] });   // ended since: updated, not doubled
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM employee_sessions WHERE device = 'legacy:a1'").get().n, 1);
    assert.equal(raw.prepare("SELECT revoked_at FROM employee_sessions WHERE device = 'legacy:a1'").get().revoked_at, 3);
    const E = ['employee_id', 'extension', 'event_type', 'event_key', 'occurred_at', 'received_at', 'device'];
    for (let i = 0; i < 2; i++) await post({ action: 'rows', table: 'events', columns: E, rows: [[7, '101', 'heartbeat', 'k1', 2, 2, 'legacy:a1'], [7, '101', 'heartbeat', 'k2', 3, 3, 'legacy:zz']] });
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM events e JOIN employee_sessions s ON s.id = e.session_id WHERE s.device = 'legacy:a1'").get().n, 1, 'sent twice, kept once; unknown session skipped');
    assert.equal((await post({ action: 'rows', table: 'events', columns: E, rows: [[7, '101', 'heartbeat', 'k3', 2, 2, 'dev-new']] })).status, 400, 'never into a session of the new system');
    raw.prepare("INSERT INTO history_reports (date, imported_at, source, verified_total, header, fingerprint) VALUES ('2026-10-21', 1, 'collector', 1, '[]', 'x')").run();
    const day = date => post({ action: 'history', date, report: { imported_at: 1, source: 'old', verified_total: 1, header: '[]', fingerprint: 'f' }, calls: ['["a"]', '["b"]'] });
    assert.equal((await day('2026-10-21')).body.skipped, 'collected_here');
    await day('2026-10-20'); await day('2026-10-20');
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM history_reports WHERE date = '2026-10-20'").get().n, 1);
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM history_calls c JOIN history_reports r ON r.id = c.report_id WHERE r.date = '2026-10-20'").get().n, 2);
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM employee_sessions WHERE device = 'dev-new'").get().n, 1);
  } finally { await t.close(); }
});
