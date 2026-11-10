'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 10-11: Talabat has the area, but in its own words — the Apex area chosen before for the same words is suggested.
test('transfer: the Apex area chosen for a Talabat area is suggested for the next order of that area (any spelling)', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const store = 'الدهان، التجمع الخامس - البنفسج';
    const areas = ['الرحاب 1', 'الرحاب 1‎', 'مدينة نصر - الحي الثامن'];
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: areas.map((area, i) => ({ id: '39779000' + (21 + i), store, status: 'ACCEPTED', placedAt: at(i), total: 300,
      detail: { customer: { name: 'عميل', phone: '0100000002' + i, area, address: 'شارع ما، ' + area + '، القاهرة' }, items: [], bill: [] } })) } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-10-22', online: [],
      locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 20 }, { no: 301, name: 'الرحاب طلبات', branch: 1, service: 25 }] } });
    await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' });
    t.advance(9000);
    let q = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body;
    assert.equal(q.orders.find(o => o.ref === '3977900021').areaGuess, undefined, 'nothing learned yet');
    assert.equal(q.orders.find(o => o.ref === '3977900021').customer.talabatArea, 'الرحاب 1');
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending;
    await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => ({ ...x, status: 'none' })) });
    const r = await as('POST', '/api/transfer/job', { source: 'talabat', ref: '3977900021', action: 'auto', payment: 'cash', branchNo: 1, locationNo: 301,
      items: [{ itemNo: '0108004', qty: 1 }], expectedTotal: 300, code: '21', label: 'x' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    t.advance(9000);
    q = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body;
    assert.deepEqual(q.orders.find(o => o.ref === '3977900022').areaGuess, { no: 301, seen: 1 }, 'same area, an invisible mark more');
    assert.equal(q.orders.find(o => o.ref === '3977900023').areaGuess, undefined, 'another area');
  } finally { await t.close(); }
});
