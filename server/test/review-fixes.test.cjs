'use strict';
// Fixes from the Oct 25 2026 review: nothing deleted, history never shrinks, DST-safe call times, safe first setup.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

const HEADER = ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status', 'Trunk'];

test('employees and admin accounts cannot be deleted, only stopped', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const r = await admin('DELETE', '/api/employees', { id: e.id, confirmCode: 'E1' });
    assert.equal(r.status, 409);
    const still = (await admin('GET', '/api/employees')).body.employees.find(x => x.id === e.id);
    assert.ok(still, 'employee still listed');
    assert.equal((await t.session('1234')).status, 200, 'password untouched');
    const created = (await admin('POST', '/api/admin-access', { action: 'create', name: 'Sup', role: 'supervisor', password: 'sup-pass-1', confirmation: 'sup-pass-1' })).body;
    const id = created.id ?? (await admin('GET', '/api/admin-access')).body.accounts?.find(a => a.name === 'Sup')?.id;
    if (id != null) {
      assert.equal((await admin('DELETE', '/api/admin-access', { id })).status, 409);
      const acc = await t.app.db.raw.prepare('SELECT deleted_at FROM admin_accounts WHERE id = ?').get(id);
      assert.equal(acc.deleted_at, null);
    }
  } finally { await t.close(); }
});

test('a smaller Excel upload never replaces a fuller report of the same date', async () => {
  const ExcelJS = require('exceljs');
  const t = await start({ at: cairoToUtc(2026, 10, 22, 23, 0, 0) });
  try {
    const admin = await t.admin();
    const tok = (await admin('POST', '/api/history', { action: 'token' })).body;
    const rows = [
      ['2001', 'SIP/101', '2026-10-22', '12:00:00', '12:01:00', '00:01:00', '00:00:04', '011', 'Success', 'T'],
      ['2001', 'SIP/101', '2026-10-22', '13:00:00', '13:01:00', '00:01:00', '00:00:04', '012', 'Success', 'T'],
      ['2001', 'SIP/101', '2026-10-22', '14:00:00', '14:01:00', '00:01:00', '00:00:04', '013', 'Success', 'T'],
    ];
    const ok = await t.call('POST', '/api/history', { body: { rows: [HEADER, ...rows], expectedCount: 3, reportDate: '2026-10-22' }, headers: { 'x-history-token': tok.token } });
    assert.equal(ok.body.ok, true);
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Report');
    ws.addRow(HEADER);
    ws.addRow(['2001', '', '10/22/2026', '12:00:00', '12:01:00', '00:01:00', '00:00:04', '011', 'Success', 'T']);
    const r = await t.call('POST', '/api/history', { raw: Buffer.from(await wb.xlsx.writeBuffer()), headers: { 'x-admin-password': await t.login(), 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    const h = (await admin('GET', '/api/history?date=2026-10-22')).body;
    assert.equal(h.report.answered, 3);
    assert.equal(h.report.verifiedTotal, true);
  } finally { await t.close(); }
});

test('call times on the spring-forward day are not shifted by an hour', async () => {
  const A = await import('../src/arabicss.js');
  const map = A.mapHeader(HEADER);
  const rec = A.toRecord(['2001', 'SIP/101', '2026-04-24', '10:00:00', '10:01:00', '00:01:00', '00:00:04', '011', 'Success', 'T'], map, '2026-04-24', 0);
  assert.equal(new Date(rec.startMs ?? rec.start).toISOString(), new Date(cairoToUtc(2026, 4, 24, 10, 0, 0)).toISOString());
  assert.equal(new Date(cairoToUtc(2026, 4, 24, 10, 0, 0)).toISOString(), '2026-04-24T07:00:00.000Z');
});

test('first-use setup is refused once the server already has people', async () => {
  const t = await start({ config: { adminPasswordHash: undefined } });
  try {
    t.app.db.raw.prepare("INSERT INTO employees (name, employee_code, created_at) VALUES ('X', 'X1', 0)").run();
    const r = await t.call('POST', '/api/admin-access', { body: { action: 'setup', password: 'attacker-pass', confirmation: 'attacker-pass' } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
  } finally { await t.close(); }
});

test('old-data SQL never empties tables', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'old-to-sql.js'), 'utf8');
  assert.doesNotMatch(src, /DELETE FROM/);
  assert.match(src, /INSERT OR IGNORE/);
});
