'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('system watch: a part that stops gives one Telegram message, and one «رجع» reply when it works again', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 1, 13, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = () => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { codes: [] } });
    await push();
    const log = () => t.app.db.raw.prepare("SELECT key, kind, text, reply_to FROM telegram_log WHERE kind LIKE 'system%' ORDER BY id").all();
    t.advance(15 * 60000); await t.call('GET', '/health'); await admin('GET', '/api/system/watch');
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    let l = log().filter(x => /شاشة طلبات الأساسية/.test(x.text));
    assert.equal(l.length, 1, 'one message');
    assert.match(l[0].text, /واقف من/);
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.equal(log().filter(x => /شاشة طلبات الأساسية/.test(x.text)).length, 1, 'not repeated');
    await push(); t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    l = log().filter(x => /شاشة طلبات الأساسية/.test(x.text));
    assert.equal(l.length, 2); assert.match(l[1].text, /رجع اشتغل/); assert.equal(l[1].reply_to, l[0].key);
    const w = (await admin('GET', '/api/system/watch')).body;
    assert.ok(w.parts.find(p => p.id === 'talabat').ok);
  } finally { await t.close(); }
});

test('backup: every table page by page with the monitor key, never keys or hashes', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const b = body => t.call('POST', '/api/backup', { headers: { 'x-orders-token': token }, body });
    assert.equal((await t.call('POST', '/api/backup', { body: {} })).status, 401);
    const { tables } = (await b({})).body;
    assert.ok(tables.includes('employees') && tables.includes('settings'));
    const s = (await b({ table: 'settings' })).body;
    assert.ok(s.rows.every(r => !/hash|token|secret/i.test(r.key)), 'no secrets');
    assert.equal((await b({ table: 'nope' })).status, 400);
  } finally { await t.close(); }
});
