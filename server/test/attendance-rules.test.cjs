'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { attendance, mergeBreaks, breakTotals } = require('../src/attendance-rules.js');
const { cairoToUtc, dayWindow } = require('../src/time.js');

const w = dayWindow('2026-10-22'), at = (h, m = 0) => cairoToUtc(2026, 10, h < 9 ? 23 : 22, h, m, 0);
const opts = { start: w.start, operatingEnd: w.operatingEnd, end: w.end, now: w.end + 3600000 };
const session = (id, from, extra = {}) => ({ id, employeeId: 1, extension: '101', issuedAt: from, workStartedAt: from, lastSeen: from, expiresAt: from + 18 * 3600000, revokedAt: null, reason: null, ...extra });
// Evidence spans as the attendance query groups them (one row per continuous state).
const span = (sessionId, state, from, to) => ({ sessionId, employeeId: 1, extension: '101', state, started: from, lastEvidence: to });
const sum = (states, state) => states.filter(s => s.state === state && !s.outsideHours).reduce((n, s) => n + s.durationSeconds, 0);

test('a session left open after the employee stopped is not counted as a gap', () => {
  const s = session('1', at(10), { lastSeen: at(11) });
  const r = attendance([s], [span('1', 'ready', at(10), at(11))], opts);
  assert.equal(sum(r.states, 'unknown'), 0);
  assert.equal(sum(r.states, 'ready'), 3600 + 90);
  assert.equal(r.sessions[0].daySeconds, 3600);
  assert.equal(r.sessions[0].closureKnown, false);
});

test('silence inside the shift, and a lost connection followed by a new login, are gaps', () => {
  const a = session('1', at(10), { lastSeen: at(12), revokedAt: at(12, 25), reason: 'browser_restarted' });
  const b = session('2', at(12, 20), { lastSeen: at(13) });
  const r = attendance([a, b], [span('1', 'ready', at(10), at(11)), span('1', 'ready', at(11, 30), at(12)), span('2', 'ready', at(12, 20), at(13))], opts);
  const gaps = r.states.filter(s => s.state === 'unknown').map(s => s.durationSeconds).sort((x, y) => x - y);
  assert.deepEqual(gaps, [20 * 60 - 90, 30 * 60 - 90]);   // 11:01:30→11:30 inside session 1, 12:01:30→12:20 until the new login
});

test('a PC left on with Arabicss disconnected does not stretch the shift', () => {
  const s = session('1', at(10), { lastSeen: at(23) });
  const r = attendance([s], [span('1', 'ready', at(10), at(14)), span('1', 'unknown', at(14, 5), at(23))], opts);
  assert.equal(sum(r.states, 'unknown'), 0);
  assert.equal(r.sessions[0].daySeconds, 4 * 3600);
});

test('after a known logout the time is "offline", not a gap', () => {
  const s = session('1', at(10), { lastSeen: at(13), revokedAt: at(13), reason: 'arabicss_logout' });
  const r = attendance([s], [span('1', 'ready', at(10), at(13))], opts);
  assert.equal(sum(r.states, 'unknown'), 0);
  assert.ok(r.states.some(x => x.state === 'offline'));
});

test('a break Arabicss kept showing with no recorded end still counts as break time', () => {
  const s = session('1', at(10), { lastSeen: at(16) });
  const r = attendance([s], [span('1', 'ready', at(10), at(14)), span('1', 'break', at(14), at(16))], opts);
  const states = mergeBreaks(r.states, [], w.operatingEnd);
  assert.equal(breakTotals(states)[0].totalBreakSeconds, 2 * 3600 + 90);
});

test('recorded breaks and break heartbeats are merged, not added twice; night work is kept but not totalled', () => {
  const s = session('1', at(22), { lastSeen: at(4) });
  const r = attendance([s], [span('1', 'ready', at(22), at(23)), span('1', 'break', at(23), at(23, 20)), span('1', 'ready', at(23, 20), at(4))], opts);
  const states = mergeBreaks(r.states, [{ employeeId: 1, extension: '101', startedAt: new Date(at(23, 5)).toISOString(), endedAt: new Date(at(23, 25)).toISOString() }], w.operatingEnd);
  assert.equal(breakTotals(states)[0].totalBreakSeconds, 25 * 60);   // 23:00 → 23:25
  assert.ok(states.some(x => x.outsideHours && x.state === 'ready'));
  assert.equal(r.sessions[0].daySeconds, 5 * 3600);                    // 22:00 → 03:00 only
});
