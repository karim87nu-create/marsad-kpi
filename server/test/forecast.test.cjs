'use strict';
// Karim 11-11: the calls and orders expected per half hour, the employees needed (Erlang C) against the shift table.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('forecast: Erlang C, the same weekday of the last 4 weeks, the shift table, what happened', async () => {
  const { serviceLevel, agentsNeeded } = await import('../src/forecast.js');
  // 30 calls in half an hour, 3 minutes each = 3 erlangs.
  assert.ok(serviceLevel(4, 3, 180, 10) < 0.9 && serviceLevel(6, 3, 180, 10) >= 0.9);
  assert.equal(agentsNeeded(30, 180), 6);
  assert.equal(agentsNeeded(0, 180), 0);
  const t = await start({ at: cairoToUtc(2026, 11, 11, 23) });
  try {
    const admin = await t.admin();
    const sara = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    await admin('PUT', '/api/roster', { cells: [{ employeeId: sara.id, day: '2026-11-12', start: '20:00', end: '22:00' }] });
    // Every past Thursday: 20 calls between 8 and 8:30 م, 2 minutes each; Apex had 30 orders in the 8 م hour.
    t.app.dayHistory = async d => ({ records: ['2026-11-05', '2026-10-29', '2026-10-22', '2026-10-15'].includes(d)
      ? Array.from({ length: 20 }, (_, i) => { const [y, m, dd] = d.split('-').map(Number); return { startMs: cairoToUtc(y, m, dd, 20, i), status: 'success', queue: '601', durationSeconds: 120, waitSeconds: 3 }; }) : [] });
    for (const d of ['2026-11-05', '2026-10-29']) t.app.db.raw.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?,?,?)').run(d, JSON.stringify({ hours: [{ h: 20, orders: 30 }] }), 1);
    const f = (await admin('GET', '/api/forecast?day=2026-11-12')).body;
    const slot = f.rows.find(r => r.label === '20:00');
    assert.equal(slot.calls, 20); assert.equal(slot.orders, 15);
    assert.equal(f.aht, 135, 'the recent call length plus 15 s after the call');
    assert.ok(slot.need >= 3, 'needed: ' + slot.need);
    assert.equal(slot.rostered, 1); assert.ok(slot.gap < 0);
    assert.ok(f.shortSlots.includes('20:00'));
    assert.equal(f.rows.find(r => r.label === '10:00').need, 0);
  } finally { await t.close(); }
});
