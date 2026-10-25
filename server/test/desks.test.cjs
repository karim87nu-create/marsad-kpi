'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, DEVICE } = require('./helpers.cjs');

test('desks: a password per desk, the gate login, beats and logout; Apex names tied to employees', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const a = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    const b = await t.employee(admin, { name: 'أحمد', code: 'E2', pin: '2' });
    const dev = { 'x-device-token': DEVICE };
    const login = (desk, pin) => t.call('POST', '/api/desks/login', { headers: dev, body: { desk, pin, device: 'pc1-talabat', place: 'التجمع' } });
    // No desk password yet: the call center PIN does not open the desk.
    assert.equal((await login('talabat', '1')).status, 401);
    assert.equal((await admin('PATCH', '/api/desks/pin', { employeeId: a.id, desk: 'talabat', pin: '55', pinConfirmation: '55' })).status, 200);
    assert.equal((await admin('PATCH', '/api/desks/pin', { employeeId: b.id, desk: 'talabat', pin: '55', pinConfirmation: '55' })).status, 409, 'unique per desk');
    assert.equal((await admin('PATCH', '/api/desks/pin', { employeeId: b.id, desk: 'site', pin: '55', pinConfirmation: '55' })).status, 200, 'same digits on another desk is fine');
    assert.equal((await admin('PATCH', '/api/desks/pin', { employeeId: b.id, desk: 'nope', pin: '5', pinConfirmation: '5' })).status, 400);
    assert.equal((await t.call('POST', '/api/desks/login', { body: { desk: 'talabat', pin: '55' } })).status, 403, 'device token needed');
    const r = await login('talabat', '55');
    assert.equal(r.status, 200); assert.equal(r.body.employee.name, 'سارة');
    assert.equal((await login('site', '55')).body.employee.name, 'أحمد');
    const s = { ...dev, 'x-desk-session': r.body.token };
    assert.equal((await t.call('POST', '/api/desks/beat', { headers: s, body: {} })).status, 200);
    let d = (await admin('GET', '/api/desks')).body;
    assert.equal(d.sessions.filter(x => x.live).length, 2);
    assert.deepEqual(d.pins.filter(p => p.employeeId === a.id).map(p => p.desk), ['talabat']);
    // A new password ends the open session.
    await admin('PATCH', '/api/desks/pin', { employeeId: a.id, desk: 'talabat', pin: '66', pinConfirmation: '66' });
    assert.equal((await t.call('POST', '/api/desks/beat', { headers: s, body: {} })).status, 401);
    const r2 = await login('talabat', '66');
    assert.equal((await t.call('POST', '/api/desks/logout', { headers: { ...dev, 'x-desk-session': r2.body.token }, body: {} })).status, 200);
    d = (await admin('GET', '/api/desks')).body;
    assert.equal(d.sessions.find(x => x.desk === 'talabat' && !x.endReason), undefined);

    // Apex names: seen from the monitor's push, then tied to an employee; the order view gets the Marsad name.
    const { token } = (await admin('POST', '/api/orders/token')).body;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-10-22', users: ['sara.m', 'ahmed'], staff: [{ name: 'sara.m', orders: 2 }], cancels: [] } });
    d = (await admin('GET', '/api/desks')).body;
    assert.deepEqual(d.apexSeen, ['ahmed', 'sara.m']);
    assert.equal((await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: a.id })).status, 200);
    const live = (await admin('GET', '/api/orders/live?day=2026-10-22')).body;
    assert.deepEqual(live.apexNames, { 'sara.m': 'سارة' });
    await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: null });
    assert.deepEqual((await admin('GET', '/api/orders/live?day=2026-10-22')).body.apexNames, {});
  } finally { await t.close(); }
});
