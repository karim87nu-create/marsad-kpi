'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 11-17 (#1573): the writer put back the special mark someone erased from the card; the online group is told once.
test('apex writer: a restored special mark is told to the online group once', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 19, 25, 0) });
  try {
    const admin = await t.admin();
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = body => t.call('POST', '/api/apex-writer/mark-restored', { body, headers: { 'x-apex-writer': wt } });
    assert.equal((await t.call('POST', '/api/apex-writer/mark-restored', { body: { fixed: [] } })).status, 401);
    const f = { orderNo: '704169', mark: 'خصم طلبات 88.20', was: '', who: 'Abdo Belal', name: 'حسن أحمد/طلبات/كاش/#1573' };
    assert.equal((await w({ fixed: [f] })).body.told, 1);
    await w({ fixed: [f] });
    const rows = t.app.db.raw.prepare("SELECT target, text FROM telegram_log WHERE kind = 'markRestored'").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].target, 'online');
    assert.match(rows[0].text, /Abdo Belal فتح بطاقة العميل لأوردر المرصد حسن أحمد\/طلبات\/كاش\/#1573 وحفظها، فاتمسحت العلامة المميزة «خصم طلبات 88.20»/);
  } finally { await t.close(); }
});
