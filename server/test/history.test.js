'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { start } = require('./helpers');
const { cairoToUtc } = require('../src/time');

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

test('missed call context: who was available, to the second', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 14, 0, 0) });
  try {
    const admin = await t.admin();
    const ahmed = await t.employee(admin);
    const mona = await t.employee(admin, { name: 'Mona', code: 'E2', pin: '5678' });
    const a = await t.session('1234');
    await t.event(a.token, 'heartbeat', { state: 'ready' });
    const m = await t.call('POST', '/api/session/start', { body: { pin: '5678', extension: '102' }, headers: { 'x-device-token': require('./helpers').DEVICE } });
    const mt = m.body.token;
    const ev102 = (type, extra) => t.event(mt, type, { extension: '102', eventKey: '102:' + type + ':' + t.clock.now + Math.random(), ...extra });
    await ev102('heartbeat', { state: 'ready' });
    // 14:00:20 Mona goes on a call; 14:00:30 a customer enters the queue; 14:00:42 he hangs up after 12s.
    await t.tick(a.token, 20000, 'ready');
    await ev102('agentlinked', { callId: '9', state: 'on_call' });
    await t.tick(a.token, 30000, 'ready');
    await ev102('heartbeat', { state: 'on_call' });
    const { post } = await collector(t, admin);
    await post({ rows: [HEADER, ['2001', '', '2026-10-22', '14:00:30', '14:00:42', '00:00:00', '00:00:12', '0111', 'Abandoned', 'T']], expectedCount: 1, reportDate: '2026-10-22' });
    const h = (await admin('GET', '/api/history?date=2026-10-22')).body;
    assert.equal(h.missed.length, 1);
    assert.equal(h.missed[0].classification, 'counted');
    const ctx = (await admin('GET', '/api/history?date=2026-10-22&reportId=' + h.report.id + '&missedIndex=' + h.missed[0].index)).body;
    const ah = ctx.context.employees.find(x => x.employeeId === ahmed.id), mo = ctx.context.employees.find(x => x.employeeId === mona.id);
    assert.equal(ctx.context.timeWindow.precision, 'second');
    assert.equal(ah.state, 'ready');
    assert.equal(ah.queueEntryState, 'ready');
    assert.equal(mo.state, 'on_call');
    assert.equal(mo.queueEntryState, 'on_call');
    assert.equal(mo.elapsedSeconds, 22);                    // on call since 14:00:20
    assert.equal(ah.ringResult, 'unknown');
    const all = (await admin('GET', '/api/history?date=2026-10-22&reportId=' + h.report.id + '&contexts=1')).body;
    assert.equal(all.contexts.length, 1);
  } finally { await t.close(); }
});

test('answered history calls are attributed to the employee on that extension', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 15, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    await t.tick(s.token, 10 * 60000, 'ready');
    const { post } = await collector(t, admin);
    await post({ rows: [HEADER,
      ['2001', 'SIP/101', '2026-10-22', '15:02:00', '15:04:00', '00:02:00', '00:00:03', '0122', 'Success', 'T'],
      ['2001', 'SIP/150', '2026-10-22', '15:03:00', '15:04:00', '00:01:00', '00:00:03', '0133', 'Success', 'T']], expectedCount: 2, reportDate: '2026-10-22' });
    const d = (await admin('GET', '/api/dashboard?date=2026-10-22')).body;
    assert.equal(d.historyAttribution.summary.recovered, 1);
    assert.equal(d.historyAttribution.summary.unattributedAnswered, 1);
    const call = d.calls.find(c => c.attributionSource === 'history_session');
    assert.equal(call.employeeId, e.id);
    assert.equal(call.durationSeconds, 120);
    assert.equal(d.performance.find(p => p.employeeId === e.id).calls, 1);
  } finally { await t.close(); }
});

test('operations: profiles, pressure buckets, reviews and saved reports', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 16, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    await t.tick(s.token, 30 * 60000, 'ready');
    const o = (await admin('GET', '/api/operations?date=2026-10-22')).body;
    assert.equal(o.date, '2026-10-22');
    assert.equal(o.buckets.length, 36);                     // 09:00 → 03:00 in half hours
    const p = o.profiles.find(x => x.id === e.id);
    assert.equal(p.readySeconds, 1800);
    assert.equal(p.smallSample, true);
    assert.equal(o.coverage.hasHistory, false);
    const rv = await admin('POST', '/api/operations', { action: 'review', date: '2026-10-22', reference: 'manual:x', title: 'متابعة', status: 'new', owner: 'Karim', note: '' });
    assert.equal(rv.status, 200);
    const snap = await admin('POST', '/api/operations', { action: 'snapshot', date: '2026-10-22', employeeId: null, extension: '', queue: '' });
    const o2 = (await admin('GET', '/api/operations?date=2026-10-22')).body;
    assert.equal(o2.reviews.length, 1);
    assert.equal(o2.reports.length, 1);
    const saved = (await admin('GET', '/api/operations?date=2026-10-22&saved=' + snap.body.id)).body;
    assert.equal(JSON.parse(saved.payload).profiles.length, 1);
    const cmp = (await admin('GET', '/api/operations?date=2026-10-22&compare=1')).body.comparison;
    assert.equal(cmp.date, '2026-10-21');
    assert.equal(cmp.available, false);
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
