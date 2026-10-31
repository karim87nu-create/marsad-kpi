'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('transfer page: employee PIN sign-in, queue with label data, one claim at a time, entered → in Apex', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    await t.employee(admin, { name: 'علي', code: 'E2', pin: '2222' });
    assert.equal((await t.call('GET', '/api/transfer/queue')).status, 401);
    assert.equal((await t.call('POST', '/api/transfer/login', { body: { pin: '9999' } })).status, 401);
    const login = async pin => (await t.call('POST', '/api/transfer/login', { body: { pin } })).body.token;
    const sara = await login('1111'), ali = await login('2222');
    const as = tok => (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': tok } });

    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = body => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body });
    const store = 'الدهان، التجمع الخامس - البنفسج';
    await push({ codes: [{ id: '3977500001', code: '2701', store }] });
    await push({ orders: [{ id: '3977500001', store, status: 'ACCEPTED', placedAt: at(0), total: 300, detail: { receivedAt: at(0), acceptedAt: at(0.5), subtotal: 280,
      items: [{ qty: 2, name: 'Kofta', price: 280, modifiers: ['Extra bread'], modifierRead: true, modifierComplete: true }],
      customer: { name: 'Mona', address: 'Street 9', phone: '01000000000' },
      bill: [{ k: 'Subtotal', text: 'Subtotal | E£280.00' }, { k: 'Talabat-funded discount', text: 'Talabat-funded discount | -E£40.00' }, { k: 'Payment method', text: 'Payment method | Cash' }] } },
      { id: '3977500002', store, status: 'CANCELLED', placedAt: at(1), total: 50 }] });

    let q = (await as(sara)('GET', '/api/transfer/queue?day=2026-10-22')).body;
    assert.equal(q.autoTransfer, 'off', 'no automatic transfer before the bridge is proven');
    assert.equal(q.orders.length, 1, 'cancelled orders are not in the queue');
    const o = q.orders[0];
    assert.equal(o.code, '2701'); assert.equal(o.payment, 'cash');
    assert.deepEqual(o.discounts, [{ text: 'Talabat-funded discount | -E£40.00', amount: 40, who: 'platform' }]);
    assert.deepEqual(o.customer, { name: 'Mona', phone: '01000000000', address: 'Street 9' });
    assert.deepEqual(o.items[0].modifiers, ['Extra bread']);
    assert.ok(o.items[0].apex.some(a => a.no), 'known Apex item suggested');

    // One employee at a time.
    assert.equal((await as(sara)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500001', action: 'claim' })).status, 200);
    const busy = await as(ali)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500001', action: 'claim' });
    assert.equal(busy.status, 409); assert.match(busy.body.error, /سارة/);
    assert.equal((await as(sara)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500001', action: 'entered' })).status, 400, 'payment must be chosen');
    assert.equal((await as(sara)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500001', action: 'entered', payment: 'cash' })).status, 200);
    q = (await as(ali)('GET', '/api/transfer/queue?day=2026-10-22')).body;
    assert.equal(q.orders[0].job.state, 'entered'); assert.equal(q.orders[0].job.by, 'سارة'); assert.equal(q.orders[0].job.mine, false);
    assert.equal(q.orders[0].apex, null, '«entered» is the employee’s word; «in Apex» only when the monitor sees it');

    // A stale claim frees up after 10 minutes.
    await push({ orders: [{ id: '3977500003', store, status: 'ACCEPTED', placedAt: at(5), total: 90 }] });
    assert.equal((await as(ali)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500003', action: 'claim' })).status, 200);
    assert.equal((await as(sara)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500003', action: 'claim' })).status, 409);
    t.advance(11 * 60000);
    assert.equal((await as(sara)('POST', '/api/transfer/job', { source: 'talabat', ref: '3977500003', action: 'claim' })).status, 200);

    // Supervisors can open it with their admin sign-in; viewers cannot.
    assert.equal((await admin('GET', '/api/transfer/queue?day=2026-10-22')).status, 200);
  } finally { await t.close(); }
});

test('transfer page: payment and discounts only from the source words', () => {
  return import('../src/transfer.js').then(({ talabatPayment, talabatDiscounts, sitePayment }) => {
    assert.equal(talabatPayment([{ k: 'x', text: 'Total | E£ 200' }]), null, 'no payment words → not guessed');
    assert.equal(talabatPayment([{ k: 'Payment method', text: 'Payment method | Online' }]), 'paid', 'real page wording (2026-10-28 order)');
    assert.equal(talabatPayment([{ k: 'Payment method', text: 'Payment method | Cash' }]), 'cash');
    assert.equal(talabatPayment([{ k: 'Delivery type', text: 'Delivery type | Vendor delivery' }]), null, 'other lines never decide payment');
    assert.equal(talabatPayment([], 'Paid'), 'paid', 'live card badge');
    assert.equal(talabatPayment([], 'Cash Online'), null, 'conflicting → for review');
    assert.deepEqual(talabatDiscounts([{ k: 'discount', text: 'Discount | -E£ 30' }]), [{ text: 'Discount | -E£ 30', amount: 30, who: null }], 'unknown funder stays unknown');
    assert.equal(talabatDiscounts([{ k: 'discount', text: 'Vendor-funded discount | -E£ 15.50' }])[0].who, 'restaurant');
    assert.equal(sitePayment({ method: 'cod' }), 'cash');
    assert.equal(sitePayment({ method: 'paymob', paid: true }), 'paid');
    assert.equal(sitePayment({ method: 'paymob', paid: false }), 'unpaid');
    assert.equal(sitePayment(null), null);
  });
});

test('automatic transfer: off by default, cash only, frozen order handed to the writer once, result recorded', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const store = 'الدهان، التجمع الخامس - البنفسج';
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{ id: '3977600001', store, status: 'ACCEPTED', placedAt: at(0), total: 300 }] } });
    const q = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body;
    assert.equal(q.autoTransfer, 'off'); assert.equal(q.orders[0].apexBranch, 1);
    const job = { source: 'talabat', ref: '3977600001', action: 'auto', payment: 'cash', branchNo: 1, items: [{ itemNo: '0108004', qty: 2 }], expectedTotal: 300, code: '2701', label: 'اطلب/كاش #2701' };
    assert.equal((await as('POST', '/api/transfer/job', job)).status, 409, 'off until an admin turns it on');
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'live' })).status, 400, 'live needs explicit confirmation');
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' })).status, 200);
    assert.equal((await as('POST', '/api/transfer/job', { ...job, payment: 'paid' })).status, 400, 'prepaid stays manual');
    assert.equal((await as('POST', '/api/transfer/job', { ...job, items: [{ itemNo: 'x', qty: 1 }] })).status, 400);
    assert.equal((await as('POST', '/api/transfer/job', job)).status, 200);
    assert.equal((await as('POST', '/api/transfer/job', job)).status, 409, 'not sent twice');
    const wtoken = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wtoken } });
    assert.equal((await t.call('POST', '/api/apex-writer/next', { body: {}, headers: { 'x-apex-writer': 'bad' } })).status, 401);
    let n = (await w('/api/apex-writer/next')).body;
    assert.equal(n.mode, 'test'); assert.equal(n.job.ref, '3977600001'); assert.equal(n.job.db, 'test'); assert.deepEqual(n.job.items, [{ itemNo: '0108004', qty: 2, note: '' }]);
    n = (await w('/api/apex-writer/next')).body;
    assert.equal(n.job.resume, true, 'the one in flight comes back until answered, never a second one');
    assert.equal((await w('/api/apex-writer/result', { source: 'talabat', ref: '3977600001', ok: true, db: 'test', orderNo: 701, shiftSerial: 5, branchOrderNo: 3496, total: 300 })).status, 200);
    assert.equal((await w('/api/apex-writer/result', { source: 'talabat', ref: '3977600001', ok: true })).status, 409);
    assert.equal((await w('/api/apex-writer/next')).body.job, null);
    const job2 = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body.orders[0].job;
    assert.equal(job2.state, 'auto_done'); assert.equal(job2.result.orderNo, 701);
    assert.equal((await admin('GET', '/api/apex-writer')).body.jobs[0].state, 'auto_done');
    // Shadow mode: the writer only previews; the order stays for manual entry and the preview is kept.
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{ id: '3977600002', store, status: 'ACCEPTED', placedAt: at(1), total: 120 }] } });
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'shadow' })).status, 200);
    assert.equal((await as('POST', '/api/transfer/job', { ...job, ref: '3977600002' })).status, 200);
    n = (await w('/api/apex-writer/next')).body; assert.equal(n.mode, 'shadow'); assert.equal(n.job.db, 'shadow');
    assert.equal((await w('/api/apex-writer/result', { source: 'talabat', ref: '3977600002', ok: true, preview: true, db: 'shadow', total: 120.5, detail: 'sub=105.7' })).status, 200);
    const pj = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body.orders.find(o => o.ref === '3977600002').job;
    assert.equal(pj.state, 'auto_preview'); assert.equal(pj.result.preview, true); assert.equal(pj.result.detail, 'sub=105.7');
  } finally { await t.close(); }
});
