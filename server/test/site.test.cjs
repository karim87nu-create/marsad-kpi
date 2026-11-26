'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// A fake WooCommerce: orders and notes as the real site returns them (GMT times without Z).
const g = ms => new Date(ms).toISOString().slice(0, 19);
function fakeSite(t0) {
  const m = min => t0 + min * 60000;
  const orders = [
    { id: 101, billing: { first_name: 'أحمد', last_name: 'علي', phone: '01012345678', address_1: 'شارع النصر 20' }, line_items: [{ name: 'White Rice', quantity: 2, total: '100', total_tax: '13' }], status: 'completed', total: '255.00', date_created_gmt: g(m(0)), date_modified_gmt: g(m(60)), meta_data: [{ key: '_eldahan_app_fulfillment', value: 'delivery' }, { key: '_billing_phone', value: '010' }] },
    { id: 102, status: 'processing', date_created_gmt: g(m(10)), date_modified_gmt: g(m(12)), meta_data: [{ key: '_eldahan_app_fulfillment', value: 'delivery' }] },
    { id: 103, status: 'cancelled', date_created_gmt: g(m(5)), date_modified_gmt: g(m(6)), meta_data: [] },
  ];
  const notes = {
    101: [{ date_created_gmt: g(m(0.5)), note: 'Order status changed from Pending to تم الاستلام.' }, { date_created_gmt: g(m(3)), note: 'تم إرسال الطلب إلى فرع مدينة نصر من لوحة التشغيل' },
      { date_created_gmt: g(m(40)), note: 'خرج الطلب للتوصيل مع أحمد سعيد. وقت الخروج 10:40' }, { date_created_gmt: g(m(55)), note: '<b>أكد المندوب تسليم</b> الطلب' }],
    102: [{ date_created_gmt: g(m(10.2)), note: 'Order status changed from Pending to تم الاستلام.' }],
    103: [],
  };
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push(url);
    if (!/Basic /.test(opts.headers.authorization)) return new Response('{"message":"no"}', { status: 401 });
    const u = new URL(url), p = u.pathname.replace('/wp-json/wc/v3/', '');
    const n = p.match(/^orders\/(\d+)\/notes$/);
    if (n) return Response.json(notes[n[1]] || []);
    if (p === 'orders') return Response.json(u.searchParams.get('per_page') === '1' ? orders.slice(0, 1) : orders);
    return new Response('nope', { status: 404 });
  };
  return { fetch, calls, orders, notes, m };
}

test('WooCommerce discounts: coupon tax, wallet fee and the unitemized remainder reach the transfer queue once', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 13, 0, 0), site = fakeSite(t0);
  Object.assign(site.orders[1], { payment_method: 'cod', total: '240', discount_total: '60', discount_tax: '6',
    line_items: [{ name: 'فتة الدهان سادة', quantity: 1, total: '0.00', total_tax: '0.00', meta_data: [{ key: '_eldahan_app_prize_claim_id', value: 'pw-test' }] }],
    coupon_lines: [{ code: 'welcome', discount: '40', discount_tax: '4' }],
    fee_lines: [{ name: 'خصم نقاط المحفظة', total: '-30', total_tax: '0' }, { name: 'رسوم خدمة', total: '5', total_tax: '0' }] });
  const t = await start({ at: site.m(30), config: { siteFetch: site.fetch } });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const session = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const sync = () => admin('POST', '/api/site', { action: 'sync' });
    const queue = async () => (await t.call('GET', '/api/transfer/queue?day=2026-10-22', { headers: { 'x-transfer-session': session } })).body.orders.find(o => o.source === 'site' && o.ref === '102');
    assert.equal((await admin('POST', '/api/site', { action: 'key', key: 'ck_' + 'a'.repeat(40), secret: 'cs_' + 'b'.repeat(40) })).status, 200);
    assert.deepEqual((await queue()).discounts.map(d => [d.text, d.amount]), [['كوبون welcome', 44], ['خصم الموقع', 22], ['خصم نقاط المحفظة', 30]]);
    assert.equal((await queue()).items[0].wheelPrize, true);
    const live = { id: 102, createdAt: site.m(10) / 1000, lastActionAt: site.m(12) / 1000, total: 240,
      status: 'processing', fulfillment: 'delivery', paymentMethod: 'كاش', financial: { due: 240, rows: [{ label: 'خصم نقاط المحفظة', amount: -30 }, { label: 'خصم الموقع', amount: -66 }] } };
    const push = order => t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders: [order] } });
    assert.equal((await push(live)).status, 200);
    assert.equal((await push({ ...live, financial: undefined })).status, 200);
    t.advance(61000);
    assert.equal((await sync()).status, 200);
    assert.deepEqual((await queue()).discounts.map(d => [d.text, d.amount]), [['خصم نقاط المحفظة', 30], ['خصم الموقع', 66]]);
  } finally { await t.close(); }
});

test('site: key, sync of orders and notes, the day rows, alerts', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 13, 0, 0), site = fakeSite(t0);
  const t = await start({ at: t0 + 30 * 60000, config: { siteFetch: site.fetch } });
  try {
    const admin = await t.admin();
    assert.equal((await admin('POST', '/api/site', { action: 'key', key: 'bad', secret: 'x' })).status, 400);
    const r = await admin('POST', '/api/site', { action: 'key', key: 'ck_' + 'a'.repeat(40), secret: 'cs_' + 'b'.repeat(40) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.sync.orders, 3);
    const s = (await admin('GET', '/api/site')).body;
    assert.equal(s.linked, true); assert.equal(s.keyEnd, 'aaaa'); assert.equal(s.error, null);
    const raw = t.app.db.raw.prepare("SELECT value FROM settings WHERE key = 'site_wc'").get().value;
    assert.ok(!raw.includes('cs_'), 'secret stored encrypted');
    const d = (await admin('GET', '/api/site/day?day=2026-10-22')).body;
    const o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o[101].branch, 'مدينة نصر'); assert.equal(o[101].driver, 'أحمد سعيد');
    assert.equal(Date.parse(o[101].outAt) - Date.parse(o[101].transferAt), 37 * 60000);
    assert.ok(o[101].deliveredAt); assert.equal(o[103].excluded, true);
    assert.equal(JSON.stringify(d).includes('01012345678'), false, 'no customer data');
    // Apex: the monitor's online orders; the site order is tied to the Apex order and to who entered it.
    const emp = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: emp.id });
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online: [
      { no: 5001, customer: { name: 'أحمد علي', phone: '+201012345678', address: 'شارع النصر 20' }, items: [{ no: '0103007', name: 'ارز سادة', qty: 2, price: 50 }], kind: 'الموقع', branch: 'فرع مدينة نصر', at: new Date(site.m(4)).toISOString(), user: 'sara.m', amount: 250 },
      { no: 5002, kind: 'الموقع', branch: 'التجمع', at: new Date(site.m(5)).toISOString(), user: 'ahmed', amount: 99 },
      { no: 5003, kind: 'طلبات', branch: 'مدينة نصر', at: new Date(site.m(4)).toISOString(), user: 'x', amount: 255 }] } });
    const d2 = (await admin('GET', '/api/site/day?day=2026-10-22')).body;
    const o2 = Object.fromEntries(d2.orders.map(x => [x.id, x]));
    assert.deepEqual(o2[101].apex, { no: 5001, sn: null, at: new Date(site.m(4)).toISOString(), user: 'سارة', amount: 250, branch: 'فرع مدينة نصر', how: 'evidence' });
    assert.equal(o2[102].apex, null);
    assert.deepEqual(d2.apex.unmatched.map(x => x.no), [5002]);
    // Order 102: received at 13:10 and not sent to a branch → after 5 minutes one alert for the online group.
    const a = t.app.db.raw.prepare("SELECT kind, target FROM telegram_log WHERE kind LIKE 'site%'").all();
    assert.deepEqual(a, [{ kind: 'siteTransfer', target: 'online' }]);
    assert.match(t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE key = 'site:transfer:102'").get().text, /المطابقة مع Apex غير مؤكدة/);
    // Next run a minute later: only open orders' notes are read again, no duplicate alert.
    site.calls.length = 0; t.advance(61000);
    await admin('POST', '/api/site', { action: 'sync' });
    assert.ok(site.calls.some(u => u.includes('/orders/102/notes')));
    assert.ok(!site.calls.some(u => u.includes('/orders/101/notes')), 'delivered order not re-read');
    assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE kind LIKE 'site%'").get().n, 1);
    // It is sent to a branch: the warning gets a reply saying so.
    site.notes[102].push({ date_created_gmt: g(site.m(33)), note: 'تم إرسال الطلب إلى فرع التجمع من لوحة التشغيل' });
    t.advance(61000);
    await admin('POST', '/api/site', { action: 'sync' });
    // The reply is written in the background after the request (waitUntil): wait for it, up to a second.
    let rep; for (let i = 0; i < 50 && !rep; i++) { rep = t.app.db.raw.prepare("SELECT text, reply_to FROM telegram_log WHERE key = 'resolved:site:transfer:102'").get(); if (!rep) await new Promise(r => setTimeout(r, 20)); }
    assert.equal(rep.reply_to, 'site:transfer:102'); assert.match(rep.text, /اتحوّل لـ التجمع/);
  } finally { await t.close(); }
});


test('site: prep warnings keep comments but do not append Apex status', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 13, 0, 0), site = fakeSite(t0);
  site.orders[0].status = 'processing';
  site.notes[101] = site.notes[101].slice(0, 2);
  const t = await start({ at: t0 + 40 * 60000, config: { siteFetch: site.fetch } });
  try {
    const admin = await t.admin();
    t.app.apexDetails = async () => ({ extra: () => '', status: () => { throw new Error('Site must not append Apex status'); } });
    const r = await admin('POST', '/api/site', { action: 'key', key: 'ck_' + 'a'.repeat(40), secret: 'cs_' + 'b'.repeat(40) });
    assert.equal(r.status, 200);
    const warning = t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE key = 'site:prep:101:online'").get();
    assert.ok(warning);
    assert.match(warning.text, /لسه ماخرجش للتوصيل/);
    assert.doesNotMatch(warning.text, /حالة الفرع دلوقتي/);
  } finally { await t.close(); }
});

test('site (Karim 11-16): the customer\'s rating of an order and the review form go to «خدمة العملاء» by themselves', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 13, 0, 0), site = fakeSite(t0);
  site.orders[0].meta_data.push({ key: '_eldahan_app_rating', value: { rating: 2, comment: 'الأكل وصل بارد' } }, { key: '_eldahan_app_review_snoozed', value: '1' });
  site.orders[1].meta_data.push({ key: '_eldahan_rating', value: '5' });
  const base = site.fetch;
  site.fetch = async (url, opts) => /products\/reviews/.test(url)
    ? Response.json([{ id: 9, date_created_gmt: g(site.m(30)), product_name: 'فتة لحمة', rating: 1, review: '<p>اللحمة ناشفة</p>', reviewer: 'منى', reviewer_email: 'm@x.com' }]) : base(url, opts);
  const t = await start({ at: t0 + 40 * 60000, config: { siteFetch: site.fetch } });
  try {
    const admin = await t.admin();
    await admin('POST', '/api/site', { action: 'key', key: 'ck_' + 'a'.repeat(40), secret: 'cs_' + 'b'.repeat(40) });
    const cs = (await admin('GET', '/api/cs?from=2026-10-22&to=2026-10-22')).body;
    const byOrder = Object.fromEntries(cs.site.filter(x => x.orderNo).map(x => [x.orderNo, x]));
    assert.deepEqual([byOrder['101'].rating, byOrder['101'].comment, byOrder['101'].branch], [2, 'الأكل وصل بارد', 'مدينة نصر']);
    assert.equal(byOrder['102'].rating, 5);
    const rv = cs.site.find(x => x.auto === 'review');
    assert.deepEqual([rv.rating, rv.comment, rv.customer], [1, 'فتة لحمة: اللحمة ناشفة', 'منى']);
  } finally { await t.close(); }
});

test('site notes preserve dispatch recorded by the branch board while WooCommerce is missing the note', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 13, 0, 0), site = fakeSite(t0);
  const t = await start({ at: t0 + 40 * 60000, config: { siteFetch: site.fetch } });
  try {
    const admin = await t.admin();
    const keys = { key: 'ck_' + 'a'.repeat(40), secret: 'cs_' + 'b'.repeat(40) };
    await admin('POST', '/api/site', { action: 'key', ...keys });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'branch', orders: [
      { id: 102, stage: 3, status: 'app-delivering', createdAt: site.m(10) / 1000, branchAssignedAt: site.m(20) / 1000,
        branchName: 'التجمع الخامس', branchId: 'tagamoa-cloud', driver: { name: 'أحمد علي' }, fulfillment: 'delivery' },
    ] } });
    t.advance(61000);
    assert.equal((await admin('POST', '/api/site', { action: 'sync' })).status, 200);
    const get = t.app.db.raw.prepare('SELECT branch, driver, transfer_at, out_at FROM site_orders WHERE id = 102');
    assert.deepEqual(get.get(), { branch: 'التجمع الخامس', driver: 'أحمد علي', transfer_at: site.m(20), out_at: site.m(40) });
  } finally { await t.close(); }
});

test('WooCommerce departure notes confirm the stored dispatch source after the panel row is gone', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 13, 0, 0), site = fakeSite(t0);
  const t = await start({ at: site.m(41), config: { siteFetch: site.fetch } });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const r = await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: {
      board: 'branch', dispatchFromApex: true, branch: 'nasr-city',
      dispatchEvents: [{ id: 101, actor: 'branch', driver: 'أحمد سعيد - 01000000000', at: site.m(39) }],
    } });
    assert.equal(r.body.dispatchEventAck, true);
    await admin('POST', '/api/site', { action: 'key', key: 'ck_' + 'a'.repeat(40), secret: 'cs_' + 'b'.repeat(40) });
    const orders = (await admin('GET', '/api/site/day?day=2026-10-22')).body.orders;
    assert.equal(orders.find(o => o.id === 101).dispatchActor, 'branch');
  } finally { await t.close(); }
});
