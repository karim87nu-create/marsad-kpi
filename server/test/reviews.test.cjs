'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('exception reviews: answer, undo, and a pattern answered «مش غلط» 3 times stops its Telegram alerts', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const sig = 'entry:تكرار:Hotline:التجمع';
    for (const no of [1, 2, 3]) assert.equal((await admin('POST', '/api/exception-reviews', { key: 'entry:dup:' + no, source: 'entry', ref: no, day: '2026-10-22', verdict: 'ok', reason: 'transfer', signature: sig })).status, 200);
    assert.equal((await admin('POST', '/api/exception-reviews', { key: 'x', verdict: 'maybe' })).status, 400);
    let r = (await admin('GET', '/api/exception-reviews?from=2026-10-22')).body;
    assert.equal(r.reviews.length, 3); assert.equal(r.patterns[sig].learned, true); assert.equal(r.patterns[sig].reason, 'transfer');
    // The monitor reports a new duplicate with the same pattern: listed, but no alert.
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const push = body => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-10-22', ...body } });
    await push({ issues: [{ type: 'تكرار', no: 9, kind: 'Hotline', branch: 'التجمع' }, { type: 'دفع', no: 10, kind: 'طلبات', branch: 'التجمع' }],
      alerts: [{ key: 'dup:9', kind: 'ordersEntry', text: 'dup 9' }, { key: 'pay:10', kind: 'ordersEntry', text: 'pay 10' }] });
    const texts = t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE kind = 'ordersEntry'").all().map(x => x.text);
    assert.deepEqual(texts, ['pay 10']);
    // One «غلط فعلًا» answer breaks the pattern.
    await admin('POST', '/api/exception-reviews', { key: 'entry:dup:4', source: 'entry', ref: 4, day: '2026-10-22', verdict: 'error', signature: sig });
    r = (await admin('GET', '/api/exception-reviews?from=2026-10-22')).body;
    assert.equal(r.patterns[sig].learned, false);
    // Undo.
    await admin('POST', '/api/exception-reviews', { key: 'entry:dup:4', verdict: null });
    assert.equal((await admin('GET', '/api/exception-reviews?from=2026-10-22')).body.reviews.length, 3);
  } finally { await t.close(); }
});
