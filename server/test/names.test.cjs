'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('apex names: seen from the monitor, tied to an employee, used by the order views', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const a = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    const { token } = (await admin('POST', '/api/orders/token')).body;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-10-22', users: ['sara.m', 'ahmed'], staff: [{ name: 'sara.m', orders: 2 }], cancels: [] } });
    assert.deepEqual((await admin('GET', '/api/apex-names')).body.apexSeen, ['ahmed', 'sara.m']);
    assert.equal((await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: a.id })).status, 200);
    assert.deepEqual((await admin('GET', '/api/orders/live?day=2026-10-22')).body.apexNames, { 'sara.m': 'سارة' });
    await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: null });
    assert.deepEqual((await admin('GET', '/api/orders/live?day=2026-10-22')).body.apexNames, {});
  } finally { await t.close(); }
});
