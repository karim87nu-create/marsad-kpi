'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('items: Talabat dishes compared with Apex lines; wrong dish alerted; unknown names learned; cancellation owners', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 40 * 60000 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = body => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body });
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    const store = 'الدهان، التجمع الخامس';
    const online = [
      { no: 9001, kind: 'طلبات', branch: 'التجمع', at: at(2), user: 'sara', amount: 247.78, tag: '#2701', items: [{ no: '0107006', name: 'فرد حمام محشى', qty: 1, price: 212.92 }, { no: '0101001', name: 'سلطة طحينة', qty: 1, price: 34.86 }] },
      // Wrong weight: 1/4 kofta entered for a 1/3 kofta.
      { no: 9002, kind: 'طلبات', branch: 'التجمع', at: at(12), user: 'sara', amount: 266.4, tag: '#2702', items: [{ no: '0108004', name: '1/4كيلو كفتة', qty: 1, price: 266.4 }] },
      // A dish not in the starting list, named differently: learned after two orders.
      { no: 9003, kind: 'طلبات', branch: 'التجمع', at: at(22), user: 'ali', amount: 300, tag: '#2703', items: [{ no: '0199001', name: 'صينية رقاق باللحمة', qty: 1, price: 300 }] },
      { no: 9004, kind: 'طلبات', branch: 'التجمع', at: at(32), user: 'ali', amount: 300, tag: '#2704', items: [{ no: '0199001', name: 'صينية رقاق باللحمة', qty: 1, price: 300 }] }];
    const cancels = [{ no: 9100, kind: 'Hotline', branch: 'التجمع', user: 'ali', by: 'boss', pilot: 'pilot1', at: at(39), afterOut: 20, reason: 'العميل مش بيرد', entry: at(5), items: [] }];
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online, cancels } });
    await push({ codes: [1, 2, 3, 4].map(i => ({ id: '397710000' + i, code: String(2700 + i), store })) });
    const tal = [[{ qty: 1, name: 'Stuffed Pigeon with Rice - Piece', price: 242 }, { qty: 1, name: 'Tahini salad', price: 39 }], [{ qty: 1, name: 'Kofta', price: 423 }],
      [{ qty: 1, name: 'Roqaq with Meat', price: 339 }], [{ qty: 1, name: 'Roqaq with Meat', price: 339 }]];
    await push({ orders: tal.map((items, i) => ({ id: '397710000' + (i + 1), store, status: i === 1 ? 'CANCELLED' : 'ACCEPTED', placedAt: at(i * 10), detail: { receivedAt: at(i * 10), acceptedAt: at(i * 10 + 0.5), items, subtotal: 100,
      ...(i === 1 ? { cancelledAt: at(30), cancelOwner: 'Owner: Vendor', cancelReason: 'Wrong order' } : {}) } })) });
    let d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body, o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977100001'].apex.items.ok, true);
    assert.equal(o['3977100002'].apex.items.ok, false);
    assert.deepEqual(o['3977100002'].apex.items.missingOnApex, ['1× Kofta']);
    assert.deepEqual(o['3977100002'].apex.items.extraOnApex, ['1× 1/4كيلو كفتة']);
    const log = t.app.db.raw.prepare("SELECT key, target, text FROM telegram_log WHERE kind = 'talabatItems'").all();
    assert.equal(log.length, 1); assert.equal(log[0].target, 'online'); assert.match(log[0].text, /Kofta/); assert.match(log[0].text, /9002/);
    // Roqaq: one dish each side, same quantity, price fits (339 / 300 = 1.13): learned from two orders, then known.
    const l = (await admin('GET', '/api/learned')).body;
    assert.ok(l.facts.some(f => f.kind === 'item:talabat' && f.a === 'roqaq with meat' && f.b === '0199001' && f.evidence === 2));
    d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body; o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977100003'].apex.items.ok, true, 'known now');
    // Cancellations: the Talabat one is on the employee who entered the wrong dish; the Apex one on the customer.
    let c = (await admin('GET', '/api/cancels/owners?from=2026-10-22')).body.list, byKey = Object.fromEntries(c.map(x => [x.key, x]));
    assert.equal(byKey['talabat:3977100002'].owner, 'employee'); assert.equal(byKey['talabat:3977100002'].finalName, 'sara');
    assert.ok(byKey['talabat:3977100002'].why.some(w => /الأصناف/.test(w)));
    assert.equal(byKey['apex:9100'].owner, 'customer');
    // Answers teach: the same reason twice on the branch → suggested as the branch next time.
    for (const k of ['apex:9100', 'talabat:3977100002']) assert.equal((await admin('POST', '/api/cancels/owner', { key: k, day: '2026-10-22', owner: 'branch', reasonKey: 'العميل مش بيرد' })).status, 200);
    c = (await admin('GET', '/api/cancels/owners?from=2026-10-22')).body.list; byKey = Object.fromEntries(c.map(x => [x.key, x]));
    assert.equal(byKey['apex:9100'].owner, 'branch'); assert.equal(byKey['apex:9100'].confirmed.owner, 'branch'); assert.equal(byKey['apex:9100'].finalName, 'التجمع');
    assert.equal((await admin('POST', '/api/cancels/owner', { key: 'apex:9100', owner: null })).status, 200);
    assert.equal((await admin('POST', '/api/cancels/owner', { key: 'x:1', owner: 'branch' })).status, 400);
  } finally { await t.close(); }
});
