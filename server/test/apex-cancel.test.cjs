'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 11-11 «اي كومنت يتبعت فيه لاغي لازم الاوردر يتمسح بعد ٥د بالظبط من السيستم تلقائي».
test('apex cancel: 5 minutes after a cancel comment — off: told; on: the writer cancels, then told; with a pilot: told only', async () => {
  const t0 = cairoToUtc(2026, 11, 11, 20, 0, 0);
  const t = await start({ at: t0 });
  try {
    const admin = await t.admin();
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const push = notes => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-11-11', generatedAt: new Date(t.app.now()).toISOString(), online: [], cancelNotes: notes } });
    const seen = new Date(t0).toISOString();
    const n = (no, extra = {}) => ({ no, sn: no - 700000, branch: 'التجمع', seenAt: seen, out: false, text: 'لا!!!!غيييي', ...extra });
    const log = () => t.app.db.raw.prepare("SELECT key, target, text FROM telegram_log WHERE kind = 'apexAutoCancel' ORDER BY key").all();
    const state = no => t.app.db.raw.prepare('SELECT state FROM apex_cancels WHERE order_no = ?').get(no)?.state;

    assert.equal((await push([n(701001)])).status, 200);
    assert.equal(state(701001), undefined, 'not before 5 minutes');
    t.advance(5 * 60000);
    // Off (the default): the branch and online are told to cancel it.
    await push([n(701001), n(701002, { out: true })]);
    assert.equal(state(701001), 'manual'); assert.equal(state(701002), 'withPilot');
    assert.deepEqual(log().map(x => x.target).sort(), ['branches', 'branches', 'online', 'online']);
    assert.match(log().find(x => x.key === 'apexcancel:701002').text, /خرج مع الطيار/);
    assert.deepEqual((await w('/api/apex-writer/cancel-next')).body.orders, [], 'off: the writer cancels nothing');

    // On: the writer gets it, cancels it, both groups hear.
    assert.equal((await admin('POST', '/api/apex-cancel', { mode: 'on' })).status, 400, 'needs the confirmation');
    assert.equal((await admin('POST', '/api/apex-cancel', { mode: 'on', confirm: 'ON' })).status, 200);
    await push([n(701003), n(701004)]);
    const next = (await w('/api/apex-writer/cancel-next')).body.orders;
    assert.deepEqual(next.map(x => [x.orderNo, x.reasonNo, x.reason]), [[701003, 6, 'بناء على طلب العميل'], [701004, 6, 'بناء على طلب العميل']]);
    assert.deepEqual((await w('/api/apex-writer/cancel-next')).body.orders, [], 'given once');
    await w('/api/apex-writer/cancel', { done: [{ orderNo: 701003, st: 0, ok: true }, { orderNo: 701004, st: 2, ok: false }] });
    assert.equal(state(701003), 'done'); assert.equal(state(701004), 'failed');
    assert.match(log().find(x => x.key === 'apexcancel:701003').text, /اتلغى تلقائي/);
    assert.match(log().find(x => x.key === 'apexcancel:701004').text, /خرج مع الطيار قبل الإلغاء/);
    await push([n(701003)]);
    assert.equal(log().length, 8, 'one decision per order');
    const a = (await admin('GET', '/api/apex-cancel?day=2026-11-11')).body;
    assert.equal(a.mode, 'on'); assert.equal(a.list.length, 4);
  } finally { await t.close(); }
});
