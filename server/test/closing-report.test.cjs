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
      { no: 501, sn: 11, reasonNo: 6, amount: 300, entry: at(20, 0), out: at(21, 0), at: at(21, 10) },  // left the branch after an hour
      { no: 505, sn: 15, reasonNo: 6, amount: 80, entry: at(20, 0), out: null, at: at(21, 30) },      // cancelled before a pilot took it: never a delay
      { no: 502, sn: 12, reasonNo: 6, amount: 200, entry: at(20, 0), out: null, at: at(20, 10) },     // the customer, early
      { no: 503, sn: 13, reasonNo: 183, amount: 150, entry: at(19, 0), out: null, at: at(19, 20) },   // Apex says quality
      { no: 504, sn: 14, reasonNo: 6, amount: 100, entry: at(18, 0), out: null, at: at(18, 5) },      // a supervisor said: the employee
    ];
    const r = await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-11-07',
      alerts: [{ key: 'dayend2:2', kind: 'ordersLate', text, branch: 'التجمع', cancels, orders: 100 }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const sent = t.app.db.raw.prepare("SELECT text, target FROM telegram_log WHERE key = 'orders:2026-11-07:dayend2:2'").get();
    assert.equal(sent.target, 'branches');
    assert.match(sent.text, /❌ على الفرع: 2 — 2%/);
    assert.match(sent.text, /• 11 — خرج من الفرع بعد 60 دقيقة \| 300 ج/);
    assert.match(sent.text, /• 13 \| 150 ج/);
    assert.match(sent.text, /ℹ️ من العميل: 2 — 2% \| 280 ج/);
    assert.doesNotMatch(sent.text, /• 12|• 15|ماخرجش/, 'customer cancellations: count only; none before a pilot is a delay');
    assert.doesNotMatch(sent.text, /الكول سنتر|مش محدد|سبب تاني|على الطيار|المنصة/, 'only what is on the branch');
    assert.match(sent.text, /^📊 التقرير الختامي — التجمع/); assert.match(sent.text, /🔚 آخر خروج: 77/);
    // What is on the call center goes to the call center's group, on its own.
    const cc = t.app.db.raw.prepare("SELECT text, target FROM telegram_log WHERE key = 'orders:2026-11-07:dayend2:2:center'").get();
    assert.equal(cc.target, 'online');
    assert.match(cc.text, /^📋 إلغاءات تخص الكول سنتر — التجمع \| 2026-11-07/);
    assert.match(cc.text, /☎️ على الكول سنتر.*: 1/); assert.match(cc.text, /• 14 — اتأكد من كريم/);
    // The monitor repeats it until acknowledged: nothing more is sent.
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-11-07',
      alerts: [{ key: 'dayend2:2', kind: 'ordersLate', text, branch: 'التجمع', cancels, orders: 100 }] } });
    assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE key LIKE 'orders:2026-11-07:dayend2:2%' OR reply_to LIKE 'orders:2026-11-07:dayend2:2%'").get().n, 2);
  } finally { await t.close(); }
});
