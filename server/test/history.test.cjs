'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Same shape the collector posts: header row + 10-column rows from 0002_inbound_calls.php.
const HEADER = ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status', 'Trunk'];

async function collector(t, admin) {
  const tok = (await admin('POST', '/api/history', { action: 'token' })).body;
  assert.ok(Number(tok.token.split('.')[0]) > t.clock.now);
  const post = body => t.call('POST', '/api/history', { body, headers: { 'x-history-token': tok.token } });
  return { tok, post };
}

test('collector: token lifecycle and day report import', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 23, 0, 0) });
  try {
    const admin = await t.admin();
    const { tok, post } = await collector(t, admin);
    const rows = [
      ['2001', 'SIP/101', '2026-10-22', '22:10:00', '22:12:00', '00:02:00', '00:00:05', '01000000001', 'Success', 'T'],
      ['2001', '', '2026-10-22', '22:20:00', '22:20:30', '00:00:00', '00:00:30', '01000000002', 'Abandoned', 'T'],
      ['2002', '', '2026-10-22', '22:30:00', '22:30:05', '00:00:00', '00:00:05', '01000000003', 'Abandoned', 'T'],
      ['2000', '', '2026-10-22', '08:00:00', '08:00:20', '00:00:00', '00:00:20', '01000000004', 'Abandoned', 'T'],
    ];
    assert.equal((await post({ rows: [HEADER, ...rows], expectedCount: 3, reportDate: '2026-10-22' })).body.error, 'report_count_mismatch');
    assert.equal((await post({ rows: [HEADER, ...rows], expectedCount: 4, reportDate: '2026-10-22' })).body.ok, true);
    assert.equal((await post({ rows: [HEADER, ...rows], expectedCount: 4, reportDate: '2026-10-22' })).body.duplicate, true);
    const h = (await admin('GET', '/api/history?date=2026-10-22')).body;
    // 08:00 belongs to the previous data day; the rest count: 1 answered, 1 counted abandoned, 1 short (≤7s).
    assert.equal(h.report.totalRecords, 3);
    assert.equal(h.report.answered, 1);
    assert.equal(h.report.abandoned, 1);
    assert.equal(h.report.shortAbandoned, 1);
    assert.equal(h.report.sla, 50);
    assert.deepEqual(h.missed.map(m => m.classification).sort(), ['counted', 'short_exempt']);
    // Refresh rotates, revoke ends it.
    const r = (await t.call('POST', '/api/history', { body: { action: 'refresh', refreshToken: tok.refreshToken } })).body;
    assert.ok(r.token && r.refreshToken);
    assert.equal((await post({ action: 'live', rows: [], capture: {} })).status, 401);
    await t.call('POST', '/api/history', { body: { action: 'revoke', refreshToken: r.refreshToken } });
    assert.equal((await t.call('POST', '/api/history', { body: { action: 'refresh', refreshToken: r.refreshToken } })).status, 401);
  } finally { await t.close(); }
});

test('live snapshots: fresh, duplicate and stale captures', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 13, 0, 0) });
  try {
    const admin = await t.admin();
    const { post } = await collector(t, admin);
    const row = (status, wait) => ['2001', '', 'Agent', '', '', '', '', '', wait, '0100', status];
    const cap = (offset = 0) => ({ id: crypto.randomUUID(), kind: 'native_report_snapshot', pageId: crypto.randomUUID(), sequence: 1, changed: true,
      observedAt: new Date(t.clock.now - offset).toISOString(), timeBasis: 'server-clock-v1', uncertaintyMs: 1200 });
    const c1 = cap();
    const a = (await post({ action: 'live', rows: [row('On Wait', '0:00:09'), row('Live Call', '0:01:00')], capture: c1 })).body;
    assert.equal(a.liveAccepted, true);
    assert.equal(a.captureId, c1.id);
    assert.equal((await post({ action: 'live', rows: [], capture: c1 })).body.duplicate, true);
    assert.equal((await post({ action: 'live', rows: [], capture: cap(60000) })).body.liveAccepted, false);
    assert.equal((await post({ action: 'live', rows: [['short']], capture: cap() })).body.error, 'invalid_live_snapshot');
    const h = (await admin('GET', '/api/history?date=2026-10-22&live=1')).body;
    assert.equal(h.live.records.length, 2);
    assert.equal(Date.parse(h.live.observedAt), t.clock.now);
  } finally { await t.close(); }
});

test('missed call: who was in the shift and who was available while the customer waited', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 14, 0, 0) });
  try {
    const admin = await t.admin();
    const ahmed = await t.employee(admin);
    const mona = await t.employee(admin, { name: 'Mona', code: 'E2', pin: '5678' });
    await t.employee(admin, { name: 'Absent', code: 'E3', pin: '4321' });
    const a = await t.session('1234');
    await t.event(a.token, 'heartbeat', { state: 'ready' });
    const m = await t.call('POST', '/api/session/start', { body: { pin: '5678', extension: '102' }, headers: { 'x-device-token': require('./helpers.cjs').DEVICE } });
    const mt = m.body.token;
    const ev102 = (type, extra) => t.event(mt, type, { extension: '102', eventKey: '102:' + type + ':' + t.clock.now + Math.random(), ...extra });
    await ev102('heartbeat', { state: 'ready' });
    // 14:00:20 Mona takes a call; 14:00:30 a customer enters the queue and hangs up after 12 s.
    await t.tick(a.token, 20000, 'ready');
    await ev102('agentlinked', { callId: '9', state: 'on_call' });
    await t.tick(a.token, 30000, 'ready');
    await ev102('heartbeat', { state: 'on_call' });
    await t.tick(a.token, 30000, 'ready');
    await ev102('heartbeat', { state: 'on_call' });
    const { post } = await collector(t, admin);
    await post({ rows: [HEADER, ['2001', '', '2026-10-22', '14:00:30', '', '00:00:00', '00:00:12', '0111', 'Abandoned', 'T']], expectedCount: 1, reportDate: '2026-10-22' });
    const h = (await admin('GET', '/api/history?date=2026-10-22')).body;
    assert.equal(h.missed.length, 1);
    assert.equal(h.missed[0].classification, 'counted');
    const ctx = (await admin('GET', '/api/missed?date=2026-10-22&index=' + h.missed[0].index)).body;
    const ah = ctx.employees.find(x => x.employeeId === ahmed.id), mo = ctx.employees.find(x => x.employeeId === mona.id);
    assert.equal(ctx.employees.length, 2, 'the absent employee is not listed');
    assert.equal(ah.atEntry, 'ready');
    assert.equal(ah.readyDuringWait, true);
    assert.equal(mo.atEntry, 'on_call');
    assert.equal(mo.readyDuringWait, false);
    assert.equal(mo.sinceSeconds, 10);                         // on the call since 14:00:20
    assert.equal(ctx.readyCount, 1);
  } finally { await t.close(); }
});

test('answered history calls: matched to the connector call, or added to the one employee on that extension', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 15, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    await t.tick(s.token, 60000, 'ready');
    await t.event(s.token, 'agentlinked', { callId: '77', phone: '01000000077', state: 'on_call', callType: 'incoming' });
    await t.tick(s.token, 60000, 'on_call');
    await t.event(s.token, 'agentunlinked', { callId: '77', durationSeconds: 60, state: 'ready' });
    await t.tick(s.token, 10 * 60000, 'ready');
    const { post } = await collector(t, admin);
    await post({ rows: [HEADER,
      ['2001', '101', '2026-10-22', '15:01:00', '15:02:00', '00:01:00', '00:00:03', '01000000077', 'Success', 'T'],   // the connector saw it
      ['2001', '101', '2026-10-22', '15:05:00', '15:07:00', '00:02:00', '00:00:03', '0122', 'Success', 'T'],          // the connector missed it
      ['2001', '150', '2026-10-22', '15:06:00', '15:07:00', '00:01:00', '00:00:03', '0133', 'Success', 'T']], expectedCount: 3, reportDate: '2026-10-22' });   // nobody on 150
    const d = (await admin('GET', '/api/day?date=2026-10-22')).body;
    assert.deepEqual(d.history.attribution, { alreadySeen: 1, recovered: 1, unattributed: 1 });
    assert.equal(d.history.unattributed[0].reason, 'nobody_on_extension');
    const me = d.employees.find(p => p.employeeId === e.id);
    assert.equal(me.calls, 2);
    assert.equal(me.fromHistory, 1);
    assert.equal(d.calls.find(c => c.source === 'history').durationSeconds, 120);
  } finally { await t.close(); }
});

test('admin xlsx import of an Arabicss export', async () => {
  const ExcelJS = require('exceljs');
  const t = await start({ at: cairoToUtc(2026, 10, 22, 18, 0, 0) });
  try {
    const admin = await t.admin();
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Report');
    ws.addRow(['All Inbound Calls']);
    ws.addRow(HEADER);
    ws.addRow(['2001', '', '10/22/2026', '12:00:00', '12:01:00', '00:01:00', '00:00:04', '0144', 'Success', 'T']);
    const buf = await wb.xlsx.writeBuffer();
    const r = await t.call('POST', '/api/history', { raw: Buffer.from(buf), headers: { 'x-admin-password': await t.login(), 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.date, '2026-10-22');
    const h = (await admin('GET', '/api/history?date=2026-10-22')).body;
    assert.equal(h.report.answered, 1);
    assert.equal(h.report.verifiedTotal, false);
  } finally { await t.close(); }
});
