'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('pulse: minute-by-minute states for the now screen, and the shared seat order', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 12, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'session_login', { state: 'bound' });
    await t.tick(s.token, 3 * 60000, 'ready');
    await t.event(s.token, 'agentlinked', { callId: '9', phone: '0100', queue: '2001', callType: 'incoming', state: 'on_call', durationSeconds: 0 });
    await t.tick(s.token, 3 * 60000, 'on_call');
    const p = (await admin('GET', '/api/pulse?minutes=30')).body;
    assert.equal(p.count, 30);
    assert.equal(p.queue.length, 30);
    const me = p.people.find(x => x.employeeId === e.id);
    assert.ok(me, JSON.stringify(p.people));
    assert.equal(me.s.length, 30);
    assert.match(me.s, /r+c+u?$/);
    assert.ok(me.s.startsWith('-'));

    assert.deepEqual((await admin('GET', '/api/now-layout')).body.order, []);
    const saved = await admin('POST', '/api/now-layout', { order: [String(e.id), 'x', 'x'] });
    assert.equal(saved.status, 200);
    assert.deepEqual((await admin('GET', '/api/now-layout')).body.order, [String(e.id), 'x']);
    assert.equal((await admin('POST', '/api/now-layout', { order: 'bad' })).status, 400);
  } finally { await t.close(); }
});
