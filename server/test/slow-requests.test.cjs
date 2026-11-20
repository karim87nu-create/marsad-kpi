'use strict';
// 11-20: slow requests are kept in the database and read from /api/health/errors (no login, no query values).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
test('health/errors lists the saved slow requests and stays readable', async () => {
  const t = await start();
  try {
    const r0 = await t.call('GET', '/api/health/errors');
    assert.equal(r0.status, 200); assert.deepEqual(r0.body.slow, []);
    const entry = { at: '2026-11-20T11:00:00.000Z', path: 'GET /api/daily', status: 200, seconds: 4.2, top: [{ sql: 'SELECT 1', n: 3, rows: 900, ms: 40 }] };
    t.app.db.raw.prepare("INSERT INTO settings (key, value) VALUES ('slow_requests', ?)").run(JSON.stringify([entry]));
    const r1 = await t.call('GET', '/api/health/errors');
    assert.deepEqual(r1.body.slow, [entry]);
  } finally { await t.close(); }
});
