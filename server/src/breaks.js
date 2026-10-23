import { randomUUID } from './security.js';
import { businessDay, dayWindow, iso } from './time.js';

const PERMISSION_MS = 60000;
const PENDING_MS = 30 * 60000;
const APPROVED_MS = 15 * 60000;
const MINUTES = [15, 30, 45, 60];

function setup(app) {
  const { db, fail } = app;

  const expireRequests = now => db.batch([
    db.prepare("UPDATE break_requests SET status = 'expired' WHERE status = 'pending' AND created_at < ?").bind(now - PENDING_MS),
    db.prepare("UPDATE break_requests SET status = 'expired' WHERE status = 'approved' AND decided_at < ?").bind(now - APPROVED_MS),
    db.prepare(`UPDATE break_requests SET status = 'cancelled' WHERE status IN ('pending','approved') AND session_id IN
      (SELECT id FROM employee_sessions WHERE revoked_at IS NOT NULL OR expires_at <= ?)`).bind(now),
  ]);

  const policy = (employeeId, now) => app.breakPolicy(employeeId, now);   // engine.js

  const shapeForEmployee = r => ({ id: r.id, status: r.status, reasonId: r.reason_id, reason: r.reason, requestKind: r.request_kind, requestedMinutes: r.requested_minutes, createdAt: iso(r.created_at), decidedAt: iso(r.decided_at) });

  async function issuePermission(session, now, allowed, grace, requestId = null) {
    const id = randomUUID();
    await db.prepare('INSERT INTO break_permissions (id, session_id, employee_id, extension, request_id, allowed_seconds, grace_seconds, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, session.id, session.employee_id, session.extension, requestId, allowed, grace, now, now + PERMISSION_MS);
    return { permissionId: id, expiresAt: now + PERMISSION_MS, allowedSeconds: allowed, graceSeconds: grace };
  }

  async function requireReady(session, now) {
    if (!session.extension) fail(409, 'extension_required');
    if (!await app.sessionReady(session, now)) fail(409, 'not_ready');
    if (await db.prepare('SELECT 1 FROM break_permissions WHERE session_id = ? AND used_at IS NULL AND expires_at > ?').get(session.id, now)) fail(409, 'permission_pending');
  }

  app.route('GET', '/api/break-requests', async ctx => {
    await expireRequests(ctx.now);
    if (ctx.header('x-employee-session')) {
      const { session } = await app.requireSession(ctx);
      const w = dayWindow(businessDay(ctx.now));
      const requests = await db.prepare('SELECT * FROM break_requests WHERE employee_id = ? AND created_at >= ? ORDER BY created_at DESC').all(session.employee_id, w.start);
      return { breakPolicy: await policy(session.employee_id, ctx.now), requests: requests.map(shapeForEmployee) };
    }
    const who = await app.requireAdmin(ctx);
    const w = dayWindow(businessDay(ctx.now));
    const rows = await db.prepare(`SELECT r.*, e.name AS employee_name FROM break_requests r JOIN employees e ON e.id = r.employee_id
      WHERE r.created_at >= ? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`).all(w.start);
    return {
      canDecide: ['admin', 'supervisor'].includes(who.role),
      requests: rows.map(r => ({ id: r.id, employee: r.employee_name, extension: r.extension, reason: r.reason, requestKind: r.request_kind,
        requestedMinutes: r.requested_minutes, createdAt: iso(r.created_at), status: r.status, decidedBy: r.decided_by })),
    };
  });

  app.route('POST', '/api/break-requests', async ctx => {
    await expireRequests(ctx.now);
    const b = ctx.body;
    if (['approve', 'reject'].includes(b.action)) {
      const who = await app.requireAdmin(ctx, 'write');
      const r = await db.prepare('SELECT * FROM break_requests WHERE id = ?').get(String(b.id));
      if (!r) fail(404, 'الطلب غير موجود');
      if (r.status !== 'pending') fail(409, 'الطلب اتغير؛ حدّث القائمة');
      const u = await db.prepare("UPDATE break_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'").run(b.action === 'approve' ? 'approved' : 'rejected', ctx.now, who.name, r.id);
      if (!u.changes) fail(409, 'الطلب اتغير؛ حدّث القائمة');
      await app.audit('break_request_decided', r.employee_id, { actor: who.name, status: b.action, requestId: r.id });
      return { ok: true };
    }
    const { session } = await app.requireSession(ctx);
    const p = await policy(session.employee_id, ctx.now);
    if (b.action === 'regular_start') {
      await requireReady(session, ctx.now);
      if (!p.regularAvailable) fail(409, 'approval_required');
      const grace = p.startsUsed === 0 ? p.graceSeconds : 0;
      return { ...await issuePermission(session, ctx.now, p.nextAllowedSeconds, grace), breakPolicy: p };
    }
    if (b.action === 'request') {
      if (p.regularAvailable) fail(409, 'regular_break_available');
      const id = String(b.id || '');
      if (!/^break-request:[0-9a-f-]{36}$/.test(id)) fail(400, 'invalid_request');
      const existing = await db.prepare('SELECT * FROM break_requests WHERE id = ?').get(id);
      if (existing) return { request: shapeForEmployee(existing), breakPolicy: p };
      if (await db.prepare("SELECT 1 FROM break_requests WHERE employee_id = ? AND status IN ('pending','approved','starting') AND created_at > ?").get(session.employee_id, ctx.now - PENDING_MS)) fail(409, 'permission_pending');
      if (!session.extension) fail(409, 'extension_required');
      const minutes = MINUTES.includes(Number(b.requestedMinutes)) ? Number(b.requestedMinutes) : 15;
      await db.prepare('INSERT OR IGNORE INTO break_requests (id, employee_id, session_id, extension, reason_id, reason, request_kind, requested_minutes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, session.employee_id, session.id, session.extension, String(b.reasonId || '2').slice(0, 10), String(b.reason || 'بريك إضافي').slice(0, 100), 'additional', minutes, 'pending', ctx.now);
      return { request: shapeForEmployee(await db.prepare('SELECT * FROM break_requests WHERE id = ?').get(id)), breakPolicy: p };
    }
    if (b.action === 'start') {
      const r = await db.prepare('SELECT * FROM break_requests WHERE id = ?').get(String(b.id));
      if (!r || r.employee_id !== session.employee_id || r.status !== 'approved') fail(409, 'request_changed');
      await requireReady(session, ctx.now);
      const permission = await issuePermission(session, ctx.now, r.requested_minutes * 60, 0, r.id);
      await db.prepare('UPDATE break_requests SET permission_id = ? WHERE id = ?').run(permission.permissionId, r.id);
      return { ...permission, breakPolicy: p };
    }
    fail(400, 'invalid_action');
  });
}

export { setup };
