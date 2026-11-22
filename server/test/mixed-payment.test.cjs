'use strict';
// 11-20 «المختلط»: part online + the rest cash is a cash order for what the driver collects, the online part a restaurant discount.
const test = require('node:test');
const assert = require('node:assert/strict');
test('website order part online / rest cash: cash on the transfer page, target = what is collected', async () => {
  const { start } = require('./helpers.cjs'), { cairoToUtc } = require('../src/time.js');
  const t0 = cairoToUtc(2026, 11, 20, 12, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const order = { id: 30901, number: '30901', status: 'app-preparing', statusLabel: 'جاري التنفيذ', stage: 1, fulfillment: 'delivery', createdAt: s(0), branchAssignedAt: s(1), branchId: 'nasr-city', branchName: 'مدينة نصر',
      lastActionAt: s(2), paymentMethod: 'الدفع أون لاين + كاش', total: 344, driver: null, customer: { name: 'عميل', phone: '01011112222', address: 'النزهة الجديدة', note: '' },
      financial: { currency: 'EGP', due: 144, onlinePaid: 200, total: 344, rows: [{ amount: 304, label: 'الأصناف' }, { amount: 40, label: 'رسوم التوصيل' }] },
      items: [{ name: 'وجبة فراخ بانية', quantity: 1, total: '304.00 EGP', parent: '', addon: false, details: [] }] };
    const withPoints = { ...order, id: 30902, financial: { ...order.financial, due: 104, rows: [...order.financial.rows, { amount: '−٤٠٫٠٠ ج.م.', label: 'خصم نقاط المحفظة' }] }, total: 304 };
    const withBothLines = { ...withPoints, id: 30903, financial: { ...withPoints.financial, rows: [...withPoints.financial.rows, { amount: -200, label: 'مدفوع أونلاين' }] } };
    const push = orders => t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders } });
    assert.equal((await push([order, withPoints, withBothLines])).status, 200);
    const orders = (await t.call('GET', '/api/transfer/queue?day=2026-11-20', { headers: { 'x-transfer-session': sara } })).body.orders.filter(o => o.source === 'site');
    const q = orders.find(o => o.ref === '30901');
    assert.ok(q); assert.equal(q.payment, 'cash'); assert.equal(q.target, 144);
    assert.deepEqual(q.discounts.map(d => [d.text, d.amount, d.who]), [['مدفوع أونلاين', 200, 'restaurant']]);
    for (const id of ['30902', '30903']) {
      const mixed = orders.find(o => o.ref === id);
      assert.equal(mixed.target, 104);
      assert.deepEqual(mixed.discounts.map(d => [d.text, d.amount]), [['خصم نقاط المحفظة', 40], ['مدفوع أونلاين', 200]]);
    }
  } finally { await t.close(); }
});
test('payment choice: mixed accepts cash, refuses «مدفوع»', async () => {
  const { sitePaymentChoice } = await import('../src/site-payment-choice.js');
  assert.deepEqual(sitePaymentChoice('mixed', 'cash', null, false), { override: null });
  assert.ok(sitePaymentChoice('mixed', 'paid', null, false).error);
});
