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
    { id: 101, status: 'completed', total: '255.00', date_created_gmt: g(m(0)), date_modified_gmt: g(m(60)), meta_data: [{ key: '_eldahan_app_fulfillment', value: 'delivery' }, { key: '_billing_phone', value: '010' }] },
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
    assert.equal(JSON.stringify(d).includes('010'), false, 'no customer data');
    // Apex: the monitor's online orders; the site order is tied to the Apex order and to who entered it.
    const emp = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: emp.id });
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online: [
      { no: 5001, kind: 'الموقع', branch: 'فرع مدينة نصر', at: new Date(site.m(4)).toISOString(), user: 'sara.m', amount: 250 },
      { no: 5002, kind: 'الموقع', branch: 'التجمع', at: new Date(site.m(5)).toISOString(), user: 'ahmed', amount: 99 },
      { no: 5003, kind: 'طلبات', branch: 'مدينة نصر', at: new Date(site.m(4)).toISOString(), user: 'x', amount: 255 }] } });
    const d2 = (await admin('GET', '/api/site/day?day=2026-10-22')).body;
    const o2 = Object.fromEntries(d2.orders.map(x => [x.id, x]));
    assert.deepEqual(o2[101].apex, { no: 5001, sn: null, at: new Date(site.m(4)).toISOString(), user: 'سارة', amount: 250, branch: 'فرع مدينة نصر' });
    assert.equal(o2[102].apex, null);
    assert.deepEqual(d2.apex.unmatched.map(x => x.no), [5002]);
    // Order 102: received at 13:10 and not sent to a branch → after 5 minutes one alert for the online group.
    const a = t.app.db.raw.prepare("SELECT kind, target FROM telegram_log WHERE kind LIKE 'site%'").all();
    assert.deepEqual(a, [{ kind: 'siteTransfer', target: 'online' }]);
    assert.match(t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE key = 'site:transfer:102'").get().text, /لسه مش لاقيينه على Apex/);
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
    const rep = t.app.db.raw.prepare("SELECT text, reply_to FROM telegram_log WHERE key = 'resolved:site:transfer:102'").get();
    assert.equal(rep.reply_to, 'site:transfer:102'); assert.match(rep.text, /اتحوّل لـ التجمع/);
  } finally { await t.close(); }
});
