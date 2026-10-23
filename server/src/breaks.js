'use strict';
const crypto = require('node:crypto');
const { businessDay, dayWindow, iso } = require('./time');
const { analyzeSession } = require('./state');
const { breakPolicySnapshot } = require('./legacy-logic/break-policy');
const { dashboardEvent } = require('./old-shape');

const PERMISSION_MS = 60000;
const PENDING_MS = 30 * 60000;
const APPROVED_MS = 15 * 60000;
const MINUTES = [15, 30, 45, 60];

function setup(app) {
  const { db, fail } = app;
  const eventsFor = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY occurred_at, id');

  function expireRequests(now) {
    db.prepare("UPDATE break_requests SET status = 'expired' WHERE status = 'pending' AND created_at < ?").run(now - PENDING_MS);
    db.prepare("UPDATE break_requests SET status = 'expired' WHERE status = 'approved' AND decided_at < ?").run(now - APPROVED_MS);
    db.prepare(`UPDATE break_requests SET status = 'cancelled' WHERE status IN ('pending','approved') AND session_id IN
      (SELECT id FROM employee_sessions WHERE revoked_at IS NOT NULL OR expires_at <= ?)`).run(now);
  }

  // Regular policy: 2 breaks, 30 minutes in total. The first may run 15 + 5 minutes; the second gets whatever
  // is left of the 30 minutes (Karim's rule — a 10-minute first break leaves 20 for the second).
  // Counting comes from the old server's lib/break-policy.ts: a break seen without a confirmed start counts
  // at least 15 minutes, approved extra breaks do not use the allowance, no regular break after 03:00.
  async function policy(employeeId, now) {
    const w = dayWindow(businessDay(now)), end = Math.min(now, w.operatingEnd), names = new Map();
    const rows = db.prepare(`SELECT * FROM events WHERE employee_id = ? AND event_type IN ('break_start','break_end','break_observed','break_end_unknown')
      AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at, id`).all(employeeId, w.start, end)
      .map(e => { const x = dashboardEvent(e, names); return { eventType: x.eventType, extension: x.extension, occurredAt: x.occurredAt, durationSeconds: x.durationSeconds, payload: x.payload }; });
    const rowsDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) };
    const p = await breakPolicySnapshot(rowsDb, employeeId, now);
    if (p.startsUsed === 1 && p.remainingSeconds > 0) {
      const open = now < w.operatingEnd;
      return { ...p, secondRemainingSeconds: p.remainingSeconds, secondBlocked: false, nextAllowedSeconds: p.remainingSeconds,
        regularAvailable: open, requiresApproval: !open };
    }
    return p;
  }
  app.breakPolicy = policy;

  const shapeForEmployee = r => ({ id: r.id, status: r.status, reasonId: r.reason_id, reason: r.reason, requestKind: r.request_kind, requestedMinutes: r.requested_minutes, createdAt: iso(r.created_at), decidedAt: iso(r.decided_at) });

  function issuePermission(session, now, allowed, grace, requestId = null) {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO break_permissions (id, session_id, employee_id, extension, request_id, allowed_seconds, grace_seconds, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, session.id, session.employee_id, session.extension, requestId, allowed, grace, now, now + PERMISSION_MS);
    return { permissionId: id, expiresAt: now + PERMISSION_MS, allowedSeconds: allowed, graceSeconds: grace };
  }

  function requireReady(session, now) {
    if (!session.extension) fail(409, 'extension_required');
    const a = analyzeSession(session, eventsFor.all(session.id), now);
    if (a.state !== 'ready' || now - a.lastEvidence > 15000) fail(409, 'not_ready');
    if (db.prepare('SELECT 1 FROM break_permissions WHERE session_id = ? AND used_at IS NULL AND expires_at > ?').get(session.id, now)) fail(409, 'permission_pending');
  }

  app.route('GET', '/api/break-requests', async ctx => {
    expireRequests(ctx.now);
    if (ctx.header('x-employee-session')) {
      const { session } = app.requireSession(ctx);
      const w = dayWindow(businessDay(ctx.now));
      const requests = db.prepare('SELECT * FROM break_requests WHERE employee_id = ? AND created_at >= ? ORDER BY created_at DESC').all(session.employee_id, w.start);
      return { breakPolicy: await policy(session.employee_id, ctx.now), requests: requests.map(shapeForEmployee) };
    }
    const who = app.requireAdmin(ctx);
    const w = dayWindow(businessDay(ctx.now));
    const rows = db.prepare(`SELECT r.*, e.name AS employee_name FROM break_requests r JOIN employees e ON e.id = r.employee_id
      WHERE r.created_at >= ? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`).all(w.start);
    return {
      canDecide: ['admin', 'supervisor'].includes(who.role),
      requests: rows.map(r => ({ id: r.id, employee: r.employee_name, extension: r.extension, reason: r.reason, requestKind: r.request_kind,
        requestedMinutes: r.requested_minutes, createdAt: iso(r.created_at), status: r.status, decidedBy: r.decided_by })),
    };
  });

  app.route('POST', '/api/break-requests', async ctx => {
    expireRequests(ctx.now);
    const b = ctx.body;
    if (['approve', 'reject'].includes(b.action)) {
      const who = app.requireAdmin(ctx, 'write');
      const r = db.prepare('SELECT * FROM break_requests WHERE id = ?').get(String(b.id));
      if (!r) fail(404, 'الطلب غير موجود');
      if (r.status !== 'pending') fail(409, 'الطلب اتغير؛ حدّث القائمة');
      db.prepare('UPDATE break_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(b.action === 'approve' ? 'approved' : 'rejected', ctx.now, who.name, r.id);
      app.audit('break_request_decided', r.employee_id, { actor: who.name, status: b.action, requestId: r.id });
      return { ok: true };
    }
    const { session } = app.requireSession(ctx);
    const p = await policy(session.employee_id, ctx.now);
    if (b.action === 'regular_start') {
      requireReady(session, ctx.now);
      if (!p.regularAvailable) fail(409, 'approval_required');
      const grace = p.startsUsed === 0 ? p.graceSeconds : 0;
      return { ...issuePermission(session, ctx.now, p.nextAllowedSeconds, grace), breakPolicy: p };
    }
    if (b.action === 'request') {
      if (p.regularAvailable) fail(409, 'regular_break_available');
      const id = String(b.id || '');
      if (!/^break-request:[0-9a-f-]{36}$/.test(id)) fail(400, 'invalid_request');
      const existing = db.prepare('SELECT * FROM break_requests WHERE id = ?').get(id);
      if (existing) return { request: shapeForEmployee(existing), breakPolicy: p };
      if (db.prepare("SELECT 1 FROM break_requests WHERE employee_id = ? AND status IN ('pending','approved','starting') AND created_at > ?").get(session.employee_id, ctx.now - PENDING_MS)) fail(409, 'permission_pending');
      if (!session.extension) fail(409, 'extension_required');
      const minutes = MINUTES.includes(Number(b.requestedMinutes)) ? Number(b.requestedMinutes) : 15;
      db.prepare('INSERT INTO break_requests (id, employee_id, session_id, extension, reason_id, reason, request_kind, requested_minutes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, session.employee_id, session.id, session.extension, String(b.reasonId || '2').slice(0, 10), String(b.reason || 'بريك إضافي').slice(0, 100), 'additional', minutes, 'pending', ctx.now);
      return { request: shapeForEmployee(db.prepare('SELECT * FROM break_requests WHERE id = ?').get(id)), breakPolicy: p };
    }
    if (b.action === 'start') {
      const r = db.prepare('SELECT * FROM break_requests WHERE id = ?').get(String(b.id));
      if (!r || r.employee_id !== session.employee_id || r.status !== 'approved') fail(409, 'request_changed');
      requireReady(session, ctx.now);
      const permission = issuePermission(session, ctx.now, r.requested_minutes * 60, 0, r.id);
      db.prepare('UPDATE break_requests SET permission_id = ? WHERE id = ?').run(permission.permissionId, r.id);
      return { ...permission, breakPolicy: p };
    }
    fail(400, 'invalid_action');
  });
}

module.exports = { setup };
