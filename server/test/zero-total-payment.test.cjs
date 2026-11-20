'use strict';
// 11-20: a website order the discount covers completely (customer pays 0) is never held or refused over how it is paid.
const test = require('node:test');
const assert = require('node:assert/strict');
test('zero total: any payment method passes, a real total still checks', async () => {
  const { sitePaymentChoice } = await import('../src/site-payment-choice.js');
  assert.deepEqual(sitePaymentChoice('online-unpaid', 'cash', null, false, true), { override: null });
  assert.deepEqual(sitePaymentChoice('unknown', 'paid', null, false, true), { override: null });
  assert.ok(sitePaymentChoice('online-unpaid', 'cash', null, false, false).error, 'a real amount keeps the check');
  assert.ok(sitePaymentChoice('cod', 'bogus', null, false, true).error, 'still needs cash or paid');
});

test('zero total: the transfer page shows the website order as cash, not «مش واضحة»', async () => {
  const { start } = require('./helpers.cjs'), { cairoToUtc } = require('../src/time.js');
  const t0 = cairoToUtc(2026, 11, 20, 12, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const order = { id: 30900, number: '30900', status: 'app-preparing', statusLabel: 'جاري التنفيذ', stage: 1, fulfillment: 'delivery', createdAt: s(0), branchAssignedAt: s(1), branchId: 'nasr-city', branchName: 'مدينة نصر',
      lastActionAt: s(2), paymentMethod: '', total: 0, driver: null, customer: { name: 'عميل', phone: '01011112222', address: 'النزهة الجديدة', note: '' },
      financial: { currency: 'EGP', due: 0, onlinePaid: 0, total: 0, rows: [{ amount: 322, label: 'الأصناف والإضافات قبل الخصم' }, { amount: -322, label: 'تسويات مسجلة في الطلب' }] },
      items: [{ name: 'وجبة فراخ بانية', quantity: 1, total: '322.00 EGP', parent: '', addon: false, details: [] }] };
    assert.equal((await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders: [order] } })).status, 200);
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-11-20', { headers: { 'x-transfer-session': sara } })).body.orders.find(o => o.source === 'site');
    assert.ok(q); assert.equal(q.payment, 'cash');
  } finally { await t.close(); }
});
