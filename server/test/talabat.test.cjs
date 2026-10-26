'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, DEVICE } = require('./helpers.cjs');

test('talabat: the live screen reports columns; accept time and who accepted; waiting too long alerts once', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const a = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    await admin('PATCH', '/api/desks/pin', { employeeId: a.id, desk: 'talabat', pin: '7', pinConfirmation: '7' });
    const login = await t.call('POST', '/api/desks/login', { headers: { 'x-device-token': DEVICE }, body: { desk: 'talabat', pin: '7', device: 'p1' } });
    const h = { 'x-device-token': DEVICE, 'x-desk-session': login.body.token };
    const push = orders => t.call('POST', '/api/talabat/push', { headers: h, body: { account: 'tagamoa@x.com', orders } });
    assert.equal((await t.call('POST', '/api/talabat/push', { headers: { 'x-device-token': DEVICE }, body: {} })).status, 401);
    await push([{ id: '3977424562', code: '2703', column: 'new', store: 'التجمع' }]);
    t.advance(40000);
    await push([{ id: '3977424562', code: '2703', column: 'accepted' }, { id: '3977424999', code: '2704', column: 'new' }]);
    t.advance(100000);
    await push([{ id: '3977424999', code: '2704', column: 'new' }]);       // first one left the screen; second waits 100 s
    await push([{ id: '3977424999', code: '2704', column: 'new' }]);
    const d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    const o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977424562'].acceptSeconds, 40);
    assert.equal(o['3977424562'].acceptedBy, 'سارة');
    assert.equal(o['3977424562'].store, 'التجمع');
    assert.ok(o['3977424562'].goneAt);
    assert.equal(o['3977424999'].acceptedSeen, null);
    const al = t.app.db.raw.prepare("SELECT target FROM telegram_log WHERE kind = 'talabatAccept'").all();
    assert.deepEqual(al, [{ target: 'online' }]);
  } finally { await t.close(); }
});
