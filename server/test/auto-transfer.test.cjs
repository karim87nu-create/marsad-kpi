'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');
const { decide } = require('../src/autotransfer.js');
const { APEX_PRICES } = require('../src/menu-seed.js');
const { normArabic } = require('../src/apex-customer-notes.js');
const { panelArea } = require('../src/site.js');

const T = v => Math.round(v * 1.14 * 100) / 100;
const KOFTA = '0108004', P = T(APEX_PRICES[KOFTA]);
const NOW = Date.parse('2026-10-22T18:00:00Z');
const base = (over = {}) => ({ source: 'talabat', ref: '1', code: '11', at: new Date(NOW - 5 * 60000).toISOString(), status: 'ACCEPTED', apexBranch: 1, payment: 'cash', subtotal: P,
  customer: { name: 'كريم', phone: '01000000001', address: 'شارع 90', talabatArea: 'البنفسج', nameEn: 'Karim' }, areaGuess: { no: 218, seen: 3 }, discounts: [], bill: [], detailRead: true,
  items: [{ qty: 1, name: 'Kofta', price: P, modifiersComplete: true, apex: [{ no: KOFTA }], addons: [] }], apexCustomerNote: { status: 'none', checkedAt: new Date(NOW - 60000).toISOString() }, job: null, ...over });
const X = { now: NOW, locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 20 }, { no: 300, name: 'مدينة نصر', branch: 2, service: 20 }] };

// Karim 11-11 «عايز اعمل تحويل طلبات تلقائي» — only an order where everything is certain goes by itself.
test('auto transfer: decides only on certain orders and says why not', () => {
  const ok = decide(base(), X);
  assert.equal(ok.ok, true, ok.why.join());
  assert.deepEqual(ok.body.items, [{ itemNo: KOFTA, qty: 1, note: '' }]);
  assert.equal(ok.body.locationNo, 218); assert.equal(ok.body.branchNo, 1); assert.equal(ok.body.payment, 'cash');
  assert.equal(ok.body.customer.nameEn, undefined, 'the machine Arabic is not learned as a staff translation');
  const why = o => decide(base(o), X).why.join(' · ');
  assert.equal(decide(base({ apex: { no: 5 } }), X), null, 'already on Apex');
  assert.equal(decide(base({ job: { state: 'claimed' } }), X), null, 'with somebody');
  assert.match(why({ at: new Date(NOW - 10000).toISOString() }), /لسه واصل/);
  assert.equal(decide(base({ at: new Date(NOW - 10000).toISOString() }), X).quiet, true, 'a new order is no alert');
  // 11-11: 9 website orders staff had entered by hand were written again hours later.
  assert.match(why({ at: new Date(NOW - 25 * 60000).toISOString() }), /أوردر قديم/);
  assert.equal(decide(base({ at: new Date(NOW - 25 * 60000).toISOString() }), X).quiet, true);
  assert.match(why({ source: 'site', sentToBranch: true }), /اتحوّل للفرع على الموقع/);
  assert.match(why({ items: [{ qty: 1, name: 'Kofta', price: P, modifiersComplete: true, apex: [{ no: KOFTA }, { no: '0108001' }], addons: [] }] }), /أكتر من اختيار/);
  assert.match(why({ items: [{ qty: 1, name: 'Kofta', price: P, modifiersComplete: false, apex: [{ no: KOFTA }], addons: [] }] }), /الإضافات مش ظاهرة/);
  assert.match(why({ payment: 'mixed' }), /كاش ولا مدفوع/);
  assert.match(why({ apexBranch: null }), /الفرع/);
  assert.match(why({ areaGuess: { no: 218, seen: 1 } }), /لسه ما اتعلمتش/);
  assert.match(why({ areaGuess: { no: 300, seen: 4 } }), /فرع تاني/);
  assert.match(why({ discounts: [{ text: 'خصم', amount: 20, who: null }] }), /خصم مش واضح/);
  assert.equal(decide(base({ payment: 'paid', discounts: [{ text: 'خصم', amount: 20, who: null }] }), X).ok, true, 'paid: all of it comes off on Apex');
  // Karim 11-11: cash + one clear card discount goes by itself (taken on Apex); the customer's choices wait for a person.
  const cardOf = (directives, extra = {}) => ({ apexCustomerNote: { status: 'found', checkedAt: new Date(NOW - 60000).toISOString(), directives, text: 'خصم', custNo: '9', requiresReview: true, ...extra } });
  const cashDisc = decide(base(cardOf([{ kind: 'percent', value: 10 }])), X);
  assert.equal(cashDisc.ok, true, cashDisc.why.join()); assert.equal(cashDisc.body.apexNote.approved, true);
  assert.match(why({ payment: 'paid', ...cardOf([{ kind: 'percent', value: 10 }]) }), /يختار هدية أو يتأجل/);
  assert.match(why(cardOf([{ kind: 'item', name: 'رز' }])), /أصناف هدية/);
  assert.match(why(cardOf([{ kind: 'percent', value: 10 }, { kind: 'amount', value: 20 }])), /مش واضحة/);
  assert.match(why(cardOf([], { unrecognized: true })), /مش واضحة/);
  assert.match(why({ apexCustomerNote: { status: 'none', checkedAt: new Date(NOW - 15 * 60000).toISOString() } }), /قراءة بطاقة العميل/);
  assert.equal(decide(base({ apexCustomerNote: { status: 'found', checkedAt: new Date(NOW - 60000).toISOString(), directives: [], text: 'عميل قديم', custNo: '7' } }), X).ok, true, 'a card with nothing to give');
  // 11-12 (ChatGPT, Karim): price differences no longer stop the transfer; the delivery one is noted as a warning.
  assert.equal(decide(base({ subtotal: P * 1.5 }), X).ok, true);
  const del = decide(base({ bill: [{ k: 'رسوم التوصيل', text: 'رسوم التوصيل | 90' }] }), X);
  assert.equal(del.ok, true); assert.match(del.warnings.join(), /فرق سعر التوصيل/);
  // A zero-fee Apex area is never taken by itself (it is usually the wrong area).
  assert.match(decide(base(), { ...X, locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 0 }] }).why.join(), /رسوم المنطقة على Apex صفر/);
  // Website: Apex is up to 5% above the website; a pickup goes to the branch's pickup area.
  const site = { source: 'site', fulfillment: 'pickup', areaGuess: { no: 353, name: 'استلام فرع التجمع', how: 'pickup' }, subtotal: null, items: [{ qty: 1, name: 'كفتة', price: Math.round(P / 1.04), apex: [{ no: KOFTA }], addons: [] }] };
  const s = decide(base(site), X);
  assert.equal(s.ok, true, s.why.join()); assert.equal(s.body.locationNo, 353);
  assert.equal(decide(base({ ...site, items: [{ qty: 1, name: 'كفتة', price: Math.round(P / 1.2), apex: [{ no: KOFTA }], addons: [] }] }), X).ok, true);
  // A website delivery: the area of this customer's last automatic order to the same address.
  const sd = { source: 'site', fulfillment: 'delivery', areaGuess: undefined, subtotal: null, items: site.items };
  assert.match(decide(base(sd), X).why.join(), /لسه ما اتعلمتش/);
  assert.match(decide(base({ ...sd, customer: { name: 'x', phone: '0100', address: 'y' } }), X).why.join(), /مش ظاهرة في الأوردر/);
  // A learned area staff split between two Apex areas is not certain; an Apex area of exactly that name is.
  assert.match(decide(base({ areaGuess: { no: 218, seen: 7, share: 0.6 } }), X).why.join(), /أكتر من منطقة/);
  assert.equal(decide(base({ areaGuess: { no: 218, seen: 0, how: 'name' } }), X).ok, true);
  assert.equal(decide(base(sd), { ...X, customerArea: () => 218 }).ok, true);
});

test('auto transfer: trial only records, on sends as «المرصد آلي», a waiting order is told to the call center once', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    // The automatic transfer reads only the last completed build (an employee's page builds it).
    const tick = async (plus = 0) => { await as('GET', '/api/transfer/queue?day=2026-10-22'); return t.app.autoTransfer.tick(t.app.now() + plus, { force: true }); };
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const store = 'الدهان، التجمع الخامس - البنفسج';
    const ids = ['3977900051', '3977900052', '3977900053', '3977900054'], areas = ['البنفسج 5', 'البنفسج 5', 'الرحاب 2', 'البنفسج 5'];
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: ids.map((id, i) => ({ id, code: '5' + i, store, status: 'ACCEPTED', placedAt: at(i), total: P,
      detail: { subtotal: P, customer: { name: 'عميل', phone: '0100000005' + i, area: areas[i], address: 'شارع 90، ' + areas[i] },
        items: [{ qty: 1, name: 'Kofta', price: P, modifierRead: true, modifierComplete: true, options: [] }], bill: [{ k: 'مجموع', text: 'مجموع | ' + P }, { k: 'payment', text: 'Cash' }] } })) } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 20 }] } });
    await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' });
    // Staff chose 218 for «البنفسج 5» twice before.
    for (const r of ['old1', 'old2']) t.app.db.raw.prepare("INSERT INTO learned (kind, a, b, ref, value, at) VALUES ('transfer:area', ?, '218', ?, NULL, ?)").run(normArabic('البنفسج 5').slice(0, 120), r, t0);
    t.advance(9000);
    let q = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body;
    for (const id of ids) {
      const o = q.orders.find(x => x.ref === id);
      assert.equal((await as('POST', '/api/transfer/selection', { source: 'talabat', ref: id, line: 0, choiceKey: o.items[0].choiceKey, itemNo: KOFTA })).status, 200);
    }
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending;
    await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => x.ref === ids[1] ? { ...x, status: 'found', custNo: '77', note: 'خصم 10% ; خصم 20 جنيه' } : x.ref === ids[3] ? { ...x, status: 'found', custNo: '78', note: 'خصم 10%' } : { ...x, status: 'none' }) });
    t.advance(61000);

    // Trial: nothing is sent; the page and the admin show what would have happened.
    assert.equal((await admin('POST', '/api/auto-transfer', { mode: 'on' })).status, 400, 'turning it on needs the confirmation');
    assert.equal((await admin('POST', '/api/auto-transfer', { mode: 'trial' })).status, 200);
    let r = await tick();
    assert.equal(r.mode, 'trial');
    const log = () => Object.fromEntries(t.app.db.raw.prepare('SELECT ref, decision, reasons FROM auto_transfer_log').all().map(x => [x.ref, x]));
    assert.equal(log()[ids[0]].decision, 'would', JSON.stringify(log()));
    assert.match(log()[ids[1]].reasons, /مش واضحة/);
    assert.equal(log()[ids[3]].decision, 'would', 'cash + one clear card discount');
    assert.match(log()[ids[2]].reasons, /لسه ما اتعلمتش/);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM transfer_jobs WHERE state LIKE ?').get('auto_%').n, 0);
    t.advance(9000);
    q = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body;
    assert.equal(q.orders.find(x => x.ref === ids[0]).auto.decision, 'would');
    const a = (await admin('GET', '/api/auto-transfer?day=2026-10-22')).body;
    assert.deepEqual(a.totals, { sent: 0, would: 2, wait: 2 });

    // A claimed (by an employee) order is never taken.
    assert.equal((await as('POST', '/api/transfer/job', { source: 'talabat', ref: ids[2], action: 'claim' })).status, 200);
    // On: the certain order goes to the writer as «المرصد آلي»; the others stay for the employees.
    assert.equal((await admin('POST', '/api/auto-transfer', { mode: 'on', confirm: 'ON' })).status, 200);
    await tick();
    const job = t.app.db.raw.prepare('SELECT * FROM transfer_jobs WHERE ref = ?').get(ids[0]);
    assert.equal(job.state, 'auto_pending'); assert.equal(job.employee_name, 'المرصد آلي');
    const p = JSON.parse(job.payload);
    assert.deepEqual(p.items.map(x => [x.itemNo, x.qty]), [[KOFTA, 1]]);
    assert.equal(p.locationNo, 218); assert.equal(p.branchNo, 1); assert.equal(p.payment, 'cash'); assert.equal(p.by, 'المرصد آلي');
    assert.equal(log()[ids[0]].decision, 'sent');
    const p3 = JSON.parse(t.app.db.raw.prepare('SELECT payload FROM transfer_jobs WHERE ref = ?').get(ids[3]).payload);
    assert.equal(p3.apexCustomerBenefit.percent, 10, 'the card discount is taken on Apex by itself');
    // Written by the Apex writer: on Apex with its number at once, before matching finds it (11-11).
    t.app.db.raw.prepare("UPDATE transfer_jobs SET state = 'auto_done', result = ? WHERE ref = ?").run(JSON.stringify({ orderNo: 701631, shiftSerial: 566 }), ids[0]);
    t.advance(9000);
    const q9 = (await as('GET', '/api/transfer/queue?day=2026-10-22')).body.orders.find(x => x.ref === ids[0]);
    assert.equal(q9.apex.no, 701631); assert.equal(q9.done, true);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM transfer_jobs WHERE ref = ?').get(ids[1]).n, 0);

    // Still waiting after 2 minutes: once to the call center group, with the reason.
    t.advance(3 * 60000);
    await tick();
    await tick(20000);
    const alerts = t.app.db.raw.prepare("SELECT key, text, target FROM telegram_log WHERE kind = 'autoWaiting'").all();
    assert.equal(alerts.length, 1, JSON.stringify(alerts));
    assert.equal(alerts[0].key, 'autoWait:talabat:' + ids[1]); assert.equal(alerts[0].target, 'online');
    assert.match(alerts[0].text, /مش واضحة/);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM transfer_jobs WHERE ref = ? AND state = ?').get(ids[2], 'claimed').n, 1, 'the claim stays');
  } finally { await t.close(); }
});

// Karim 11-11 «المناطق معروفه»: the website's delivery area is read and taken like Talabat's.
test('website area: from the panel\'s area field or the address\'s last part', () => {
  assert.equal(panelArea({ customer: { address: '26 شارع أبو السعود، النزهة الجديدة' } }), 'النزهة الجديدة');
  assert.equal(panelArea({ customer: { address: 'x', area: 'التجمع الخامس - البنفسج' } }), 'التجمع الخامس - البنفسج');
  assert.equal(panelArea({ customer: { address: 'x' }, deliveryZone: { name: 'مدينتي' } }), 'مدينتي');
  assert.equal(panelArea({ customer: { address: '5 شارع مكرم عبيد، الدور 3، شقة 9' } }), '');
  assert.equal(panelArea({ customer: { address: 'شارع 9' } }), '');
});

// Karim 11-11: free delivery from Talabat is not a price difference.
test('auto transfer: Talabat free delivery (Pro) is not a delivery difference', () => {
  const svc = [{ k: 'رسوم الخدمة', text: 'رسوم الخدمة | 8' }];
  assert.equal(decide(base({ bill: [...svc, { k: 'رسوم التوصيل', text: 'رسوم التوصيل | 0' }] }), X).ok, true, 'delivery 0');
  assert.equal(decide(base({ bill: svc }), X).ok, true, 'no delivery line');
  assert.equal(decide(base({ bill: [...svc, { k: 'رسوم التوصيل', text: 'رسوم التوصيل | 90' }, { k: 'ملاحظة', text: 'ملاحظة | Talabat Pro: توصيل مجاني' }] }), X).ok, true, 'Pro');
  assert.match(decide(base({ bill: [...svc, { k: 'رسوم التوصيل', text: 'رسوم التوصيل | 90' }] }), X).warnings.join(), /فرق سعر التوصيل/);
  assert.equal(decide(base({ bill: [...svc, { k: 'رسوم التوصيل', text: 'رسوم التوصيل | 0' }] }), X).warnings.length, 0);
});

// Karim 11-11: a hashtag missing from a branch's sequence → that branch's group and the online group.
test('talabat: a hashtag missing from the branch sequence is told to the branch and online, once', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const store = 'الدهان، التجمع الخامس - البنفسج', other = 'الدهان، مدينة نصر - مكرم عبيد';
    const push = list => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: list, codes: list.filter(x => x.code).map(x => ({ id: x.id, code: x.code, store: x.store })) } });
    const o = (id, code, s = store, m = 0) => ({ id, code: code == null ? null : String(code), store: s, status: 'ACCEPTED', placedAt: at(m), total: 100 });
    await push([o('4800000001', 750), o('4800000002', 751), o('4800000004', 753), o('4800000005', 754), o('4800000006', 755),
      o('4800000011', 120, other), o('4800000012', 340, other), o('4800000013', 900, other), o('4800000014', 1500, other)]);
    const gaps = () => t.app.db.raw.prepare("SELECT key, target, branch, text FROM telegram_log WHERE kind = 'talabatGap' ORDER BY key").all();
    await t.app.talabat.alerts(t.app.now());
    assert.equal(gaps().length, 0, 'the next hashtag came less than 10 minutes ago');
    t.advance(11 * 60000);
    await t.app.talabat.alerts(t.app.now());
    const g = gaps();
    assert.deepEqual(g.map(x => [x.key.endsWith(':online') ? 'online' : 'branch', x.target]), [['branch', 'branches'], ['online', 'online']]);
    assert.match(g[0].text, /#752/); assert.match(g[0].text, /#751 وبعدها #753/);
    await t.app.talabat.alerts(t.app.now() + 60000);
    assert.equal(gaps().length, 2, 'once; a branch whose hashtags do not run in order is never alerted');
    // An order seen with no hashtag around the gap may be the missing one: not alerted.
    const third = 'الدهان، مدينتي - كرافت زون';
    await push([o('4800000021', 800, third, 1), o('4800000022', 801, third, 2), o('4800000023', null, third, 3), o('4800000024', 803, third, 4), o('4800000025', 804, third, 5), o('4800000026', 805, third, 6)]);
    t.advance(11 * 60000); await t.app.talabat.alerts(t.app.now());
    assert.equal(gaps().length, 2);
  } finally { await t.close(); }
});
