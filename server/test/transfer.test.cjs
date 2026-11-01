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
    assert.equal(q.autoTransfer, 'shadow', 'no writing before the bridge is proven: preview only');
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
    assert.deepEqual(talabatDiscounts([{ k: 'discount', text: 'Discount | -E£ 30' }]), [{ text: 'Discount | -E£ 30', amount: 30, who: 'platform' }], 'a bill-summary discount is Talabat funded unless it says otherwise');
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
    assert.equal(q.autoTransfer, 'shadow', 'until an admin chooses, it only previews'); assert.equal(q.orders[0].apexBranch, 1);
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'off' })).status, 200);
    const job = { source: 'talabat', ref: '3977600001', action: 'auto', payment: 'cash', branchNo: 1, locationNo: 370, items: [{ itemNo: '0108004', qty: 2 }], expectedTotal: 300, code: '2701', label: 'اطلب/كاش #2701' };
    assert.equal((await as('POST', '/api/transfer/job', job)).status, 409, 'off until an admin turns it on');
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'live' })).status, 400, 'live needs explicit confirmation');
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' })).status, 200);
    assert.equal((await as('POST', '/api/transfer/job', { ...job, payment: 'unknown' })).status, 400, 'payment must be stated');
    assert.equal((await as('POST', '/api/transfer/job', { ...job, items: [{ itemNo: 'x', qty: 1 }] })).status, 400);
    // The area decides the branch (Karim 01-11): an area of Madinaty (3) cannot go to Tagamoa (1).
    const okey0 = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey0 }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 370, name: 'مدنتى', branch: 3, service: 39.47 }, { no: 218, name: 'التجمع الخامس', branch: 1, service: 54.15 }] } });
    const wrong = await as('POST', '/api/transfer/job', job);
    assert.equal(wrong.status, 400); assert.match(wrong.body.error, /المنطقة دي تبع مدينتى/);
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey0 }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 370, name: 'مدنتى', branch: 1, service: 39.47 }] } });
    assert.equal((await as('POST', '/api/transfer/job', job)).status, 200);
    assert.equal((await as('POST', '/api/transfer/job', job)).status, 409, 'not sent twice');
    const wtoken = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wtoken } });
    assert.equal((await t.call('POST', '/api/apex-writer/next', { body: {}, headers: { 'x-apex-writer': 'bad' } })).status, 401);
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    if (okey) assert.equal((await t.call('POST', '/api/apex-writer/next', { body: {}, headers: { 'x-apex-writer': okey } })).status, 200, 'the monitor key opens the writer too');
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

test('Talabat live screen (Arabic) payment: the payment line decides, never «التحصيل من العميل»', () => {
  return import('../src/transfer.js').then(({ talabatPayment }) => {
    const paid = [{ k: 'المجموع الفرعي', text: 'المجموع الفرعي | 389.00 ج.م' }, { k: 'رسوم التوصيل', text: 'رسوم التوصيل | 40.00 ج.م' }, { k: 'التحصيل من العميل', text: 'التحصيل من العميل | 0.00 ج.م' }, { k: 'payment', text: 'ONLINE' }, { k: 'payment', text: 'تم الدفع بواسطة CREDIT_CARD' }];
    assert.equal(talabatPayment(paid), 'paid', 'real live screen 2026-10-31: online card, nothing to collect');
    assert.equal(talabatPayment([{ k: 'التحصيل من العميل', text: 'التحصيل من العميل | 437.00 ج.م' }]), null, 'the collect amount alone says nothing');
    assert.equal(talabatPayment([{ k: 'التحصيل من العميل', text: 'التحصيل من العميل | 0.00 ج.م' }, { k: 'payment', text: 'CASH' }]), 'cash', 'a cash order can show 0.00 to collect');
  });
});

test('transfer page: a discount under the dish is split by who funds it (real order #9171, 31-10-2026)', async () => {
  const t0 = cairoToUtc(2026, 10, 31, 19, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const tok = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = body => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body });
    const store = 'الدهان سيتي ستار مول، مدينة نصر';
    await push({ codes: [{ id: '4688946021', code: '9171', store }] });
    await push({ orders: [{ id: '4688946021', store, status: 'ACCEPTED', placedAt: at(0), total: 256.63, detail: { receivedAt: at(0), acceptedAt: at(0.5), subtotal: 299,
      items: [{ qty: 1, name: 'عرض وجبة نصف دجاجة مشوية', price: 299, modifiers: [], modifierRead: true, modifierComplete: true, options: [],
        discountLines: ['خصم | -89.70 ج.م.', 'خصم 30% على بعض المنتجات | -89.70 ج.م.', 'ممول من قبلك | -44.85 ج.م.', 'ممول من قبل Talabat | -44.85 ج.م.'] }],
      bill: [{ k: 'المجموع الفرعي', text: 'المجموع الفرعي | 299.00 ج.م.' }, { k: 'Item Discounts', text: 'Item Discounts | -89.70 ج.م.' }, { k: 'مجموع', text: 'مجموع | 256.63 ج.م.' }, { k: 'التحصيل من العميل', text: 'التحصيل من العميل | 0.00 ج.م.' }] } }] });
    const o = (await t.call('GET', '/api/transfer/queue?day=2026-10-31', { headers: { 'x-transfer-session': tok } })).body.orders[0];
    assert.deepEqual(o.discounts.map(d => [d.who, d.amount]).sort(), [['platform', 44.85], ['restaurant', 44.85]], 'half the restaurant\'s (deducted), half Talabat\'s (special mark); the bill\'s total is not counted again');
    assert.deepEqual(o.items[0].freeOptions, [], 'discount lines are not comments');
    assert.equal(o.target, 301.48, 'Apex must total what the customer pays plus Talabat\'s share');
  } finally { await t.close(); }
});

test('Talabat/Apex: admin\'s stop changes are queued per outlet and per Apex branch, applied only when turned on, and removed once done', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 31, 21, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const scr = { 'x-talabat-token': token };
    let c = (await admin('GET', '/api/talabat/stock-config')).body;
    const nefa = c.products.find(p => p.name === 'Nefa').id;
    await admin('POST', '/api/talabat/stock-config', { store: 'الدهان سيتي ستار مول، مكرم عبيد', stopped: [nefa, 'not-a-dish'] });
    assert.equal((await t.call('GET', '/api/talabat/stock')).status, 401);
    let s = (await t.call('GET', '/api/talabat/stock', { headers: scr })).body;
    assert.equal(s.apply, false, 'nothing is applied until admin turns it on');
    assert.deepEqual(s.queue, { 'HF_EG;608556': { [nefa]: 'stop' } }, 'Makram Ebeid outlet');
    const { token: wt } = (await admin('POST', '/api/apex-writer', { action: 'token' })).body;
    const w = { 'x-apex-writer': wt };
    assert.deepEqual((await t.call('POST', '/api/apex-writer/stock-next', { headers: w, body: {} })).body, { apply: false, queue: {} });
    await admin('POST', '/api/talabat/stock-config', { action: 'apply', talabat: true, apex: true });
    const aq = (await t.call('POST', '/api/apex-writer/stock-next', { headers: w, body: {} })).body.queue;
    assert.ok(Object.keys(aq['2'] || {}).length >= 1 && Object.values(aq['2']).every(v => v === 'stop'), 'Apex branch 2: the Nefa items');
    await t.call('POST', '/api/talabat/stock/report', { headers: scr, body: { outlet: 'HF_EG;608556', outletName: 'El Dahan, Makram Ebeid', unavailable: [nefa], done: [{ id: nefa, act: 'stop', ok: true }] } });
    s = (await t.call('GET', '/api/talabat/stock', { headers: scr })).body;
    assert.deepEqual(s.queue, {}, 'done → off the queue');
    await t.call('POST', '/api/apex-writer/stock', { headers: w, body: { done: Object.keys(aq['2']).map(no => ({ branch: 2, itemNo: no, act: 'stop', ok: true })) } });
    assert.deepEqual((await t.call('POST', '/api/apex-writer/stock-next', { headers: w, body: {} })).body.queue, { 2: {} });
    c = (await admin('GET', '/api/talabat/stock-config')).body;
    assert.deepEqual(c.actual['HF_EG;608556'].unavailable, [nefa]);
    // Resuming queues the opposite change.
    await admin('POST', '/api/talabat/stock-config', { store: 'الدهان سيتي ستار مول، مكرم عبيد', stopped: [] });
    assert.deepEqual((await t.call('GET', '/api/talabat/stock', { headers: scr })).body.queue, { 'HF_EG;608556': { [nefa]: 'resume' } });
  } finally { await t.close(); }
});

test('Talabat: an extra Firefox profile (a branch\'s Live Orders) gets its own key without stopping the main screen', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 31, 22, 0, 0) });
  try {
    const admin = await t.admin();
    const main = (await admin('POST', '/api/talabat/token')).body.token;
    const extra = (await admin('POST', '/api/talabat/token', { extra: true })).body.token;
    const push = tok => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': tok }, body: { codes: [{ id: '4688946021', code: '9171', store: 'الدهان، مدينتي' }] } });
    assert.equal((await push(main)).status, 200, 'main still works');
    const r = await push(extra);
    assert.equal(r.status, 200, 'extra works too');
    assert.equal(r.body.phones, false, 'only the main screen sends WhatsApp');
    assert.equal((await t.call('GET', '/api/talabat/actions', { headers: { 'x-talabat-token': extra } })).status, 200);
    assert.equal((await push('tal_' + '0'.repeat(48))).status, 401);
    const dev = await t.call('POST', '/api/talabat/push', { headers: { 'x-device-token': '7000865f1220458f86506b41a97cab7d' }, body: { codes: [{ id: '4688946022', code: '9172', store: 'الدهان، مدينتي' }] } });
    assert.equal(dev.status, 200, 'a Live Orders tab on any PC with the extension works without linking');
    assert.equal(dev.body.phones, false);
    assert.equal((await t.call('POST', '/api/talabat/push', { headers: { 'x-device-token': 'nope' }, body: { codes: [] } })).status, 401);
  } finally { await t.close(); }
});

test('Talabat: an order first seen on a live screen shows on the transfer page at once (before Order History has it)', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 31, 23, 0, 0) });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const tok = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    await t.call('POST', '/api/talabat/push', { headers: { 'x-device-token': '7000865f1220458f86506b41a97cab7d' }, body: { codes: [{ id: '4689282172', code: '9301', store: 'الدهان سيتي ستار مول، مكرم عبيد' }] } });
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-10-31', { headers: { 'x-transfer-session': tok } })).body;
    assert.deepEqual(q.orders.map(o => [o.ref, o.code]), [['4689282172', '9301']]);
  } finally { await t.close(); }
});

test('transfer page: a live order read from the page data (real shape, 01-11-2026) gives customer, paid, discount by funder, English dish names and Arabic add-ons on Apex', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 31, 15, 20, 0) });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const tok = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const dev = { 'x-device-token': '7000865f1220458f86506b41a97cab7d' };
    await t.call('POST', '/api/talabat/push', { headers: dev, body: { codes: [{ id: '4688138970', code: '3356', store: 'الدهان, مدينتي - ساوث بارك', pay: 'ONLINE' }] } });
    await t.call('POST', '/api/talabat/push', { headers: dev, body: { orders: [{ id: '4688138970', store: 'الدهان, مدينتي - ساوث بارك', detail: {
      receivedAt: '2026-10-31T13:10:52.026Z', acceptedAt: '2026-10-31T13:10:57.324Z', subtotal: 565,
      customer: { name: 'Hend Atia', phone: '01202427365', address: 'الاسكان القومي، الشروق - المنطقة الاولي، القاهرة — مبنى: 4 — الدور: الاول — الشقة: شقة 11' },
      items: [{ qty: 1, name: 'ساندوتش كباب', productId: '3114762279', price: 179, options: [{ qty: 1, name: 'رول', price: 0, productId: '3114764287' }] },
        { qty: 1, name: 'نصف دجاجة مشوية علي الفحم', productId: '3114762439', price: 226, options: [{ qty: 2, name: 'ممبار', price: 50, productId: '3114765000' }] },
        { qty: 1, name: 'ممبار', productId: '3114762263', price: 110, options: [] }],
      bill: [{ k: 'المجموع الفرعي', text: 'المجموع الفرعي | 565' }, { k: 'رسوم الخدمة', text: 'رسوم الخدمة | 8' }, { k: 'رسوم التوصيل', text: 'رسوم التوصيل | 40' },
        { k: 'خصم ممول من قبلك', text: 'خصم ممول من قبلك | -40.75' }, { k: 'خصم ممول من قبل Talabat', text: 'خصم ممول من قبل Talabat | -20' },
        { k: 'مجموع', text: 'مجموع | 552.25' }, { k: 'التحصيل من العميل', text: 'التحصيل من العميل | 0' }, { k: 'payment', text: 'ONLINE' }, { k: 'payment', text: 'تم الدفع بواسطة CREDIT_CARD' },
        { k: 'ملاحظة العميل', text: 'ملاحظة العميل | من غير بصل' }] } }] } });
    const o = (await t.call('GET', '/api/transfer/queue?day=2026-10-31', { headers: { 'x-transfer-session': tok } })).body.orders[0];
    assert.equal(o.code, '3356'); assert.equal(o.payment, 'paid'); assert.equal(o.branch, 'الدهان, مدينتي - ساوث بارك', 'the name Order History uses');
    assert.equal(o.customer.phone, '01202427365'); assert.match(o.customer.address, /الدور: الاول/);
    assert.deepEqual(o.discounts.map(d => [d.who, d.amount]).sort(), [['platform', 20], ['restaurant', 40.75]]);
    assert.equal(o.target, 572.25, 'what the customer pays + Talabat\'s share');
    assert.equal(o.note, 'من غير بصل');
    assert.deepEqual(o.items.map(i => i.name), ['Kebab Sandwich', 'Half grilled chicken on charcoal', 'Mombar'], 'menu names from the product number');
    assert.ok(o.items[1].apex.some(a => a.no === '0107001'), 'half chicken suggested');
    assert.deepEqual(o.items[1].addons.map(a => [a.name, a.qty, a.apex.map(x => x.no)]), [['ممبار', 2, ['0103001']]], 'paid Arabic add-on → its Apex item');
    assert.deepEqual(o.items[0].freeOptions, ['رول']);
  } finally { await t.close(); }
});
