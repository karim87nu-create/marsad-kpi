'use strict';
const { RULES } = require('./time');

const SESSION_MS = 18 * 3600000;
const CLOSE_GRACE_MS = 5000;
// Closure reasons use the old server's vocabulary (app/api/session/end, app/api/events) so the old logic reads them the same way.
const CLIENT_REASONS = ['arabicss_logout', 'arabicss_login_page', 'extension_changed', 'extension_restarted', 'tab_closed', 'browser_restarted'];
const CLIENT_CLOSE = new Set([...CLIENT_REASONS, 'explicit_logout', 'session_logout', 'session_rejected']);
const EVENT_TYPE = /^[a-z_]{2,40}$/;
const DIGITS = /^\d{1,10}$/;
const COLUMNS = new Set(['eventType', 'eventKey', 'extension', 'occurredAt', 'durationSeconds', 'state', 'callId', 'phone', 'queue', 'callType', 'clientVersion', 'payload', '_sessionToken', 'sessionToken']);

function setup(app) {
  const { db, fail } = app;

  const checkDevice = ctx => {
    const token = ctx.header('x-device-token');
    if (!token || !app.config.deviceTokens.includes(token)) fail(403, 'invalid_device');
    return token;
  };

  // allowRevoked: return closed sessions too (late events, idempotent logout)
  app.requireSession = (ctx, { allowRevoked = false } = {}) => {
    const device = checkDevice(ctx);
    const claims = app.signer.verify(ctx.header('x-employee-session'));
    if (!claims || !Number.isInteger(claims.sid)) fail(401, 'invalid_employee_session');
    const s = db.prepare('SELECT * FROM employee_sessions WHERE id = ?').get(claims.sid);
    if (!s || s.employee_id !== claims.eid) fail(401, 'invalid_employee_session');
    const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(s.employee_id);
    if (!e || e.deleted_at || !e.active) fail(403, 'employee_inactive');
    const closed = !!s.revoked_at || s.expires_at <= ctx.now;
    if (closed && !allowRevoked) fail(401, 'invalid_employee_session');
    return { session: s, employee: e, device, closed };
  };

  function closeSession(id, reason, now) {
    db.prepare('UPDATE employee_sessions SET revoked_at = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL').run(now, String(reason || 'explicit_logout').slice(0, 60), id);
  }
  app.closeSession = closeSession;

  app.route('POST', '/api/session/start', ctx => {
    const device = checkDevice(ctx);
    const pin = ctx.body.pin, extension = String(ctx.body.extension ?? '');
    if (typeof pin !== 'string' || !/^\d{1,32}$/.test(pin) || (extension && !DIGITS.test(extension))) fail(400, 'invalid_fields');
    const key = ctx.ip + '|' + device;
    if (app.limiters.employeeLogin.blocked(key, ctx.now)) fail(429, 'rate_limited');
    const e = app.employeeByPin(pin);
    if (!e || !e.active) { app.limiters.employeeLogin.fail(key, ctx.now); fail(401, 'invalid_password'); }
    app.limiters.employeeLogin.reset(key);
    const fresh = s => ctx.now - s.last_seen < RULES.presenceStaleMs;
    const open = db.prepare('SELECT * FROM employee_sessions WHERE revoked_at IS NULL AND expires_at > ?').all(ctx.now);
    const mine = open.filter(s => s.employee_id === e.id);
    // The same person working on another extension right now blocks a second login.
    if (mine.some(s => fresh(s) && s.extension && extension && s.extension !== extension)) fail(409, 'session_active');
    const holder = extension && open.find(s => s.employee_id !== e.id && s.extension === extension && fresh(s));
    if (holder) fail(409, 'extension_in_use');
    const result = db.transaction(() => {
      // Stale or expired sessions close as the old server did; a still-live one is replaced by the new login.
      for (const s of mine) closeSession(s.id, fresh(s) ? 'work_resumed' : 'expired_or_disconnected', ctx.now);
      if (extension) for (const s of open.filter(s => s.employee_id !== e.id && s.extension === extension)) closeSession(s.id, 'expired_or_disconnected', ctx.now);
      db.prepare("UPDATE employee_sessions SET revoked_at = ?, revoke_reason = 'expired_or_disconnected' WHERE revoked_at IS NULL AND expires_at <= ?").run(ctx.now, ctx.now);
      const r = db.prepare('INSERT INTO employee_sessions (employee_id, device, extension, issued_at, bound_at, last_seen, expires_at) VALUES (?,?,?,?,?,?,?)')
        .run(e.id, device, extension, ctx.now, extension ? ctx.now : null, ctx.now, ctx.now + SESSION_MS);
      return Number(r.lastInsertRowid);
    })();
    const token = app.signer.sign({ sid: result, eid: e.id, iat: ctx.now, exp: ctx.now + SESSION_MS });
    return { employee: { id: e.id, name: e.name, employeeCode: e.employee_code }, token };
  });

  app.route('POST', '/api/session/end', ctx => {
    const { session, closed } = app.requireSession(ctx, { allowRevoked: true });
    const reason = CLIENT_REASONS.includes(ctx.body.reason) ? ctx.body.reason : 'explicit_logout';
    if (!closed) db.transaction(() => {
      // Same logout record the old /api/session/end wrote when the extension's own logout event did not arrive first.
      db.prepare(`INSERT OR IGNORE INTO events (session_id, employee_id, extension, event_type, event_key, occurred_at, received_at, state, client_version, extra)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(session.id, session.employee_id, session.extension || 'unbound', 'session_logout', session.id + ':logout:end', ctx.now, ctx.now, reason,
        session.client_version || '', JSON.stringify({ closureTimeKnown: reason !== 'browser_restarted' }));
      closeSession(session.id, reason, ctx.now);
    })();
    return { ok: true };
  });

  const openBreak = sessionId => {
    const last = db.prepare("SELECT event_type FROM events WHERE session_id = ? AND event_type IN ('break_start','break_observed','break_end','break_end_unknown') ORDER BY occurred_at DESC, id DESC LIMIT 1").get(sessionId);
    return !!last && ['break_start', 'break_observed'].includes(last.event_type);
  };

  app.route('POST', '/api/events', ctx => {
    const { session, employee, closed } = app.requireSession(ctx, { allowRevoked: true });
    const ev = ctx.body;
    const type = String(ev.eventType || ''), key = String(ev.eventKey || ''), extension = String(ev.extension || '');
    if (!EVENT_TYPE.test(type) || !key || key.length > 300 || !DIGITS.test(extension)) fail(400, 'invalid_event');
    if (ev.payload?.eventClock?.method === 'unsynchronized') fail(400, 'clock_unsynchronized');
    const occurred = Date.parse(ev.occurredAt);
    if (!Number.isFinite(occurred) || occurred > ctx.now + 30000 || occurred < session.issued_at - 60000) fail(400, 'invalid_time');
    // A closed session still accepts events that were captured before it closed (offline queue).
    // Closures by the admin (password change, disable, handover) cut off immediately.
    if (closed) {
      const closedAt = Math.min(session.revoked_at ?? Infinity, session.expires_at);
      const grace = CLIENT_CLOSE.has(session.revoke_reason) ? CLOSE_GRACE_MS : 0;
      if (grace ? occurred > closedAt + grace : occurred >= closedAt) fail(401, 'invalid_employee_session');
    }
    if (session.extension && session.extension !== extension) fail(403, 'extension_mismatch');
    const payload = ev.payload === undefined ? null : JSON.stringify(ev.payload);
    const rest = Object.fromEntries(Object.entries(ev).filter(([k]) => !COLUMNS.has(k)));
    const extra = Object.keys(rest).length ? JSON.stringify(rest) : null;
    if ((payload?.length || 0) + (extra?.length || 0) > 32000) fail(413, 'payload_too_large');

    const existing = db.prepare('SELECT id FROM events WHERE session_id = ? AND event_key = ?').get(session.id, key);
    if (existing) return { ok: true, duplicate: true, id: existing.id };

    return db.transaction(() => {
      if (type === 'break_start') {
        const p = db.prepare('SELECT * FROM break_permissions WHERE id = ?').get(String(ev.permissionId || ''));
        if (!p || p.session_id !== session.id || p.used_at || p.expires_at < occurred - 5000 || p.extension !== extension)
          fail(409, 'break_authorization_rejected');
        db.prepare('UPDATE break_permissions SET used_at = ? WHERE id = ?').run(occurred, p.id);
        if (p.request_id) db.prepare("UPDATE break_requests SET status = 'starting' WHERE id = ?").run(p.request_id);
      }
      if (type === 'break_end' && !openBreak(session.id)) fail(409, 'break_start_missing');
      const r = db.prepare(`INSERT INTO events (session_id, employee_id, extension, event_type, event_key, occurred_at, received_at,
        duration_seconds, state, call_id, phone, queue, call_type, client_version, payload, extra) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        session.id, employee.id, extension, type, key, occurred, ctx.now,
        Number.isFinite(Number(ev.durationSeconds)) ? Math.max(0, Math.round(Number(ev.durationSeconds))) : null,
        ev.state == null ? null : String(ev.state).slice(0, 40),
        ev.callId == null ? null : String(ev.callId).slice(0, 80),
        ev.phone == null ? null : String(ev.phone).slice(0, 40),
        ev.queue == null ? null : String(ev.queue).slice(0, 20),
        ev.callType == null ? null : String(ev.callType).slice(0, 20),
        String(ev.clientVersion || '').slice(0, 20), payload, extra);
      // A logout event ends the session at its own time (old app/api/events closureReason).
      if (!closed && (type === 'session_logout' || type === 'arabicss_logout'))
        closeSession(session.id, CLIENT_REASONS.includes(String(ev.state)) ? String(ev.state) : type, Math.min(occurred, ctx.now));
      else if (!closed) {
        const working = ['ready', 'on_call'].includes(ev.state) || ['agentlinked', 'call_observed'].includes(type);
        db.prepare(`UPDATE employee_sessions SET last_seen = MAX(last_seen, ?), client_version = ?,
          extension = CASE WHEN extension = '' THEN ? ELSE extension END,
          bound_at = COALESCE(bound_at, ?),
          work_started_at = CASE WHEN work_started_at IS NULL AND ? THEN ? ELSE work_started_at END
          WHERE id = ?`).run(Math.min(ctx.now, occurred + 5000), String(ev.clientVersion || ''), extension, occurred, working ? 1 : 0, occurred, session.id);
      }
      return { ok: true, id: Number(r.lastInsertRowid) };
    })();
  });
}

module.exports = { setup, SESSION_MS };
