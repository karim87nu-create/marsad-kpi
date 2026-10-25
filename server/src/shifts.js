import { RULES } from './time.js';
function setup(app) {
  const { db, fail } = app;
  app.route('POST', '/api/shifts', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const b = ctx.body, note = String(b.note || '').trim();
    if (!['include', 'exclude'].includes(b.action) || !note || note.length > 500) fail(400, 'اكتب السبب واختار الإجراء');
    const requestId = String(b.requestId || '');
    if (requestId && await db.prepare('SELECT 1 FROM shift_decisions WHERE request_id = ?').get(requestId)) return { ok: true, duplicate: true };
    const s = await db.prepare('SELECT * FROM employee_sessions WHERE id = ? AND employee_id = ?').get(Number(b.sessionId), Number(b.employeeId));
    if (!s) fail(404, 'الجلسة غير موجودة');
    const staleBefore = ctx.now - RULES.presenceStaleMs;
    if (s.revoked_at == null && s.expires_at > ctx.now && s.last_seen > staleBefore)
      fail(409, 'الجلسة لسه بتبعت بيانات؛ حدّث الصفحة قبل تحديد نهاية الشيفت');
    const writes = [];
    if (b.action === 'exclude' && s.revoked_at == null) {
      // Close only an inactive session, at its existing evidence cutoff, never at the admin click time.
      const evidence = await db.prepare(`SELECT MAX(occurred_at) at FROM events WHERE session_id = ? AND occurred_at <= ? AND
        ((event_type = 'heartbeat' AND state IN ('ready','on_call','break','post_call')) OR
         event_type IN ('break_start','break_observed','break_end','break_end_unknown','agentlinked','agentunlinked','call_observed','call_observed_end'))`).get(s.id, ctx.now);
      const closedAt = Math.max(s.issued_at, Math.min(ctx.now, s.expires_at, (evidence?.at ?? s.last_seen ?? s.issued_at) + RULES.presenceStaleMs));
      writes.push(db.prepare(`UPDATE employee_sessions SET revoked_at = ?, revoke_reason = 'manual' WHERE id = ? AND revoked_at IS NULL
        AND last_seen = ? AND (expires_at <= ? OR last_seen <= ?)`).bind(closedAt, s.id, s.last_seen, ctx.now, staleBefore));
    }
    // Check liveness again inside the transaction: a heartbeat arriving while the dialog was open wins.
    writes.push(db.prepare(`INSERT OR IGNORE INTO shift_decisions (request_id, employee_id, session_id, action, note, decided_at, decided_by)
      SELECT ?,?,?,?,?,?,? FROM employee_sessions WHERE id = ? AND
        (revoked_at IS NOT NULL OR expires_at <= ? OR last_seen <= ?) AND (? != 'exclude' OR revoked_at IS NOT NULL)`)
      .bind(requestId || null, s.employee_id, s.id, b.action, note, ctx.now, who.name, s.id, ctx.now, staleBefore, b.action));
    const result = await db.batch(writes);
    if (!result.at(-1).changes) {
      if (requestId && await db.prepare('SELECT 1 FROM shift_decisions WHERE request_id = ?').get(requestId)) return { ok: true, duplicate: true };
      fail(409, 'الجلسة رجعت تبعت بيانات؛ حدّث الصفحة وأعد مراجعتها');
    }
    await app.audit('shift_changed', s.employee_id, { actor: who.name, sessionId: s.id, status: b.action, note });
    return { ok: true };
  });

  // Answered Arabicss calls nobody was signed in for: the supervisor says who took them (one call or a whole stretch).
  app.route('POST', '/api/call-assignments', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const b = ctx.body, keys = Array.isArray(b.keys) ? [...new Set(b.keys.map(String))] : [];
    if (!keys.length || keys.length > 300 || keys.some(k => !/^\d{4}-\d{2}-\d{2}\|/.test(k) || k.length > 120)) fail(400, 'المكالمات غير صحيحة');
    if (b.action === 'remove') {
      // The removed assignments are kept in the change log (who had each call), so an undo is always possible.
      const before = [];
      for (let i = 0; i < keys.length; i += 90) { const p = keys.slice(i, i + 90); before.push(...await db.prepare('SELECT call_key, employee_id FROM call_assignments WHERE call_key IN (' + p.map(() => '?').join(',') + ')').all(...p)); }
      const parts = []; for (let i = 0; i < keys.length; i += 90) parts.push(keys.slice(i, i + 90));
      await db.batch(parts.map(p => db.prepare('DELETE FROM call_assignments WHERE call_key IN (' + p.map(() => '?').join(',') + ')').bind(...p)));
      await app.audit('calls_unassigned', null, { actor: who.name, count: keys.length, removed: before.map(r => [r.call_key, r.employee_id]) });
      return { ok: true };
    }
    if (b.action !== 'assign') fail(400, 'invalid_action');
    const e = await db.prepare('SELECT id, name FROM employees WHERE id = ? AND deleted_at IS NULL').get(Number(b.employeeId));
    if (!e) fail(400, 'اختار الموظف');
    const note = String(b.note || '').trim().slice(0, 300) || null;
    // 19 calls per statement (5 values each, under D1's 100 bound values).
    const parts = []; for (let i = 0; i < keys.length; i += 19) parts.push(keys.slice(i, i + 19));
    await db.batch(parts.map(p => db.prepare('INSERT INTO call_assignments (call_key, employee_id, decided_at, decided_by, note) VALUES ' + p.map(() => '(?,?,?,?,?)').join(',')
      + ' ON CONFLICT(call_key) DO UPDATE SET employee_id = excluded.employee_id, decided_at = excluded.decided_at, decided_by = excluded.decided_by, note = excluded.note').bind(...p.flatMap(k => [k, e.id, ctx.now, who.name, note]))));
    await app.audit('calls_assigned', e.id, { actor: who.name, count: keys.length, note });
    return { ok: true, count: keys.length };
  });
}

export { setup };
