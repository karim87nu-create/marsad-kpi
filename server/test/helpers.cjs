'use strict';
const http = require('node:http');
const { buildApp, nodeHandler } = require('../src/index.js');
const { hashPassword } = require('../src/security.js');
const { cairoToUtc } = require('../src/time.js');

const DEVICE = '7000865f1220458f86506b41a97cab7d';

async function start({ at = cairoToUtc(2026, 10, 22, 12, 0, 0), config = {} } = {}) {
  const clock = { now: at };
  const app = await buildApp({ databasePath: ':memory:', secret: 'test-secret', adminPasswordHash: await hashPassword('master-pass'),
    deviceTokens: [DEVICE], allowedOrigins: ['https://karim87nu-create.github.io'], telegramTimer: false, ...config }, { now: () => clock.now });
  const server = http.createServer(nodeHandler(app));
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(method, path, { body, headers = {}, raw } = {}) {
    const r = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, body: json, headers: r.headers };
  }
  const t = { app, clock, call, base, close: () => new Promise(r => server.close(r)), advance: ms => { clock.now += ms; } };
  t.login = async (password = 'master-pass') => (await call('POST', '/api/admin-access', { body: { action: 'login', password } })).body.token;
  t.admin = async () => { const token = await t.login(); return (method, path, body, extra = {}) => call(method, path, { body, headers: { 'x-admin-password': token }, ...extra }); };
  t.employee = async (admin, { name = 'Ahmed', code = 'E1', pin = '1234' } = {}) => {
    await admin('POST', '/api/employees', { name, employeeCode: code, pin, pinConfirmation: pin });
    return (await admin('GET', '/api/employees')).body.employees.find(e => e.employeeCode === code);
  };
  t.session = async (pin = '1234', extension = '') => {
    const r = await call('POST', '/api/session/start', { body: { pin, extension }, headers: { 'x-device-token': DEVICE } });
    return { ...r.body, status: r.status };
  };
  // Mirrors the extension's event envelope.
  t.event = (token, type, extra = {}) => call('POST', '/api/events', { headers: { 'x-device-token': DEVICE, 'x-employee-session': token }, body: {
    eventType: type, eventKey: extra.eventKey || '101:' + type + ':' + clock.now + ':' + Math.random(), extension: '101',
    occurredAt: new Date(clock.now).toISOString(), clientVersion: '2.5.34', payload: { eventClock: { method: 'server_date_monotonic', uncertaintyMs: 1200 } }, ...extra } });
  // The extension re-reports its state every 30 seconds (transport_check).
  t.tick = async (token, ms, state) => {
    for (let left = ms; left > 0; left -= 30000) {
      t.advance(Math.min(30000, left));
      await t.event(token, 'heartbeat', { state, payload: { observationKind: 'transport_check', eventClock: { method: 'server_date_monotonic' } } });
    }
  };
  t.device = (token, method, path, body) => call(method, path, { body, headers: { 'x-device-token': DEVICE, 'x-employee-session': token } });
  return t;
}

module.exports = { start, DEVICE };
