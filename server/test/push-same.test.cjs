'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// 11-16 rush hour: the cashier sends only the orders that changed; the server keeps the rest from its last push.
test('orders push: unchanged rows by number, areas kept, a missing row asks for everything', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 16, 0, 0) });
  try {
    const admin = await t.admin();
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    const push = (body, n) => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-11-16', generatedAt: new Date(t.clock.now + n * 1000).toISOString(), ...body } });
    const a = { no: 1, at: '2026-11-16T15:00:00+02:00', kind: 'طلبات', items: [{ no: '0101001', qty: 1 }] }, b = { no: 2, at: '2026-11-16T15:10:00+02:00', kind: 'الموقع', items: [{ no: '0102001', qty: 2 }] };
    const r1 = await push({ online: [a, b], lateOut: [{ no: 1, at: a.at, pilot: 'محمود' }], locations: [{ no: 370, name: 'مدنتى', branch: 3 }], users: ['MARSAD'] }, 1);
    assert.equal(r1.body.same, 1);
    // Only order 2 changed (it left): order 1 by number; no areas, no users.
    const r2 = await push({ online: [{ ...b, out: '2026-11-16T15:40:00+02:00' }], same: { online: [1], lateOut: [1] }, lateOut: [] }, 2);
    assert.equal(r2.status, 200); assert.ok(!r2.body.missingSame);
    const d = JSON.parse(t.app.db.raw.prepare("SELECT data FROM orders_days WHERE day = '2026-11-16'").get().data);
    assert.deepEqual(d.online.map(o => [o.no, !!o.out, o.items.length]), [[1, false, 1], [2, true, 1]]);
    assert.equal(d.lateOut[0].pilot, 'محمود');
    assert.equal(d.locations[0].no, 370); assert.deepEqual(d.users, ['MARSAD']);
    // A number the server does not have: told back.
    const r3 = await push({ online: [], same: { online: [1, 9] } }, 3);
    assert.deepEqual(r3.body.missingSame, ['online:9']);
  } finally { await t.close(); }
});
