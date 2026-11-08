'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('closing report: cancellations on the restaurant come from what the server knows, not only Apex\'s code', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 8, 2, 20, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    t.app.db.raw.prepare("INSERT INTO cancel_owners (key, day, source, ref, owner, name, reason_key, by_name, at) VALUES ('apex:504', '2026-11-07', 'apex', '504', 'employee', 'سارة', NULL, 'كريم', ?)").run(t.clock.now);
    const at = (h, m) => new Date(cairoToUtc(2026, 11, 7, h, m, 0)).toISOString();
    const text = '📊 التقرير الختامي — التجمع | 2026-11-07\n📦 الأوردرات: 100 (منها 4 ملغي)\n🛵 خرج مع الطيار: 90\n\nℹ️ إلغاء من العميل أو خارج المطعم: 4\n• بناء على طلب العميل: 4\n\n🔚 آخر خروج: 77 الساعة 01:40 ص';
    const cancels = [
      { no: 501, sn: 11, reasonNo: 6, amount: 300, entry: at(20, 0), out: null, at: at(21, 0) },      // waited an hour in the branch
      { no: 502, sn: 12, reasonNo: 6, amount: 200, entry: at(20, 0), out: null, at: at(20, 10) },     // the customer, early
      { no: 503, sn: 13, reasonNo: 183, amount: 150, entry: at(19, 0), out: null, at: at(19, 20) },   // Apex says quality
      { no: 504, sn: 14, reasonNo: 6, amount: 100, entry: at(18, 0), out: null, at: at(18, 5) },      // a supervisor said: the employee
    ];
    const r = await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-11-07',
      alerts: [{ key: 'dayend2:2', kind: 'ordersLate', text, branch: 'التجمع', cancels, orders: 100 }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const sent = t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE key LIKE 'orders:2026-11-07:dayend2:%'").get().text;
    assert.match(sent, /❌ على الفرع: 2 — 2%/);
    assert.match(sent, /• 11 — اتلغى بعد 60 دقيقة ولسه ماخرجش من الفرع \| 300 ج/);
    assert.match(sent, /• 13 \| 150 ج/);
    assert.match(sent, /☎️ على الكول سنتر.*: 1/);
    assert.match(sent, /• 14 — اتأكد من كريم/);
    assert.match(sent, /ℹ️ من العميل: 1 — 1% \| 200 ج/);
    assert.doesNotMatch(sent, /• 12/, 'customer cancellations: count only');
    assert.doesNotMatch(sent, /مش محدد|سبب تاني|على الطيار|المنصة/, 'empty sections are not written');
    assert.match(sent, /^📊 التقرير الختامي — التجمع/); assert.match(sent, /🔚 آخر خروج: 77/);
  } finally { await t.close(); }
});
