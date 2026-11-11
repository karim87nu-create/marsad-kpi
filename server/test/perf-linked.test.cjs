'use strict';
// Karim 11-11: calls ↔ orders ↔ customers by phone; the weekly shift table; the linked numbers per employee.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('linked KPIs: conversion, FCR, answer wait, missed calls one could have taken, the shift table', async () => {
  const day = '2026-11-11', T = (h, m = 0, s = 0) => cairoToUtc(2026, 11, 11, h, m, s);
  const t = await start({ at: T(23, 30) });
  try {
    const admin = await t.admin();
    const sara = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' }), mona = await t.employee(admin, { name: 'منى', code: 'E2', pin: '2222' }), ali = await t.employee(admin, { name: 'علي', code: 'E3', pin: '3333' });
    const { phKey } = await import('../src/perf.js');

    // The weekly table (week starts Saturday 07-11).
    const w = (await admin('GET', '/api/roster?week=' + day)).body;
    assert.equal(w.week, '2026-11-07'); assert.equal(w.days.length, 7);
    assert.equal((await admin('PUT', '/api/roster', { cells: [{ employeeId: sara.id, day, start: '16:00', end: '00:00' }, { employeeId: mona.id, day, start: '16', end: '24' }, { employeeId: ali.id, day, start: '18:00', end: '02:00' }] })).status, 200);
    assert.equal((await admin('PUT', '/api/roster', { cells: [{ employeeId: sara.id, day, start: 'x', end: '5' }] })).status, 400);
    const cells = (await admin('GET', '/api/roster?week=' + day)).body.employees.find(e => e.id === mona.id).cells;
    assert.deepEqual(cells[day], { start: '16:00', end: '00:00' });
    assert.equal((await admin('POST', '/api/roster', { action: 'copy', from: day, to: '2026-11-14' })).body.copied, 3);

    // The Apex day (sent by the cashier PC): a hotline order from the customer Sara spoke to, 10 minutes after.
    const P1 = '01011112222', P2 = '01233334444', P3 = '01155556666';
    t.app.db.raw.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?,?,?)').run(day, JSON.stringify({ v: 1, day, book: [
      [5001, new Date(T(20, 15)).toISOString(), 'sara_apex', 'Hotline', 320, 'مدينة نصر', phKey(P1), 'Delivery'],
      [5002, new Date(T(20, 40)).toISOString(), 'sara_apex', 'Hotline', 150, 'التجمع', phKey('999'), 'Takeaway'],
    ] }), T(23));
    t.app.db.raw.prepare('INSERT INTO apex_names (apex_name, employee_id, set_at) VALUES (?,?,?)').run('sara_apex', sara.id, T(12));
    const iso = ms => new Date(ms).toISOString();
    const call = (employeeId, phone, a, b, queue = '601') => ({ employeeId, phone, queue, callType: 'incoming', complete: true, startedAt: iso(a), endedAt: iso(b), durationSeconds: (b - a) / 1000, outsideHours: false });
    const rec = (phone, a, wait, status, queue = '601') => ({ phone, startMs: a, waitSeconds: wait, status, queue, date: day });
    t.app.day = async () => ({
      calls: [call(sara.id, P1, T(20, 0, 8), T(20, 3)), call(mona.id, P2, T(20, 5, 4), T(20, 7), '602')],
      states: [{ employeeId: mona.id, state: 'ready', startedAt: iso(T(20, 30)), endedAt: iso(T(20, 40)) }, { employeeId: sara.id, state: 'on_call', startedAt: iso(T(20, 30)), endedAt: iso(T(20, 40)) }],
      sessions: [{ employeeId: sara.id, workStartedAt: T(16, 2), revokedAt: null }, { employeeId: mona.id, workStartedAt: T(16, 20), revokedAt: T(22) }],
      raw: { records: [rec(P1, T(20, 0), 8, 'success'), rec(P2, T(20, 5), 4, 'success', '602'), rec(P2, T(21, 0), 20, 'success', '602'), rec(P3, T(20, 35), 30, 'abandoned')] },
    });
    t.app.dayHistory = async () => ({ records: [] });
    const p = await t.app.perfRange(day, day, T(23, 30));
    const E = id => p.employees.find(e => e.employeeId === id);
    assert.equal(E(sara.id).converted, 1); assert.equal(E(sara.id).conversionPct, 100); assert.equal(E(sara.id).revenue, 320);
    assert.equal(E(sara.id).entered, 2, 'orders she entered on Apex');
    assert.equal(E(mona.id).orderCalls, 0, 'a follow-up call is not a chance to sell');
    assert.equal(E(mona.id).repeat, 1, 'the same customer called again'); assert.equal(E(mona.id).fcrPct, 0);
    assert.equal(E(sara.id).fcrPct, 100);
    assert.equal(E(sara.id).avgAnswerWait, 8); assert.equal(E(mona.id).avgAnswerWait, 4);
    assert.equal(E(mona.id).missedAvailable, 1, 'available when the customer gave up');
    assert.equal(E(sara.id).missedMine, 0, 'on a call: not hers');
    assert.equal(E(ali.id).missedAway, 1, 'on the shift table and not there: the missed call counts on him too');
    assert.equal(E(ali.id).absentDays, 1);
    assert.equal(E(mona.id).lateDays, 1); assert.equal(E(mona.id).lateMinutes, 20); assert.equal(E(mona.id).earlyMinutes, 120);
    assert.equal(E(sara.id).lateDays, 0, 'two minutes is within the grace');
    assert.equal(p.team.lost, 1, 'the missed customer did not order afterwards');
    // In the KPI page.
    const k = (await admin('GET', '/api/kpi?from=' + day + '&to=' + day)).body;
    assert.equal(k.targets.conversionPct.min, 40);
    assert.ok(k.employees.some(e => e.id === ali.id && e.absentDays === 1), 'on the table and absent: listed');
  } finally { await t.close(); }
});
