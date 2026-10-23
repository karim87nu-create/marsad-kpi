'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('the old data arrives in chunks, only with the main password, only into an empty server, and can be resumed', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    assert.deepEqual((await admin('GET', '/api/import-old')).body, { available: true, resume: false });
    const post = body => admin('POST', '/api/import-old/rows', body);
    assert.equal((await post({ action: 'rows', table: 'employees', columns: ['id'], rows: [[1]] })).status, 409);   // not begun
    assert.equal((await post({ action: 'begin' })).status, 200);
    const employees = { action: 'rows', table: 'employees', columns: ['id', 'name', 'employee_code', 'legacy_pin_hash', 'active', 'created_at'], rows: [[7, 'Mona', 'M7', 'oldhash', 1, 1]] };
    assert.equal((await post(employees)).body.added, 1);
    assert.equal((await post(employees)).body.added, 0);                       // sent again after a stop: not doubled
    assert.equal((await post({ action: 'rows', table: 'settings', columns: ['key', 'value'], rows: [['admin_hash', 'x']] })).status, 400);
    assert.equal((await post({ action: 'rows', table: 'employees', columns: ['id); DROP TABLE events; --'], rows: [[1]] })).status, 400);
    assert.deepEqual((await admin('GET', '/api/import-old')).body, { available: true, resume: true });
    assert.equal((await post({ action: 'begin' })).status, 200);               // resume is allowed while open
    assert.equal((await post({ action: 'finish', report: { employees: 1 } })).status, 200);
    assert.deepEqual((await admin('GET', '/api/import-old')).body, { available: false, resume: false });
    assert.equal((await post({ action: 'begin' })).status, 409);               // the server has data now
    assert.equal((await admin('GET', '/api/employees')).body.employees[0].name, 'Mona');
  } finally { await t.close(); }
});
