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
    assert.deepEqual(by(30829).discounts.map(d => d.amount), [268]);
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
    assert.match(msg(await auto(30830, { payment: 'paid', branchNo: 1 })), /الدفع الأونلاين لسه ما اكتملش/);
    assert.match(msg(await auto(30831, { payment: 'paid' })), /كاش عند الاستلام/);
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
    const order = { id: 30950, number: '30950', status: 'app-preparing', stage: 0, fulfillment: 'pickup', createdAt: s(0), branchId: 'nasr-city', branchName: 'مدينة نصر',
      paymentMethod: 'كاش عند الاستلام', total: 105, customer: { name: 'عميل', phone: '01011112222', address: '5 شارع مكرم عبيد، الدور 3، شقة 9' },
      financial: { due: 105, dueLabel: 'المطلوب تحصيله', onlinePaid: 0, rows: [{ amount: 105, label: 'الأصناف' }] }, items: [{ name: 'ورق عنب', quantity: 1, total: '105.00 EGP', details: [] }] };
    await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders: [order] } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-11-11', online: [], locations: [{ no: 19, name: 'مكرم عبيد', branch: 2, service: 34.5 }, { no: 268, name: 'استلام مدينة نصر.', branch: 2, service: 0 }] } });
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending;
    assert.equal(pend.length, 1);
    await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => ({ ...x, status: 'none' })) });
    t.advance(9000); await as('GET', '/api/transfer/queue?day=2026-11-11');
    const r = await as('POST', '/api/transfer/job', { source: 'site', ref: '30950', action: 'auto', payment: 'cash', branchNo: 2, locationNo: 19, items: [{ itemNo: '0103002', qty: 1 }],
      code: '30950', customer: { name: 'عميل', phone: '01011112222', address: '5 شارع مكرم عبيد، الدور 3، شقة 9' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = JSON.parse(t.app.db.raw.prepare("SELECT payload FROM transfer_jobs WHERE ref = '30950'").get().payload);
    assert.equal(p.locationNo, 268, 'the branch\'s pickup area, whatever area was sent');
    assert.equal(p.pickup, true); assert.equal(p.areaService, 0);
    assert.deepEqual([p.customer.address, p.customer.floor, p.customer.flat], ['', '', '']);
    assert.match(p.label, /\/موقع\/كاش\/#30950$/);   // 11-12 label format: name/موقع/كاش/#number
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
    t.app.db.raw.prepare("INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, at, result) VALUES ('site', '40002', '2026-11-10', 'auto_done', NULL, 'المرصد آلي', ?, ?)").run(t.app.now(), JSON.stringify({ orderNo: 777 }));
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
    assert.match(msgs[0].text, /Apex 777/);
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
