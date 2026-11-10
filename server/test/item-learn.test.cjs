'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 10-11 «والأصناف برضو بتطلب اختيار»: a dish with several Apex sizes/offers gets the one staff chose before.
test('transfer: the Apex item staff chose before for the same Talabat dish is picked when there are several', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const db = t.app.db.raw;
    // Matched orders taught two Apex items for «kofta» (two sizes).
    for (const [no, n] of [['0108002', 3], ['0108004', 3]]) for (let i = 0; i < n; i++) db.prepare("INSERT INTO learned (kind,a,b,ref,value,at) VALUES ('match-v2:item:talabat','kofta',?,?,NULL,?)").run(no, 'old' + no + i, t0);
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const store = 'الدهان، التجمع الخامس - البنفسج';
    const orders = ['3977900031', '3977900032', '3977900033'];
    // Two (done before) earlier transfers where staff chose the half kilo.
    for (const ref of orders.slice(0, 2)) db.prepare("INSERT INTO transfer_jobs (source, ref, day, state, at, payload) VALUES ('talabat', ?, '2026-10-22', 'auto_done', ?, ?)").run(ref, t0, JSON.stringify({ items: [{ itemNo: '0108004', qty: 1 }] }));
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: orders.map((id, i) => ({ id, store, status: 'ACCEPTED', placedAt: at(i), total: 300,
      detail: { customer: { name: 'عميل', phone: '0100000003' + i }, items: [{ name: 'Kofta', qty: 1, price: 300 }], bill: [] } })) } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 20 }] } });
    await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' });
    t.advance(9000);
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-10-22', { headers: { 'x-transfer-session': sara } })).body;
    const line = q.orders.find(o => o.ref === orders[2]).items[0];
    assert.ok(line.apex.length > 1 && line.apex.some(a => a.no === '0108002'), 'the other sizes stay in the list');
    assert.equal(line.apexPick, '0108004', 'the one staff chose twice is picked');
  } finally { await t.close(); }
});
