'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, DEVICE } = require('./helpers.cjs');

test('admin login, roles and unique passwords', async () => {
  const t = await start();
  try {
    assert.equal((await t.call('POST', '/api/admin-access', { body: { action: 'login', password: 'wrong' } })).status, 401);
    const admin = await t.admin();
    const me = await admin('GET', '/api/admin-access');
    assert.equal(me.body.identity.role, 'admin');
    assert.deepEqual(me.body.accounts, []);
    assert.equal((await admin('POST', '/api/admin-access', { name: 'Sara', role: 'viewer', password: 'master-pass', confirmation: 'master-pass' })).status, 409);
    assert.equal((await admin('POST', '/api/admin-access', { name: 'Sara', role: 'viewer', password: 'viewer-pass', confirmation: 'viewer-pass' })).status, 200);
    const viewerToken = await t.login('viewer-pass');
    const viewer = (m, p, b) => t.call(m, p, { body: b, headers: { 'x-admin-password': viewerToken } });
    assert.equal((await viewer('GET', '/api/admin-access')).body.identity.role, 'viewer');
    assert.equal((await viewer('GET', '/api/admin-access')).body.accounts, undefined);
    assert.equal((await viewer('POST', '/api/employees', { name: 'x', employeeCode: 'x', pin: '1', pinConfirmation: '1' })).status, 403);
    assert.equal((await viewer('GET', '/api/live')).status, 200);
    // Raw password in the header still works for older pages.
    assert.equal((await t.call('GET', '/api/admin-access', { headers: { 'x-admin-password': 'master-pass' } })).status, 200);
    await t.call('POST', '/api/admin-access', { body: { action: 'logout' }, headers: { 'x-admin-password': viewerToken } });
    assert.equal((await viewer('GET', '/api/admin-access')).status, 401);
  } finally { await t.close(); }
});

test('CORS preflight for the admin page origin only', async () => {
  const t = await start();
  try {
    const ok = await t.call('OPTIONS', '/api/live', { headers: { origin: 'https://karim87nu-create.github.io', 'access-control-request-method': 'GET' } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://karim87nu-create.github.io');
    assert.match(ok.headers.get('access-control-allow-headers'), /x-admin-password/);
    const other = await t.call('OPTIONS', '/api/live', { headers: { origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  } finally { await t.close(); }
});

test('employees: unique code and PIN, PIN change ends the session, delete keeps history', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    assert.equal((await admin('POST', '/api/employees', { name: 'B', employeeCode: 'E1', pin: '999', pinConfirmation: '999' })).body.error, 'employee_code_exists');
    assert.equal((await admin('POST', '/api/employees', { name: 'B', employeeCode: 'E2', pin: '1234', pinConfirmation: '1234' })).body.error, 'password_in_use');
    assert.equal((await admin('POST', '/api/employees', { name: 'B', employeeCode: 'E2', pin: '55', pinConfirmation: '56' })).body.error, 'password_confirmation_mismatch');
    const s = await t.session('1234', '101');
    assert.equal(s.status, 200);
    // The extension reads exp from the token body exactly like this.
    const claims = JSON.parse(Buffer.from(s.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert.ok(claims.exp > t.clock.now);
    assert.equal((await t.event(s.token, 'heartbeat', { state: 'ready' })).status, 200);
    await admin('PATCH', '/api/employees', { id: e.id, pin: '4321', pinConfirmation: '4321' });
    assert.equal((await t.event(s.token, 'heartbeat', { state: 'ready' })).body.error, 'invalid_employee_session');
    assert.equal((await t.session('1234')).status, 401);
    assert.equal((await t.session('4321')).status, 200);
    // Nothing is deleted: the delete route refuses, and stopping the employee keeps the record and the password.
    assert.equal((await admin('DELETE', '/api/employees', { id: e.id, confirmCode: 'E1' })).status, 409);
    assert.equal((await admin('PATCH', '/api/employees', { id: e.id, active: false })).status, 200);
    const list = (await admin('GET', '/api/employees')).body;
    assert.equal(list.employees.find(x => x.id === e.id).active, false);
    assert.equal((await t.session('4321')).status, 401);
    assert.equal((await admin('PATCH', '/api/employees', { id: e.id, active: true })).status, 200);
    assert.equal((await t.session('4321')).status, 200);
  } finally { await t.close(); }
});

test('session start: device check, wrong PIN, rate limit, extension conflicts', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    await t.employee(admin);
    await t.employee(admin, { name: 'Mona', code: 'E2', pin: '5678' });
    assert.equal((await t.call('POST', '/api/session/start', { body: { pin: '1234' }, headers: { 'x-device-token': 'bad' } })).body.error, 'invalid_device');
    assert.equal((await t.session('12a4')).status, 400);
    const a = await t.session('1234', '101');
    assert.equal((await t.event(a.token, 'heartbeat', { state: 'ready' })).status, 200);
    assert.equal((await t.session('5678', '101')).status, 409);       // someone active on 101
    assert.equal((await t.session('1234', '102')).status, 409);       // same person active elsewhere
    t.advance(120000);                                                   // stale: handover allowed
    assert.equal((await t.session('5678', '101')).status, 200);
    for (let i = 0; i < 10; i++) await t.session('0000');
    assert.equal((await t.session('0000')).status, 429);
  } finally { await t.close(); }
});

test('events: binding, duplicates, mismatches, clock and break rules', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    await t.employee(admin);
    const s = await t.session('1234');
    assert.equal((await t.event(s.token, 'session_login', { state: 'verified' })).status, 200);
    assert.equal((await t.event(s.token, 'heartbeat', { extension: '102', state: 'ready' })).body.error, 'extension_mismatch');
    const key = { eventKey: 'fixed-key' };
    assert.equal((await t.event(s.token, 'heartbeat', { state: 'ready', ...key })).body.ok, true);
    assert.equal((await t.event(s.token, 'heartbeat', { state: 'ready', ...key })).body.duplicate, true);
    assert.equal((await t.event(s.token, 'heartbeat', { payload: { eventClock: { method: 'unsynchronized' } } })).body.error, 'clock_unsynchronized');
    assert.equal((await t.event(s.token, 'heartbeat', { occurredAt: new Date(t.clock.now + 600000).toISOString() })).body.error, 'invalid_time');
    // Break without a permission is rejected (the extension then records break_observed).
    assert.equal((await t.event(s.token, 'break_start', { state: 'break' })).body.error, 'break_authorization_rejected');
    assert.equal((await t.event(s.token, 'break_end', { state: 'ready' })).body.error, 'break_start_missing');
    // Regular break: readiness → permission → start → end.
    const p = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
    assert.equal(p.status, 200);
    assert.equal(p.body.allowedSeconds, 1200);
    assert.equal(p.body.graceSeconds, 300);
    assert.equal((await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId })).status, 200);
    assert.equal((await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId })).body.error, 'break_authorization_rejected');
    t.advance(10 * 60000);
    assert.equal((await t.event(s.token, 'break_end', { state: 'ready', durationSeconds: 600 })).status, 200);
    const policy = (await t.device(s.token, 'GET', '/api/break-requests')).body.breakPolicy;
    assert.equal(policy.startsUsed, 1);
    assert.equal(policy.remainingSeconds, 1200);
    assert.equal(policy.regularAvailable, true);
    // After logout, events captured before the logout still arrive.
    const before = new Date(t.clock.now - 1000).toISOString();
    await t.device(s.token, 'POST', '/api/session/end', { reason: 'manual' });
    assert.equal((await t.event(s.token, 'page_closed', { occurredAt: before })).status, 200);
    t.advance(60000);
    assert.equal((await t.event(s.token, 'heartbeat', { state: 'ready' })).body.error, 'invalid_employee_session');
  } finally { await t.close(); }
});

test('a new server without a main password: chosen once on first use', async () => {
  const t = await start({ config: { adminPasswordHash: undefined } });
  try {
    assert.equal((await t.call('GET', '/api/admin-access/setup')).body.needed, true);
    assert.equal((await t.call('POST', '/api/admin-access', { body: { action: 'login', password: 'anything-1' } })).status, 401);
    assert.equal((await t.call('POST', '/api/admin-access', { body: { action: 'setup', password: 'short', confirmation: 'short' } })).status, 400);
    const r = await t.call('POST', '/api/admin-access', { body: { action: 'setup', password: 'Main-pass-1', confirmation: 'Main-pass-1' } });
    assert.equal(r.status, 200);
    assert.equal((await t.call('GET', '/api/admin-access', { headers: { 'x-admin-password': r.body.token } })).body.identity.role, 'admin');
    assert.equal((await t.call('GET', '/api/admin-access/setup')).body.needed, false);
    assert.equal((await t.call('POST', '/api/admin-access', { body: { action: 'setup', password: 'Other-pass-1', confirmation: 'Other-pass-1' } })).status, 409);
    assert.equal((await t.call('POST', '/api/admin-access', { body: { action: 'login', password: 'Main-pass-1' } })).status, 200);
  } finally { await t.close(); }
});
