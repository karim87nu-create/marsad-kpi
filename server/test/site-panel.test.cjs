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
    const full = order(1);
    assert.equal((await push([order(1, { customer: { ...full.customer, addressDetails: { building: '26', floor: '3', flat: '12', landmark: 'البوابة الزرقاء' } } })])).status, 200);
    assert.equal((await push([full])).status, 200, 'a partial refresh must preserve the fuller address');
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-11-10', { headers: { 'x-transfer-session': sara } })).body.orders.find(o => o.source === 'site');
    assert.ok(q, 'on the transfer page');
    assert.match(q.customer.address, /الدور: 3.*الشقة: 12.*البوابة الزرقاء/);
    assert.equal(q.ref, '30824'); assert.equal(q.payment, 'cash'); assert.equal(q.target, 1615.5); assert.equal(q.branch, 'مدينة نصر'); assert.equal(q.note, 'من غير بصل');
    assert.equal(q.items.length, 2); assert.equal(q.items[0].name, 'طاجن لحمة بالبصل');
    assert.deepEqual(q.discounts.map(d => [d.amount, d.who]), [[200, 'restaurant']], 'the panel\'s adjustment is the restaurant\'s discount');
    // Karim 11-11 «المناطق معروفه»: the area the customer chose on the website, taken like Talabat's.
    assert.equal(q.customer.siteArea, 'النزهة الجديدة');
    assert.equal(q.areaGuess, undefined, 'nothing learned yet');
    const { normArabic } = require('../src/apex-customer-notes.js');
    for (const r of ['a', 'b', 'c']) t.app.db.raw.prepare("INSERT INTO learned (kind, a, b, ref, value, at) VALUES ('transfer:area', ?, '28', ?, NULL, ?)").run(normArabic('النزهة الجديدة'), r, t0);
    t.app.learn.forget?.(); t.advance(9000);
    const q2 = (await t.call('GET', '/api/transfer/queue?day=2026-11-10', { headers: { 'x-transfer-session': sara } })).body.orders.find(o => o.source === 'site');
    assert.deepEqual(q2.areaGuess, { no: 28, seen: 3, share: 1 }, 'what staff chose for Talabat orders of the same area');
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
    const job = (ref, state, branchNo) => db.prepare('INSERT INTO transfer_jobs (source, ref, day, state, at, payload) VALUES (?,?,?,?,?,?)').run('site', String(ref), '2026-11-11', state, t0, JSON.stringify({ branchNo, db: 'live' }));
    job(40001, 'auto_done', 2); job(40002, 'auto_pending', 1); job(40003, 'auto_done', 3);
    const r = (await push([o(40001), o(40002), o(40003, { branchId: 'nasr-city', branchName: 'مدينة نصر' })])).body.assign;
    assert.deepEqual(r, [{ orderId: 40001, branchId: 'nasr-city' }], 'only the written order without a branch');
    assert.deepEqual((await push([o(40001)], 'branch')).body.assign, [], 'never from a branch board');
    db.prepare('INSERT INTO transfer_jobs (source, ref, day, state, at, payload) VALUES (?,?,?,?,?,?)').run('site', '40004', '2026-11-11', 'auto_done', t0, JSON.stringify({ branchNo: 1, db: 'test' }));
    assert.deepEqual((await push([o(40004)])).body.assign, [], 'written on Apex\'s test copy: not sent to a branch');
  } finally { await t.close(); }
});

// The four orders the live central panel showed on 11-11 (names and phones replaced).
test('website central panel, real orders 11-11: payment from the panel\'s words, weight as the size, hashtag, safety checks', async () => {
  const t0 = cairoToUtc(2026, 11, 11, 21, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 20 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const base = (id, extra) => ({ id, number: String(id), status: 'app-preparing', statusLabel: 'جاري التنفيذ', stage: 0, fulfillment: 'delivery', createdAt: s(0), lastActionAt: s(1),
      customer: { name: 'عميل ' + id, phone: '0100000' + id, address: 'شارع ' + id }, driver: null, ...extra });
    const fin = (due, label, rows, onlinePaid = 0) => ({ currency: 'EGP', due, dueLabel: label, onlinePaid, rows, total: due });
    const orders = [
      base(30831, { branchId: 'nasr-city', branchName: 'مدينة نصر', paymentMethod: 'كاش عند الاستلام', total: 344, financial: fin(344, 'المطلوب تحصيله', [{ amount: 404, label: 'الأصناف والإضافات قبل الخصم' }, { amount: 40, label: 'رسوم التوصيل' }, { amount: -100, label: 'تسويات مسجلة في الطلب' }]),
        items: [{ name: 'عرض ميكس جريل وفر 96 جنيه', quantity: 1, total: '299.00 EGP', parent: '', addon: false, details: [] }, { name: 'ورق عنب', quantity: 1, total: '105.00 EGP', parent: '', addon: false, details: [] }] }),
      base(30830, { branchId: 'tagamoa-cloud', branchName: 'التجمع الخامس', paymentMethod: 'الدفع أون لاين - Visa / Card', total: 144, financial: fin(144, 'متبقي للدفع أونلاين', [{ amount: 104, label: 'الأصناف والإضافات قبل الخصم' }, { amount: 40, label: 'رسوم التوصيل' }]),
        items: [{ name: 'عروض حواوشي الدهان', quantity: 1, total: '104.00 EGP', parent: '', addon: false, details: [] }] }),
      base(30829, { stage: 1, branchId: 'madinaty-craft-zone', branchName: 'مدينتي', paymentMethod: 'المحفظة + الباقي كاش عند الاستلام', total: 356.5,
        financial: fin(356.5, 'المطلوب تحصيله', [{ amount: 584.5, label: 'الأصناف والإضافات قبل الخصم' }, { amount: 40, label: 'رسوم التوصيل' }, { amount: -40, label: 'خصم نقاط المحفظة' }, { amount: -228, label: 'تسويات مسجلة في الطلب' }]),
        items: [{ name: 'الكفته', quantity: 1, total: '584.50 EGP', parent: '', addon: false, details: [{ label: 'الوزن', value: 'نص كيلو' }, { label: 'اختيارات السلطة المجانية', value: 'سلطة بلدي (ضمن الوجبة)، بابا غنوج × 2 (ضمن الوجبة)' }] }] }),
      base(30828, { stage: 2, status: 'app-ready-pickup', branchId: 'nasr-city', branchName: 'مدينة نصر', paymentMethod: 'كاش عند الاستلام', total: 370.25,
        financial: fin(370.25, 'المطلوب تحصيله', [{ amount: 530.25, label: 'الأصناف والإضافات قبل الخصم' }, { amount: 40, label: 'رسوم التوصيل' }, { amount: -200, label: 'تسويات مسجلة في الطلب' }]),
        items: [{ name: 'الكفته', quantity: 1, total: '304.25 EGP', parent: '', addon: false, details: [{ label: 'الوزن', value: 'ربع كيلو' }, { label: 'اختيارات السلطة المجانية', value: 'سلطة بلدي (ضمن الوجبة)' }] },
          { name: 'نص فرخة شيش', quantity: 1, total: '226.00 EGP', parent: '', addon: false, details: [{ label: 'اختيارات السلطة المجانية', value: 'طحينة (ضمن الوجبة)' }] }] }),
      base(30900, { fulfillment: 'pickup', branchId: 'nasr-city', branchName: 'مدينة نصر', paymentMethod: 'الدفع أون لاين - Visa / Card', total: 200, financial: fin(0, 'تم الدفع', [{ amount: 200, label: 'الأصناف' }], 200), items: [{ name: 'ورق عنب', quantity: 1, total: '200.00 EGP', details: [] }] }),
    ];
    assert.equal((await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders } })).status, 200);
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-11-11', { headers: { 'x-transfer-session': sara } })).body.orders.filter(o => o.source === 'site');
    const by = id => q.find(o => o.ref === String(id));
    assert.equal(by(30831).payment, 'cash'); assert.equal(by(30831).code, '30831'); assert.equal(by(30831).apexBranch, 2); assert.equal(by(30831).target, 344);
    assert.equal(by(30830).payment, 'unpaid', 'online, payment not complete: never cash'); assert.equal(by(30830).apexBranch, 1);
    assert.equal(by(30829).payment, 'cash', 'wallet + rest cash'); assert.equal(by(30829).apexBranch, 3);
    assert.deepEqual(by(30829).discounts.map(d => [d.text, d.amount]), [['خصم نقاط المحفظة', 40], ['تسويات مسجلة في الطلب', 228]]);
    assert.equal(by(30900).payment, 'paid');
    const k29 = by(30829).items[0], k28 = by(30828).items[0];
    assert.equal(k29.sizeOption, 'نص كيلو'); assert.equal(k28.sizeOption, 'ربع كيلو');
    assert.notEqual(k29.choiceKey, k28.choiceKey, 'a half-kilo choice is never offered for a quarter kilo');
    assert.ok(k29.freeOptions.some(x => /سلطة بلدي/.test(x)), 'free salads go to the note');
    for (const o of q) for (const i of o.items) for (const a of i.apex) if (i.size) assert.ok(new RegExp(i.size === 'نص كيلو' ? 'نص|1/2|0\\.5|500' : 'ربع|1/4|250').test(a.name), i.name + ' ' + i.sizeOption + ' → ' + a.name);
    // The website → Apex table picks the item; the weight picks the size.
    const pick = (ref, n = 0) => by(ref).items[n].apexPick || null;
    assert.equal(pick(30829), '0108002', 'الكفته نص كيلو → 1/2كيلو كفتة');
    assert.equal(pick(30828, 0), '0108004', 'الكفته ربع كيلو → 1/4كيلو كفتة');
    assert.equal(pick(30828, 1), '0107002', 'نص فرخة شيش');
    assert.equal(pick(30831, 0), '0115014', 'عرض ميكس جريل وفر 96 جنيه → عرض ميكس جريل صغير موقعنا');
    assert.equal(pick(30831, 1), '0103002', 'ورق عنب');
    assert.equal(pick(30830), '0117068', 'عروض حواوشي الدهان → عرض وجبة حواوشي موقعنا');
    // A pickup: the branch's «استلام فرع» area is offered.
    assert.deepEqual([by(30900).fulfillment, by(30900).areaGuess?.no], ['pickup', 268]);
    // The safety checks on the automatic transfer.
    const auto = (ref, extra) => t.call('POST', '/api/transfer/job', { headers: { 'x-transfer-session': sara }, body: { action: 'auto', source: 'site', ref: String(ref), branchNo: 2, locationNo: 1, items: [{ itemNo: '111', qty: 1 }], customer: {}, ...extra } });
    const msg = r => r.body?.error || r.body?.message || JSON.stringify(r.body);
    // 11-20 (Karim «مترفضش تغيير طريقة دفع من الموزع»): the dispatcher's payment is never refused for differing from the website's.
    assert.doesNotMatch(msg(await auto(30830, { payment: 'paid', branchNo: 1 })), /طريقة الدفع مختلفة عن الموقع/);
    assert.doesNotMatch(msg(await auto(30831, { payment: 'paid' })), /طريقة الدفع مختلفة عن الموقع/);
    assert.match(msg(await auto(30831, { payment: 'cash', branchNo: 1 })), /متحوّل لفرع مدينة نصر/);
  } finally { await t.close(); }
});

test('website pickup (Karim 11-11): written on the branch\'s «استلام فرع» area, no address, floor or flat, no delivery charge', async () => {
  const t0 = cairoToUtc(2026, 11, 11, 20, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const order = { id: 30950, number: '30950', status: 'app-preparing', stage: 0, fulfillment: 'pickup', createdAt: s(0), branchId: 'nasr-city',
      paymentMethod: 'كاش عند الاستلام', total: 105, customer: { name: 'عميل', phone: '01011112222', address: '5 شارع مكرم عبيد، الدور 3، شقة 9' },
      financial: { due: 105, dueLabel: 'المطلوب تحصيله', onlinePaid: 0, rows: [{ amount: 105, label: 'الأصناف' }] }, items: [{ name: 'ورق عنب', quantity: 1, total: '105.00 EGP', details: [] }] };
    const ft = { name: 'فتة الدهان سادة', quantity: 1, total: '0.00 EGP', details: [{ label: '_eldahan_app_prize_claim_id', value: 'pw-test' }, { label: 'جائزة عجلة الحظ', value: 'وجبة مجانية' }] };
    const prize = { ...order, id: 31858, number: '31858', total: 0, financial: { due: 0, onlinePaid: 0, rows: [] }, items: [ft] };
    const mixed = { ...order, id: 31860, number: '31860', total: 98, financial: { due: 98, onlinePaid: 0, rows: [] }, items: [{ ...ft, total: '98.00 EGP', details: [] }, ft] };
    await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders: [order, prize, mixed] } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-11-11', online: [], locations: [{ no: 19, name: 'مكرم عبيد', branch: 2, service: 34.5 }] } });
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending;
    assert.equal(pend.length, 3);
    await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => ({ ...x, status: 'none' })) });
    t.advance(9000);
    const queue = (await as('GET', '/api/transfer/queue?day=2026-11-11')).body;
    assert.equal(queue.orders.find(o => o.ref === '30950').apexBranch, 2);
    assert.equal(queue.orders.find(o => o.ref === '30950').areaGuess.no, 268);
    assert.equal(queue.pickupAreas[2].no, 268);
    assert.ok(queue.locations.every(l => l.no !== 268));
    const r = await as('POST', '/api/transfer/job', { source: 'site', ref: '30950', action: 'auto', payment: 'cash', branchNo: 2, items: [{ itemNo: '0103002', qty: 1 }],
      code: '30950', customer: { name: 'عميل', phone: '01011112222', address: '5 شارع مكرم عبيد، الدور 3، شقة 9' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = JSON.parse(t.app.db.raw.prepare("SELECT payload FROM transfer_jobs WHERE ref = '30950'").get().payload);
    assert.equal(p.locationNo, 268, 'the branch\'s pickup area, whatever area was sent');
    assert.equal(p.pickup, true); assert.equal(p.areaService, 0);
    assert.deepEqual([p.customer.address, p.customer.floor, p.customer.flat], ['0', '0', '0'], '0 so the card prints no old address (11-15)');
    assert.match(p.label, /\/موقع\/كاش\/#30950$/);   // 11-12 label format: name/موقع/كاش/#number
    assert.equal(queue.orders.find(o => o.ref === '31858').items[0].wheelPrize, true);
    assert.doesNotMatch(JSON.stringify(queue.orders.find(o => o.ref === '31858')), /pw-test/);
    const { decide } = require('../src/autotransfer.js');
    const freeOrder = queue.orders.find(o => o.ref === '31858');
    assert.deepEqual(decide(freeOrder, { now: t0 + 10 * 60000 + 9000, locations: queue.locations }).why, []);
    const submitPrize = (ref, items) => as('POST', '/api/transfer/job', { source: 'site', ref, action: 'auto', payment: 'cash', branchNo: 2, items,
      customer: { name: 'عميل', phone: '01011112222' } });
    assert.equal((await submitPrize('31858', [{ itemNo: '0105006', qty: 2 }])).status, 409);
    const item = { itemNo: '0105006', qty: 1 };
    for (const [ref, items, target, free] of [['31858', [item], 0, [true]], ['31860', [{ ...item, free: true }, item], 98, [false, true]]]) {
      const response = await submitPrize(ref, items);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const stored = JSON.parse(t.app.db.raw.prepare('SELECT payload FROM transfer_jobs WHERE ref = ?').get(ref).payload);
      assert.deepEqual(stored.items.map(x => x.free === true), free);
      assert.equal(stored.targetTotal, target);
      assert.equal(stored.items.at(-1).note, 'جائزة عجلة الحظ');
    }
  } finally { await t.close(); }
});

test('price differences (Karim 11-11): Apex 5% above the website is expected on a website order; more is shown', async () => {
  const t0 = cairoToUtc(2026, 11, 11, 20, 0, 0), t = await start({ at: t0 });
  try {
    const admin = await t.admin(), db = t.app.db.raw;
    const job = (ref, before, gap) => db.prepare('INSERT INTO transfer_jobs (source, ref, day, state, at, payload, result) VALUES (?,?,?,?,?,?,?)')
      .run('site', ref, '2026-11-11', 'auto_done', t0, JSON.stringify({ code: ref, items: [] }), JSON.stringify({ ok: true, before, gap, service: 0, total: before - gap }));
    job('1', 420, 20);    // 300 on the website, Apex 5% above + tax-rounding
    job('2', 420, 60);    // well over the 5%
    const list = (await admin('GET', '/api/transfer/price-diffs?from=2026-11-11&to=2026-11-11')).body.list.map(x => x.ref);
    assert.deepEqual(list, ['2']);
  } finally { await t.close(); }
});

// Karim 11-11 «بيتعامل ازاي مع اللاغي علي الموقع»: an order that leaves the central board before it went out is cancelled
// (after 3 minutes): off the transfer page; one already on Apex is told to its branch and the online group to void.
test('website central panel: an order gone from the board before going out is cancelled; on Apex → void message', async () => {
  const t0 = cairoToUtc(2026, 11, 10, 21, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 30 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = orders => t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders } });
    const order = (id, extra = {}) => ({ id, number: String(id), status: 'app-preparing', statusLabel: 'جاري التنفيذ', stage: 1, fulfillment: 'delivery', createdAt: s(0), branchId: 'nasr-city', branchName: 'مدينة نصر',
      paymentMethod: 'كاش عند الاستلام', total: 300, customer: { name: 'نوره', phone: '01097159082', address: 'شارع 9، النزهة الجديدة' }, financial: { due: 300, onlinePaid: 0, total: 300, rows: [] },
      items: [{ name: 'طحينة', quantity: 1, total: '25.00 EGP', details: [] }], ...extra });
    await push([order(40001), order(40002), order(40003, { stage: 3, driver: { name: 'علي' } })]);
    t.app.db.raw.prepare("INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, at, result) VALUES ('site', '40002', '2026-11-10', 'auto_done', NULL, 'المرصد آلي', ?, ?)").run(t.app.now(), JSON.stringify({ orderNo: 777, shiftSerial: 412 }));
    const status = id => t.app.db.raw.prepare('SELECT status FROM site_orders WHERE id = ?').get(id).status;
    const keep = order(40099);
    await push([keep]);
    t.advance(60000); await push([keep]);
    assert.notEqual(status(40001), 'cancelled', 'not yet: it may come back');
    t.advance(3 * 60000); await push([keep]);
    assert.equal(status(40001), 'cancelled'); assert.equal(status(40002), 'cancelled');
    assert.equal(status(40003), 'completed', 'out with a driver and gone = delivered');
    t.advance(9000);
    const q = (await t.call('GET', '/api/transfer/queue?day=2026-11-10', { headers: { 'x-transfer-session': sara } })).body.orders.filter(o => o.source === 'site').map(o => o.ref);
    assert.ok(!q.includes('40001'), 'off the transfer page');
    const msgs = t.app.db.raw.prepare("SELECT key, target, text FROM telegram_log WHERE kind = 'siteCancelled' ORDER BY key").all();
    assert.deepEqual(msgs.map(m => [m.key, m.target]), [['site:cancel:40002', 'branches'], ['site:cancel:40002:online', 'online']]);
    assert.match(msgs[0].text, /Apex 412/); assert.doesNotMatch(msgs[0].text, /777/, 'the small serial only');
    await push([keep]); assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE kind = 'siteCancelled'").get().n, 2, 'once');
  } finally { await t.close(); }
});

// 11-11: the day's central board passed 256 KB at 19:42 and every push after was refused (413).
test('website central panel: a big board (over 256 KB) is accepted', async () => {
  const t0 = cairoToUtc(2026, 11, 11, 21, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 30 * 60000 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const orders = Array.from({ length: 120 }, (_, i) => ({ id: 50000 + i, number: String(50000 + i), status: 'app-preparing', stage: 1, fulfillment: 'delivery', createdAt: s(i % 30), branchId: 'nasr-city', branchName: 'مدينة نصر',
      paymentMethod: 'كاش عند الاستلام', total: 300, customer: { name: 'عميل ' + i, phone: '0109715' + String(9000 + i), address: 'شارع ' + i + '، النزهة الجديدة' }, financial: { due: 300, onlinePaid: 0, total: 300, rows: [] },
      items: Array.from({ length: 8 }, (_, k) => ({ name: 'طاجن لحمة بالبصل ' + k, quantity: 1, total: '25.00 EGP', details: [{ label: 'اختيارات السلطة المجانية', value: 'خيار مخلل (ضمن الوجبة) '.repeat(12) }] })) }));
    const body = { board: 'central', orders };
    assert.ok(JSON.stringify(body).length > 300 * 1024);
    const r = await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body });
    assert.equal(r.status, 200); assert.equal(r.body.saved, 120);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM site_orders').get().n, 120);
    const again = await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body });
    assert.equal(again.status, 200);
  } finally { await t.close(); }
});

test('branch board mirrors the driver from a fresh, confirmed Apex website delivery', { timeout: 5000 }, async () => {
  const now = cairoToUtc(2026, 11, 21, 21, 0, 0), day = '2026-11-21';
  const t = await start({ at: now });
  try {
    const db = t.app.db.raw, admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const order = (id, extra = {}) => ({ id, status: 'app-preparing', stage: 1, fulfillment: 'delivery',
      createdAt: (now - 600000) / 1000, branchId: 'tagamoa-cloud', branchName: 'التجمع الخامس', ...extra });
    const first = order(31837), manual = order(31845);
    const list = [first, order(31838), order(31839, { fulfillment: 'pickup' }), order(31840), order(31841),
      order(31842), order(31843, { stage: 3, status: 'app-delivering', driver: { name: 'زياد علي' } }),
      order(31844), manual, order(31846), order(31847), order(31848, { driver: {}, createdAt: (now + 50 * 60000) / 1000 })];
    const apex = (no, tag, extra = {}) => ({ no, tag, kind: 'الموقع', branch: 'التجمع', pilot: 'زياد علي',
      out: new Date(now - 60000).toISOString(), ...extra });
    const snapshot = { online: [apex(707140, ''), apex(707141, '31838', { out: null }), apex(707142, '31839'),
      apex(707143, '31840', { branch: 'مدينتي' }), apex(707144, '31841', { pilot: '#23' }), apex(707145, '31842'),
      apex(707146, '31843'), apex(707147, '31844'), apex(707148, '31844'),
      apex(707149, '31846'), apex(707150, '31845'), apex(707151, '31847', { kind: 'طلبات' }),
      apex(707152, '31848', { out: null, pilot: null, at: new Date(now - 10 * 60000).toISOString() })],
      lateOut: [apex(707152, '', { pilot: 'أحمد علي' })], cancels: [{ no: 707145 }] };
    db.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?, ?, ?)').run(day, JSON.stringify(snapshot), now);
    db.prepare('INSERT INTO site_links (site_id, day, apex_no, set_by, set_at) VALUES (?, ?, ?, ?, ?)').run(manual.id, day, '707149', 'admin', now);
    db.prepare('INSERT INTO transfer_jobs (source, ref, day, state, at, payload, result) VALUES (?,?,?,?,?,?,?)')
      .run('site', String(first.id), day, 'auto_done', now, JSON.stringify({ branchNo: 1, db: 'live' }), JSON.stringify({ orderNo: 707140, db: 'live' }));
    const push = (orders, board = 'branch', dispatchFromApex = true) =>
      t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board, dispatchFromApex, orders } });
    assert.deepEqual((await push(list)).body.dispatch, [{ orderId: 31837, driver: 'زياد علي' }, { orderId: 31848, driver: 'أحمد علي' }], 'duplicate matches and unverified deliveries are skipped');
    assert.deepEqual((await push([manual])).body.dispatch, [{ orderId: 31845, driver: 'زياد علي' }], 'explicit link wins over a typed tag');
    const out = db.prepare('SELECT out_at, delivered_at, status FROM site_orders WHERE id = 31843').get();
    assert.ok(out.out_at);
    assert.equal(out.delivered_at, null);
    assert.equal(out.status, 'app-delivering');
    assert.deepEqual(db.prepare('SELECT out_at, driver FROM site_orders WHERE id = 31848').get(), { out_at: null, driver: null });
    assert.deepEqual((await push([first], 'central')).body.dispatch, []);
    assert.deepEqual((await push([first], 'branch', false)).body.dispatch, []);
    const facade = t.app.db, prepare = facade.prepare;
    let releaseRead, pendingWrite;
    const slowRead = new Promise(resolve => { releaseRead = resolve; });
    facade.prepare = sql => {
      const query = prepare(sql);
      if (!sql.includes('p.data AS profile_data')) return query;
      return { ...query, all: async (...params) => { await slowRead; return query.all(...params); } };
    };
    facade.kind = 'd1';
    try {
      const response = await t.app.fetch(new Request('http://localhost/api/site/panel', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-talabat-token': token },
        body: JSON.stringify({ board: 'branch', dispatchFromApex: true, orders: [first] }),
      }), { waitUntil: work => { pendingWrite ??= work; } });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).dispatch, [{ orderId: 31837, driver: 'زياد علي' }]);
    } finally {
      releaseRead();
      await pendingWrite;
      facade.prepare = prepare;
      facade.kind = 'sqlite';
    }
    const confirmed = [
      order(31862, { branchId: 'nasr-city' }),
      order(31864, { branchId: 'madinaty-craft-zone' }),
      order(31865),
    ];
    snapshot.online.push(
      apex(707340, '31862', { pilot: 'رامى', branch: 'مدينة نصر' }),
      apex(707339, '31864', { pilot: 'عمرو وعلي مدنتي', branch: 'مدينتي' }),
      apex(707341, '31865', { pilot: 'رامي' }),
    );
    db.prepare('UPDATE orders_days SET data = ? WHERE day = ?').run(JSON.stringify(snapshot), day);
    assert.deepEqual((await push(confirmed)).body.dispatch, [
      { orderId: 31862, driver: 'رامي رمضان إبراهيم عبدالجليل' },
      { orderId: 31864, driver: 'عمرو علي محمود احمد' },
      { orderId: 31865, driver: 'رامي' },
    ], 'confirmed aliases are limited to their own branch');
    t.advance(6 * 60000);
    assert.deepEqual((await push([first])).body.dispatch, [], 'stale Apex snapshots cannot trigger a dispatch');
  } finally { await t.close(); }
});
