'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('a break whose end was never recorded stops at the first sign of work, not at the end of the day', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 14, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    const p = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
    await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId });
    await t.tick(s.token, 10 * 60000, 'break');              // 10 minutes on break …
    await t.tick(s.token, 3 * 3600000, 'ready');             // … then back to work with no break_end, for 3 hours
    const policy = await t.app.breakPolicy(e.id);
    assert.equal(policy.startsUsed, 1);
    assert.ok(policy.usedSeconds >= 600 && policy.usedSeconds <= 660, 'used ' + policy.usedSeconds);
    assert.equal(policy.activeRegular, false);
    // A second break later in the day is counted on its own.
    const q = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
    assert.equal(q.status, 200);
    await t.event(s.token, 'break_start', { state: 'break', permissionId: q.body.permissionId });
    await t.tick(s.token, 5 * 60000, 'break');
    const again = await t.app.breakPolicy(e.id);
    assert.equal(again.startsUsed, 2);
    assert.ok(again.usedSeconds >= 900 && again.usedSeconds <= 1000, 'used ' + again.usedSeconds);
  } finally { await t.close(); }
});
