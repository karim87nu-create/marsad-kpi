'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('talabat: monitor key, orders with details, Apex match (auto and manual), alerts', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 30 * 60000 });
  try {
    const admin = await t.admin();
    const emp = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: emp.id });
    assert.equal((await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': 'x' }, body: {} })).status, 401);
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    assert.match(token, /^tal_[a-f0-9]{48}$/);
    const push = orders => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders } });
    // List only first: the server asks for the details.
    let r = await push([{ id: '3977400001', store: 'الدهان، التجمع الخامس - البنفسج', status: 'ACCEPTED', placedAt: at(0), total: 300 },
      { id: '3977400002', store: 'الدهان, مدينتي - ساوث بارك', status: 'ACCEPTED', placedAt: at(2), total: 120 },
      { id: '3977400003', store: 'الدهان, مدينتي - ساوث بارك', status: 'CANCELLED', placedAt: at(5), total: 323 }]);
    assert.deepEqual(r.body.want.sort(), ['3977400001', '3977400002', '3977400003']);
    r = await push([
      { id: '3977400001', status: 'ACCEPTED', detail: { receivedAt: at(0), acceptSeconds: 31, acceptedAt: at(0.5), items: [{ qty: 2, name: 'Kofta', price: 280 }], subtotal: 280, deliveryType: 'Vendor delivery', billable: 'PAYABLE' } },
      { id: '3977400002', status: 'ACCEPTED', detail: { receivedAt: at(2), acceptSeconds: 9, acceptedAt: at(2.2), items: [{ qty: 1, name: 'Rice', price: 120 }], subtotal: 120 } },
      { id: '3977400003', status: 'CANCELLED', detail: { receivedAt: at(5), acceptSeconds: 9, acceptedAt: at(5.2), pickedUpAt: at(7), cancelledAt: at(25), cancelOwner: 'Owner: Customer', cancelReason: 'Unable to find or reach customer', items: [], subtotal: 323 } }]);
    assert.deepEqual(r.body.want, [], 'just read');
    t.advance(61000);
    assert.deepEqual((await push([])).body.want.sort(), ['3977400001', '3977400002'], 'open orders read again a minute later; the cancelled one is final');
    // Apex: one Talabat order entered at Tagamoa 3 minutes after acceptance; nothing for Madinaty.
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online: [
      { no: 7001, kind: 'طلبات', branch: 'التجمع', at: at(3.5), user: 'sara.m', amount: 280 },
      { no: 7002, kind: 'طلبات', branch: 'مدينتي', at: at(-5), user: 'ahmed', amount: 999 }] } });
    let d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    let o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977400001'].apex.no, 7001); assert.equal(o['3977400001'].apex.user, 'سارة');
    assert.equal(o['3977400002'].apex, null, '7002 was entered before the order existed');
    assert.equal(o['3977400003'].cancelReason, 'Unable to find or reach customer');
    assert.deepEqual(o['3977400001'].items, [{ qty: 2, name: 'Kofta', price: 280 }]);
    // Manual link.
    assert.equal((await admin('POST', '/api/talabat/link', { talabatId: '3977400002', apexNo: 7002 })).status, 200);
    d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body; o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977400002'].apex.no, 7002); assert.equal(o['3977400002'].apex.manual, true);
    assert.equal(d.unmatchedApex.length, 0);
    // Alerts: the cancellation to the branches group; 3977400002 was unmatched > 10 min at the earlier push.
    const kinds = t.app.db.raw.prepare("SELECT kind, target FROM telegram_log WHERE kind LIKE 'talabat%' ORDER BY kind").all();
    assert.deepEqual(kinds.map(k => k.kind + ':' + k.target), ['talabatCancel:branches']);
  } finally { await t.close(); }
});
