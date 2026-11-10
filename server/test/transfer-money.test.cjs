'use strict';
// Karim 10-11 («برضو ظهر أخطاء… راجع على كل الشغل»): what reaches Apex for each kind of Talabat discount, cash and paid.
// Cash: our share off on Apex, Talabat's share in the special mark, Apex totals what the customer pays + Talabat's share.
// Paid: every discount off on Apex, Apex totals what the customer paid.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('money to Apex: every kind of Talabat discount, cash and paid', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (m, p, b) => t.call(m, p, { body: b, headers: { 'x-transfer-session': sara } });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 54.15 }] } });
    await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' });
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (p, b) => t.call('POST', p, { body: b || {}, headers: { 'x-apex-writer': wt } });
    const store = 'الدهان، التجمع الخامس - البنفسج';
    let n = 0;
    const run = async ({ bill, items, payment, split }) => {
      const id = String(3977700000 + ++n), phone = '0100000' + String(1000 + n);
      await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{ id, store, status: 'ACCEPTED', placedAt: at(n), total: 999,
        detail: { customer: { name: 'C' + n, phone, address: 'x' }, items: items || [{ qty: 1, name: 'Kofta', price: 300, modifierRead: true, modifierComplete: true, options: [] }], bill } }] } });
      t.advance(9000); await as('GET', '/api/transfer/queue?day=2026-10-22');
      const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending || [];
      await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => ({ ...x, status: 'none' })) });
      const o = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body.orders.find(x => x.ref === id);
      const r = await as('POST', '/api/transfer/job', { source: 'talabat', ref: id, action: 'auto', payment, branchNo: 1, locationNo: 218, items: [{ itemNo: '0108004', qty: 1 }],
        customer: { name: 'C' + n, address: 'x' }, code: String(n), targetTotal: 1, restaurantDiscount: 999, sign: 'wrong',
        discountSplit: split ? o.discounts.map(d => (d.who && !d.unclear ? null : { text: d.text, amount: d.amount, restaurant: split })) : undefined });
      if (r.status !== 200) return { status: r.status, error: r.body.error, o };
      const j = (await w('/api/apex-writer/next')).body.job;
      await w('/api/apex-writer/result', { source: 'talabat', ref: id, ok: true, db: 'test', orderNo: 800 + n, total: 1 });
      return { status: 200, rest: j.restaurantDiscount, sign: j.sign, target: j.targetTotal, o };
    };
    const B = (...xs) => [{ k: 'المجموع الفرعي', text: 'المجموع الفرعي | 300' }, ...xs.map(([k, v]) => ({ k, text: k + ' | ' + v })), { k: 'payment', text: 'Cash' }];
    const total = v => ['مجموع', String(v)];

    // 1. No discount.
    let r = await run({ bill: B(total(340)), payment: 'cash' });
    assert.deepEqual([r.rest, r.sign, r.target], [0, '', 340], 'no discount: the browser\'s numbers are never taken');
    // 2. Funded parts (live screen): 45 ours + 45 Talabat's, with the 90 total line beside them.
    for (const pay of ['cash', 'paid']) {
      r = await run({ bill: B(['خصم', '-90.00'], ['خصم ممول من قبلك', '-45.00'], ['خصم ممول من قبل Talabat', '-45.00'], total(250)), payment: pay });
      assert.deepEqual([r.rest, r.sign, r.target], pay === 'cash' ? [45, 'خصم طلبات 45.00', 295] : [90, 'خصم طلبات 45.00', 250], 'funded split, ' + pay);
    }
    // 3. «خصم طلبات» (Talabat's).
    r = await run({ bill: B(['خصم طلبات', '-22.00'], total(318)), payment: 'cash' });
    assert.deepEqual([r.rest, r.sign, r.target], [0, 'خصم طلبات 22.00', 340]);
    // 4. A discount that does not say who: asked on cash (never guessed); the split decides; paid takes all of it off.
    r = await run({ bill: B(['Discount', '-100'], total(240)), payment: 'cash' });
    assert.equal(r.status, 400); assert.match(r.error, /حدد الخصم على مين/);
    r = await run({ bill: B(['Discount', '-100'], total(240)), payment: 'cash', split: 40 });
    assert.deepEqual([r.rest, r.sign, r.target], [40, 'خصم طلبات 60.00', 300], 'our 40 off, Talabat\'s 60 in the mark');
    r = await run({ bill: B(['Discount', '-100'], total(240)), payment: 'paid' });
    assert.deepEqual([r.rest, r.target], [100, 240]);
    // 5. «خصم 30% على بعض المنتجات | -90»: the money is 90, not 30.
    r = await run({ bill: B(['خصم 30% على بعض المنتجات', '-90.00'], total(250)), payment: 'cash', split: 45 });
    assert.deepEqual([r.rest, r.sign, r.target], [45, 'خصم طلبات 45.00', 295]);
    // 6. Under the dish (order window): the funded parts there.
    r = await run({ bill: B(total(250)), payment: 'cash', items: [{ qty: 1, name: 'Kofta', price: 300, modifierRead: true, modifierComplete: true, options: [],
      discountLines: ['خصم | -90.00 ج.م.', 'خصم 30% على بعض المنتجات | -90.00 ج.م.', 'ممول من قبلك | -45.00 ج.م.', 'ممول من قبل Talabat | -45.00 ج.م.'] }] });
    assert.deepEqual([r.rest, r.sign, r.target], [45, 'خصم طلبات 45.00', 295], 'dish discount split');
    // 7. Under the dish without who: the restaurant's (Karim 31-10).
    r = await run({ bill: B(total(270)), payment: 'cash', items: [{ qty: 1, name: 'Kofta', price: 300, modifierRead: true, modifierComplete: true, options: [{ qty: 1, name: 'خصم', price: -30 }] }] });
    assert.deepEqual([r.rest, r.sign, r.target], [30, '', 270]);
  } finally { await t.close(); }
});
