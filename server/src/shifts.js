'use strict';

function setup(app) {
  const { db, fail } = app;
  app.route('POST', '/api/shifts', ctx => {
    const who = app.requireAdmin(ctx, 'write');
    const b = ctx.body, note = String(b.note || '').trim();
    if (!['include', 'exclude'].includes(b.action) || !note || note.length > 500) fail(400, 'اكتب السبب واختار الإجراء');
    const requestId = String(b.requestId || '');
    if (requestId && db.prepare('SELECT 1 FROM shift_decisions WHERE request_id = ?').get(requestId)) return { ok: true, duplicate: true };
    const s = db.prepare('SELECT * FROM employee_sessions WHERE id = ? AND employee_id = ?').get(Number(b.sessionId), Number(b.employeeId));
    if (!s || !s.revoked_at) fail(404, 'الجلسة غير موجودة أو ما زالت مفتوحة');
    db.prepare('INSERT INTO shift_decisions (request_id, employee_id, session_id, action, note, decided_at, decided_by) VALUES (?,?,?,?,?,?,?)')
      .run(requestId || null, s.employee_id, s.id, b.action, note, ctx.now, who.name);
    app.audit('shift_changed', s.employee_id, { actor: who.name, sessionId: s.id, status: b.action, note });
    return { ok: true };
  });
}

module.exports = { setup };
