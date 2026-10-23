'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, DEVICE } = require('./helpers.cjs');

const EMP = ['id', 'name', 'employee_code', 'legacy_pin_hash', 'active', 'created_at'];

test('old data can be moved in and topped up with a newer copy, only with the main password, until real work starts here', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    assert.deepEqual((await admin('GET', '/api/import-old')).body, { available: true, imported: false, lastImportAt: null });
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
