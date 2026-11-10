'use strict';
// Karim 10-11: website orders read from the central panel by the extension (no request to the website).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('website central panel: orders, items, money, branch and times reach the transfer page and the day', async () => {
  const t0 = cairoToUtc(2026, 11, 10, 21, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 30 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = (orders, board = 'central') => t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board, orders } });
    assert.equal((await t.call('POST', '/api/site/panel', { body: { orders: [] } })).status, 401);
    const order = (stage, extra = {}) => ({ id: 30824, number: '30824', status: 'app-preparing', statusLabel: 'جاري التنفيذ', stage, fulfillment: 'delivery', createdAt: s(0), branchAssignedAt: s(1), branchId: 'nasr-city', branchName: 'مدينة نصر',
      lastActionAt: s(2), paymentMethod: 'كاش عند الاستلام', total: 1615.5, driver: null,
      customer: { name: 'نوره حسن', phone: '01097159082', address: '26 شارع أبو السعود، النزهة الجديدة', note: 'من غير بصل' },
      financial: { currency: 'EGP', due: 1615.5, onlinePaid: 0, total: 1615.5, rows: [{ amount: 1775.5, label: 'الأصناف والإضافات قبل الخصم' }, { amount: 40, label: 'رسوم التوصيل' }, { amount: -200, label: 'تسويات مسجلة في الطلب' }] },
      items: [{ name: 'طاجن لحمة بالبصل', quantity: 1, total: '321.00 EGP', parent: '', addon: false, details: [{ label: 'اختيارات السلطة المجانية', value: 'خيار مخلل (ضمن الوجبة)' }] },
        { name: 'طحينة', quantity: 1, total: '25.00 EGP', parent: 'صدور مشوية', addon: true, details: [] }], ...extra });
    assert.equal((await push([order(1)])).status, 200);
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-11-10', { headers: { 'x-transfer-session': sara } })).body.orders.find(o => o.source === 'site');
    assert.ok(q, 'on the transfer page');
    assert.equal(q.ref, '30824'); assert.equal(q.payment, 'cash'); assert.equal(q.target, 1615.5); assert.equal(q.branch, 'مدينة نصر'); assert.equal(q.note, 'من غير بصل');
    assert.equal(q.items.length, 2); assert.equal(q.items[0].name, 'طاجن لحمة بالبصل');
    assert.deepEqual(q.discounts.map(d => [d.amount, d.who]), [[200, 'restaurant']], 'the panel\'s adjustment is the restaurant\'s discount');
    // Out with a driver, then gone from the central board → delivered.
    t.advance(20 * 60000); await push([order(3, { driver: { name: 'محمد' } })]);
    t.advance(25 * 60000); await push([{ ...order(1), id: 30825, number: '30825' }]);
    const row = t.app.db.raw.prepare('SELECT * FROM site_orders WHERE id = 30824').get();
    assert.equal(row.transfer_at, s(1) * 1000); assert.equal(row.driver, 'محمد'); assert.ok(row.out_at && row.delivered_at > row.out_at); assert.equal(row.status, 'completed');
    assert.equal((await admin('GET', '/api/site')).body.linked, true, 'the website counts as linked while the panel reports');
  } finally { await t.close(); }
});

test('website central panel: an order the Marsad wrote on Apex and still without a branch is sent to that branch; one with a branch is left alone', async () => {
  const t0 = cairoToUtc(2026, 11, 11, 21, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = (orders, board = 'central') => t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board, orders } });
    const o = (id, extra = {}) => ({ id, number: String(id), status: 'app-new', stage: 0, fulfillment: 'delivery', createdAt: s(0), branchId: '', branchName: '', total: 300,
      customer: { name: 'عميل', phone: '01000000000', address: 'x' }, financial: { due: 300, onlinePaid: 0, rows: [] }, items: [], ...extra });
    assert.deepEqual((await push([o(40001), o(40002)])).body.assign, [], 'nothing written on Apex yet');
    const db = t.app.db.raw;
    const job = (ref, state, branchNo) => db.prepare('INSERT INTO transfer_jobs (source, ref, day, state, at, payload) VALUES (?,?,?,?,?,?)').run('site', String(ref), '2026-11-11', state, t0, JSON.stringify({ branchNo }));
    job(40001, 'auto_done', 2); job(40002, 'auto_pending', 1); job(40003, 'auto_done', 3);
    const r = (await push([o(40001), o(40002), o(40003, { branchId: 'nasr-city', branchName: 'مدينة نصر' })])).body.assign;
    assert.deepEqual(r, [{ orderId: 40001, branchId: 'nasr-city' }], 'only the written order without a branch');
    assert.deepEqual((await push([o(40001)], 'branch')).body.assign, [], 'never from a branch board');
  } finally { await t.close(); }
});
