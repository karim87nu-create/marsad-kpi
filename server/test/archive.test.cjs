'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('archive: old event bodies leave only after the PC took them, reports keep every column; old Telegram and audit rows removed; recent ones untouched', async () => {
  const now = Date.UTC(2026, 10, 8, 3, 0, 0), DAY = 86400000;
  const t = await start({ at: now });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const raw = t.app.db.raw;
    const ins = raw.prepare("INSERT INTO events (session_id, employee_id, event_type, event_key, occurred_at, received_at, call_id, phone, payload, extra) VALUES (1, 1, ?, ?, ?, ?, ?, '0100', ?, ?)");
    const big = JSON.stringify({ callId: 'C1', blob: 'x'.repeat(400) });
    ins.run('call_observed', 'k1', now - 90 * DAY, now - 90 * DAY, 'C1', big, '{"a":1}');
    ins.run('agentunlinked', 'k2', now - 90 * DAY, now - 90 * DAY, 'C1', big, null);
    ins.run('call_observed', 'k3', now - 5 * DAY, now - 5 * DAY, 'C2', big, '{"a":1}');
    raw.prepare("INSERT INTO telegram_log (key, kind, text, created_at) VALUES ('old', 'x', 't', ?), ('new', 'x', 't', ?)").run(now - 60 * DAY, now - DAY);
    const call = (path, body) => t.call('POST', path, { body, headers: { 'x-orders-token': token } });
    assert.equal((await call('/api/archive/next', { kind: 'events' })).status, 200);
    assert.equal((await t.call('POST', '/api/archive/next', { body: { kind: 'events' } })).status, 401);
    const page = (await call('/api/archive/next', { kind: 'events', after: 0 })).body;
    assert.deepEqual(page.rows.map(r => r.event_key || r.id).length, 2, 'only the two old ones');
    assert.ok(page.rows.every(r => r.payload === big), 'the full body goes to the PC first');
    const before = raw.prepare('SELECT payload FROM events WHERE event_key = ?').get('k1').payload;
    assert.equal(before, big, 'nothing changes before «done»');
    const done = (await call('/api/archive/done', { kind: 'events', ids: page.rows.map(r => r.id) })).body;
    assert.equal(done.changed, 2);
    const rows = raw.prepare('SELECT event_key, event_type, occurred_at, call_id, phone, payload, extra FROM events ORDER BY id').all();
    assert.deepEqual(JSON.parse(rows[0].payload), { callId: 'C1' }, 'the call id the reports read stays');
    assert.equal(rows[0].extra, null); assert.equal(rows[1].payload, null); assert.equal(rows[1].call_id, 'C1'); assert.equal(rows[1].phone, '0100');
    assert.equal(rows[2].payload, big, 'recent events untouched');
    assert.equal((await call('/api/archive/next', { kind: 'events' })).body.rows.length, 0, 'nothing left to take');
    // A recent id sent by mistake is not touched.
    await call('/api/archive/done', { kind: 'events', ids: [3] });
    assert.equal(raw.prepare('SELECT payload FROM events WHERE id = 3').get().payload, big);
    const tg = (await call('/api/archive/next', { kind: 'telegram_log' })).body;
    assert.deepEqual(tg.rows.map(r => r.key), ['old']);
    await call('/api/archive/done', { kind: 'telegram_log', ids: tg.rows.map(r => r.id) });
    assert.deepEqual(raw.prepare('SELECT key FROM telegram_log ORDER BY id').all().map(r => r.key), ['new']);
  } finally { await t.close(); }
});
