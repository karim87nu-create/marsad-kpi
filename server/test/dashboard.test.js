'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { cairoToUtc, businessDay, dayWindow, isOperating } = require('../src/time');

test('time rules: data day 09:00→09:00, operating 09:00→03:00, DST-safe', () => {
  assert.equal(businessDay(cairoToUtc(2026, 10, 23, 2, 30)), '2026-10-22');
  assert.equal(businessDay(cairoToUtc(2026, 10, 23, 9, 0)), '2026-10-23');
  assert.equal(isOperating(cairoToUtc(2026, 10, 23, 2, 59)), true);
  assert.equal(isOperating(cairoToUtc(2026, 10, 23, 3, 0)), false);
  const w = dayWindow('2026-10-22');
  assert.equal(w.end - w.start, 24 * 3600000);
  // Summer time (UTC+3) vs winter (UTC+2) both resolve to 09:00 Cairo.
  assert.equal(new Date(cairoToUtc(2026, 7, 1, 9)).toISOString(), '2026-07-01T06:00:00.000Z');
  assert.equal(new Date(cairoToUtc(2026, 12, 1, 9)).toISOString(), '2026-12-01T07:00:00.000Z');
});

test('live presence, calls, breaks and attendance from extension events', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 12, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    await t.employee(admin, { name: 'Idle', code: 'E2', pin: '9999' });
    const s = await t.session('1234');
    await t.event(s.token, 'session_login', { state: 'bound' });
    t.advance(5000);
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    let d = (await admin('GET', '/api/dashboard?live=1')).body;
    assert.equal(d.liveOnly, true);
    const me = d.presence.find(p => p.employeeId === e.id);
    assert.equal(me.state, 'ready');
    assert.equal(me.extension, '101');
    assert.equal(d.presence.find(p => p.employeeId !== e.id).state, 'no_session');

    t.advance(20000);
    await t.event(s.token, 'agentlinked', { callId: '555', phone: '01001234567', queue: '2001', callType: 'incoming', state: 'on_call', durationSeconds: 0 });
    await t.tick(s.token, 30000, 'on_call');
    d = (await admin('GET', '/api/dashboard?live=1')).body;
    const onCall = d.presence.find(p => p.employeeId === e.id);
    assert.equal(onCall.state, 'on_call');
    assert.equal(onCall.phone, '01001234567');
    assert.equal(Date.parse(onCall.startedAt), t.clock.now - 30000);
    await t.tick(s.token, 60000, 'on_call');
    await t.event(s.token, 'agentunlinked', { callId: '555', durationSeconds: 90, state: 'ready' });
    await t.event(s.token, 'heartbeat', { state: 'ready' });

    // Regular break of 12 minutes.
    const p = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
    await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId });
    await t.tick(s.token, 6 * 60000, 'break');
    d = (await admin('GET', '/api/dashboard?live=1')).body;
    assert.equal(d.presence.find(p => p.employeeId === e.id).state, 'break');
    assert.equal(Date.parse(d.presence.find(p => p.employeeId === e.id).startedAt), t.clock.now - 360000);
    const full = (await admin('GET', '/api/dashboard?date=2026-10-22')).body;     // break totals come with the day view (as before)
    assert.equal(full.breakTotals.find(x => x.employeeId === e.id).ongoingBreakSeconds, 360);
    await t.tick(s.token, 6 * 60000, 'break');
    await t.event(s.token, 'break_end', { state: 'ready', durationSeconds: 720 });
    await t.event(s.token, 'heartbeat', { state: 'ready' });

    // Silence > 90s becomes "انقطاع رصد" on the live view and in the state spans.
    t.advance(5 * 60000);
    d = (await admin('GET', '/api/dashboard?date=2026-10-22&attendance=1')).body;
    assert.equal(d.presence.find(p => p.employeeId === e.id).state, 'unknown');
    const perf = d.performance.find(x => x.employeeId === e.id);
    assert.equal(perf.calls, 1);
    assert.equal(perf.answered, 1);
    assert.equal(perf.avgHandleTime, 90);
    assert.equal(perf.breakSeconds, 720);
    assert.equal(d.calls[0].durationSeconds, 90);
    assert.equal(d.calls[0].eventType, 'agentunlinked');
    const states = d.attendance.states.filter(x => x.employeeId === e.id).map(x => x.state);
    assert.ok(states.includes('on_call') && states.includes('ready') && states.includes('unknown'));
    assert.equal(d.completedBreaks.length, 1);
    assert.equal(d.completedBreaks[0].durationSeconds, 720);
    assert.equal(d.attendance.sessions[0].running, false);              // silent for 5 minutes: not counted as running
    assert.equal(d.attendance.sessions[0].durationComplete, false);

    // Logout → offline (explicit logout = shift ended) and the shift list.
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    await t.device(s.token, 'POST', '/api/session/end', { reason: 'manual' });
    d = (await admin('GET', '/api/dashboard?date=2026-10-22')).body;
    assert.equal(d.presence.find(p => p.employeeId === e.id).state, 'shift_ended');
    assert.equal(d.shifts.length, 1);
    assert.equal(d.shifts[0].excluded, true);
    // Admin re-includes the closed shift.
    await admin('POST', '/api/shifts', { employeeId: e.id, sessionId: d.shifts[0].id, action: 'include', note: 'كان لسه شغال', requestId: 'r1' });
    d = (await admin('GET', '/api/dashboard?date=2026-10-22')).body;
    assert.equal(d.shifts[0].excluded, false);
    assert.equal(d.presence.find(p => p.employeeId === e.id).state, 'offline');
  } finally { await t.close(); }
});

test('break policy: two regular breaks, 30 minutes total, then supervisor approval', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 12, 0, 0) });
  try {
    const admin = await t.admin();
    await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    const takeBreak = async minutes => {
      const p = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
      assert.equal(p.status, 200, JSON.stringify(p.body));
      await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId });
      t.advance(minutes * 60000);
      await t.event(s.token, 'break_end', { state: 'ready', durationSeconds: minutes * 60 });
      await t.event(s.token, 'heartbeat', { state: 'ready' });
      return p.body;
    };
    const first = await takeBreak(18);                     // 15 + 3 grace
    assert.equal(first.allowedSeconds, 1200);
    const pol = (await t.device(s.token, 'GET', '/api/break-requests')).body.breakPolicy;
    assert.equal(pol.remainingSeconds, 720);               // 30 − 18 minutes
    assert.equal(pol.nextAllowedSeconds, 720);
    await takeBreak(12);
    const after = (await t.device(s.token, 'GET', '/api/break-requests')).body.breakPolicy;
    assert.equal(after.regularAvailable, false);
    assert.equal((await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' })).body.error, 'approval_required');
    // Request → supervisor approves → start with the approved duration.
    const id = 'break-request:' + '11111111-2222-3333-4444-555555555555';
    const req = await t.device(s.token, 'POST', '/api/break-requests', { action: 'request', id, reasonId: '2', reason: 'بريك إضافي', requestedMinutes: 30 });
    assert.equal(req.body.request.status, 'pending');
    const list = (await admin('GET', '/api/break-requests')).body;
    assert.equal(list.canDecide, true);
    assert.equal(list.requests[0].status, 'pending');
    await admin('POST', '/api/break-requests', { action: 'approve', id });
    const go = await t.device(s.token, 'POST', '/api/break-requests', { action: 'start', id });
    assert.equal(go.body.allowedSeconds, 1800);
    assert.equal((await t.event(s.token, 'break_start', { state: 'break', permissionId: go.body.permissionId })).status, 200);
    const mine = (await t.device(s.token, 'GET', '/api/break-requests')).body;
    assert.equal(mine.requests[0].status, 'starting');
    // Not ready (on break) → no new permission.
    assert.equal((await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' })).body.error, 'not_ready');
  } finally { await t.close(); }
});

test('break policy: a short first break still leaves at most 15 minutes for the second (old rule)', async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 12, 0, 0) });
  try {
    const admin = await t.admin();
    await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    const p = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
    await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId });
    t.advance(10 * 60000);
    await t.event(s.token, 'break_end', { state: 'ready', durationSeconds: 600 });
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    const pol = (await t.device(s.token, 'GET', '/api/break-requests')).body.breakPolicy;
    assert.equal(pol.remainingSeconds, 1200);              // 30 − 10 minutes left in the day
    assert.equal(pol.nextAllowedSeconds, 900);             // but one break is never more than 15 minutes
    assert.equal((await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' })).body.allowedSeconds, 900);
  } finally { await t.close(); }
});

test('messages: send, deliver, acknowledge, admin log', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const sent = await admin('POST', '/api/messages', { id, title: 'تنبيه', message: 'اجتماع', priority: 'urgent', hours: 4, recipients: 'all' });
    assert.equal(sent.body.recipients, 1);
    assert.equal((await admin('POST', '/api/messages', { id, title: 'تنبيه', message: 'اجتماع', priority: 'urgent', hours: 4, recipients: 'all' })).body.duplicate, true);
    const inbox = (await t.device(s.token, 'GET', '/api/messages')).body.messages;
    assert.equal(inbox.length, 1);
    await t.device(s.token, 'PATCH', '/api/messages', { id, action: 'delivered' });
    await t.device(s.token, 'PATCH', '/api/messages', { id, action: 'acknowledged' });
    assert.equal((await t.device(s.token, 'GET', '/api/messages')).body.messages.length, 0);
    const log = (await admin('GET', '/api/messages?date=2026-10-22&employee=' + e.id)).body.messages[0];
    assert.ok(log.delivered_at && log.acknowledged_at);
  } finally { await t.close(); }
});
