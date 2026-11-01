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
    const log = () => t.app.db.raw.prepare("SELECT key, kind, text, reply_to FROM telegram_log WHERE kind LIKE 'system%' ORDER BY id").all();
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
