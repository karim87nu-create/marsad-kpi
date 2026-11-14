'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 11-14: «كان فيه ٢٨ طلب مكنوش ظاهرين في التحويلات وظهرو متأخر» — one branch's live screen stopped while the others
// went on. It is named (with its branch) on the transfer page, the home page and to the online group, and «رجعت» after.
test('talabat: one stopped live screen is named while the others still send', async () => {
  const t0 = cairoToUtc(2026, 11, 14, 16, 50, 0);
  const t = await start({ at: t0 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = (id, codes) => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { codes, screen: { id, version: '3.1.43', kind: 'extra', live: codes.length, readCode: codes[0]?.code } } });
    const tg = [{ id: '4720600001', code: '3054', store: 'الدهان، التجمع الخامس - البنفسج 9,10,11,12' }], nc = [{ id: '4720600002', code: '1254', store: 'الدهان سيتي ستار مول، مكرم عبيد' }];
    assert.equal((await push('tagamoa1', tg)).status, 200); await push('nasr0001', nc);
    t.advance(5 * 60000);
    await push('nasr0001', nc);   // only Nasr City keeps sending
    const stalled = await t.app.talabatScreensStalled(t.app.now());
    assert.deepEqual(stalled.map(x => [x.id, x.branch, x.minutes]), [['tagamoa1', 'التجمع', 5]]);
    await t.app.talabat.alerts(t.app.now());
    const sent = () => t.app.db.raw.prepare("SELECT key, target, text, reply_to FROM telegram_log WHERE kind = 'talabatScreen' ORDER BY created_at").all();
    assert.equal(sent().length, 1); assert.equal(sent()[0].target, 'online');
    assert.match(sent()[0].text, /بتاعة التجمع/); assert.match(sent()[0].text, /مش هتظهر في صفحة التحويل/);
    await t.app.talabat.alerts(t.app.now());
    assert.equal(sent().length, 1, 'once');
    const q = (await admin('GET', '/api/transfer/queue')).body;
    assert.deepEqual(q.screensStalled.map(x => x.branch), ['التجمع'], 'named on the transfer page');
    t.advance(60000); await push('tagamoa1', tg);
    await t.app.talabat.alerts(t.app.now());
    assert.equal(sent().length, 2); assert.match(sent()[1].text, /رجعت/); assert.equal(sent()[1].reply_to, sent()[0].key);
    assert.deepEqual(await t.app.talabatScreensStalled(t.app.now()), []);
  } finally { await t.close(); }
});
