'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('system watch: a part that stops gives one Telegram message, and one «رجع» reply when it works again', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 1, 13, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = () => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { codes: [] } });
    await push();
    const log = () => (() => { const r = t.app.db.raw.prepare("SELECT value FROM settings WHERE key = 'system_log'").get(); return (r ? JSON.parse(r.value) : []).slice().reverse().filter(x => !/^system:morning:/.test(x.key)).map(x => ({ key: x.key, kind: 'system', text: x.text, target: null, reply_to: /^resolved:/.test(x.key) ? x.key.slice(9) : null })); })();
    t.advance(15 * 60000); await t.call('GET', '/health'); await admin('GET', '/api/system/watch');
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    let l = log().filter(x => /شاشة طلبات الأساسية/.test(x.text));
    assert.equal(l.length, 1, 'one message');
    assert.match(l[0].text, /واقف من/);
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.equal(log().filter(x => /شاشة طلبات الأساسية/.test(x.text)).length, 1, 'not repeated');
    await push(); t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    l = log().filter(x => /شاشة طلبات الأساسية/.test(x.text));
    assert.equal(l.length, 2); assert.match(l[1].text, /رجع اشتغل/); assert.equal(l[1].reply_to, l[0].key);
    const w = (await admin('GET', '/api/system/watch')).body;
    assert.ok(w.parts.find(p => p.id === 'talabat').ok);
  } finally { await t.close(); }
});

test('backup: every table page by page with the monitor key, never keys or hashes', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const b = body => t.call('POST', '/api/backup', { headers: { 'x-orders-token': token }, body });
    assert.equal((await t.call('POST', '/api/backup', { body: {} })).status, 401);
    const { tables } = (await b({})).body;
    assert.ok(tables.includes('employees') && tables.includes('settings'));
    const s = (await b({ table: 'settings' })).body;
    assert.ok(s.rows.every(r => !/hash|token|secret/i.test(r.key)), 'no secrets');
    assert.equal((await b({ table: 'nope' })).status, 400);
  } finally { await t.close(); }
});

test('KPI: call center and branches for a period, with the period before and the targets', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 23, 20, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const push = (day, branches, sales) => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { day, generatedAt: new Date(t.clock.now).toISOString(), branches, sales } });
    await push('2026-10-22', [{ name: 'التجمع', orders: 100, sales: 50000, avgOut: 25, outLate: 10, outCount: 90, cancels: 1, cancelSales: 400, kinds: { 'طلبات': 60, Hotline: 30 } }], [{ branch: 'التجمع', discounts: 4000 }]);
    t.advance(1000);
    await push('2026-10-23', [{ name: 'التجمع', orders: 120, sales: 60000, avgOut: 20, outLate: 6, outCount: 120, cancels: 0, cancelSales: 0, kinds: { 'طلبات': 70 } }], [{ branch: 'التجمع', discounts: 3000 }]);
    const k = (await admin('GET', '/api/kpi?from=2026-10-23&to=2026-10-23')).body;
    assert.deepEqual(k.prev, { from: '2026-10-22', to: '2026-10-22' });
    const b = k.branches[0], p = k.before.branches[0];
    assert.equal(b.orders, 120); assert.equal(b.avgOut, 20); assert.equal(b.latePct, 5); assert.equal(b.discountPct, 5);
    assert.equal(p.orders, 100); assert.equal(p.latePct, 11.1);
    assert.ok(k.targets.latePct && k.team);
    const w = (await admin('GET', '/api/kpi?from=2026-10-22&to=2026-10-23')).body.branches[0];
    assert.equal(w.orders, 220); assert.equal(w.avgOut, 22.1, 'weighted by orders out');
  } finally { await t.close(); }
});

test('system watch: a shift open 12+ hours gives one Telegram message', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 1, 10, 0, 0) });
  try {
    const admin = await t.admin(); await t.employee(admin); const s = await t.session(); await t.event(s.token, 'heartbeat', { state: 'ready' });
    const log = () => t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE key LIKE 'system:longSession:%'").all();
    for (let i = 0; i < 13 * 6; i++) { t.advance(10 * 60000); await t.event(s.token, 'heartbeat', { state: 'ready' }).catch(() => {}); await t.call('GET', '/health'); }
    const l = log();
    assert.equal(l.length, 1, 'one message');
    assert.match(l[0].text, /فاتح الشيفت/);
  } finally { await t.close(); }
});

test('Talabat actions: one row per branch however Talabat spelled it', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    await admin('POST', '/api/talabat/actions-config', { branches: { 'El Dahan, Makram Ebeid': { onTheWay: true }, 'الدهان سيتي ستار مول، مكرم عبيد': { minutes: 40 }, 'El Dahan, Madinaty - South Park': {}, 'الدهان, مدينتي - ساوث بارك': {} } });
    const b = (await admin('GET', '/api/talabat/actions-config')).body.branches;
    assert.equal(b.length, 2, JSON.stringify(b));
    const mk = b.find(x => /مكرم/.test(x.store));
    assert.equal(mk.onTheWay, true); assert.equal(mk.minutes, 40);
  } finally { await t.close(); }
});

test('Apex alerts for a Talabat order take the area and the customer note from Talabat, never the street or phone', async () => {
  const t = await start();
  try {
    t.app.db.raw.prepare("INSERT INTO match_profiles (source, ref, data) VALUES ('talabat', 'T1', ?)").run(JSON.stringify({ phone: '01000000000', address: 'شارع 9، الحي الثالث، مدينتي — مبنى: 4 — الدور: الاول', bill: [{ k: 'ملاحظة العميل', text: 'ملاحظة العميل | من غير بصل' }] }));
    t.app.talabat.matchDay = async () => ({ rows: [{ id: 'T1' }], matches: new Map([['T1', { no: '555' }]]) });
    const x = (await t.app.apexDetails('2026-11-01', { talabat: true })).extra('555');
    assert.match(x, /📍 المنطقة: الحي الثالث/);
    assert.match(x, /💬 ملاحظة الأوردر: من غير بصل/);
    assert.doesNotMatch(x, /شارع 9|0100|الدور/);
    assert.equal((await t.app.apexDetails('2026-11-01')).extra('555'), '', 'only when asked');
  } finally { await t.close(); }
});

test('price differences: saved orders with a difference (not Talabat delivery) and failed ones are listed for admin', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const day = (await admin('GET', '/api/kpi')).body.to;
    const ins = (ref, state, result) => t.app.db.raw.prepare("INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at, payload, result) VALUES ('talabat',?,?,?,NULL,'Ahmed','paid','',?,?,?)")
      .run(ref, day, state, Date.now(), JSON.stringify({ branchNo: 2, code: '1' + ref.slice(-3), targetTotal: 743, items: [{ itemNo: '0108022', qty: 1 }] }), JSON.stringify(result));
    ins('1001', 'auto_done', { ok: true, gap: 39.33, short: 0, before: 782.33, service: 34.5, target: 743, shiftSerial: 10 });   // only Talabat's free delivery: normal
    ins('1002', 'auto_done', { ok: true, gap: 0, short: 155.4, before: 1345.6, service: 54.15, target: 1501, shiftSerial: 11 });
    ins('1003', 'auto_done', { ok: true, gap: 60, short: 0, before: 803, service: 0, target: 743, shiftSerial: 12 });
    ins('1004', 'auto_failed', { ok: false, error: 'an item is stopped on Apex' });
    const l = (await admin('GET', '/api/transfer/price-diffs?from=' + day + '&to=' + day)).body.list;
    assert.deepEqual(l.map(x => x.ref).sort(), ['1002', '1003', '1004']);
    assert.equal(l.find(x => x.ref === '1003').unexplained, 60);
    assert.equal(l.find(x => x.ref === '1002').short, 155.4);
  } finally { await t.close(); }
});

test('a branch closing on Talabat: a message with the reason and until when, a reply with how long when it opens, a report', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 1, 19, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = availability => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { codes: [], availability } });
    const av = (state, raw = {}) => [{ outlet: '802223', name: 'El Dahan, Madinaty - South Park', state, raw: { platformVendorId: '802223', state, ...raw } }];
    await push(av('OPEN'));
    t.advance(60000); await push(av('CLOSED', { closedReason: 'TOO_BUSY_KITCHEN', closedUntil: '2026-11-01T17:30:00Z' }));
    const log = () => t.app.db.raw.prepare("SELECT key, text, target, branch, reply_to FROM telegram_log WHERE kind = 'talabatClosed' ORDER BY id").all();
    let l = log();
    assert.equal(l.length, 1, 'the call center only'); assert.equal(l[0].target, 'online');
    assert.match(l[0].text, /فرع مدينتى اتقفل على طلبات/); assert.match(l[0].text, /TOO_BUSY_KITCHEN/); assert.match(l[0].text, /لحد: 07:30/);
    assert.equal(l[0].branch, 'مدينتى');
    t.advance(35 * 60000); await push(av('CLOSED', { closedReason: 'TOO_BUSY_KITCHEN' }));
    assert.equal(log().length, 1, 'no repeat while closed');
    t.advance(5 * 60000); await push(av('OPEN'));
    l = log();
    assert.equal(l.length, 2); assert.match(l[1].text, /رجع فتح/); assert.match(l[1].text, /40 دقيقة/); assert.equal(l[1].reply_to, l[0].key); assert.equal(l[1].target, 'online');
    const r = (await admin('GET', '/api/talabat/closures')).body;
    assert.equal(r.list.length, 1); assert.equal(r.list[0].minutes, 40); assert.equal(r.list[0].reason, 'TOO_BUSY_KITCHEN');
  } finally { await t.close(); }
});
