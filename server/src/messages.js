'use strict';
const { businessDay, dayWindow, validDate, iso } = require('./time');

const HOURS = [1, 4, 12, 24];

function setup(app) {
  const { db, fail } = app;

  app.route('GET', '/api/messages', ctx => {
    if (ctx.header('x-employee-session')) {
      const { session } = app.requireSession(ctx);
      const rows = db.prepare(`SELECT m.id, m.title, m.message, m.priority, m.created_at, m.expires_at, r.delivered_at
        FROM messages m JOIN message_recipients r ON r.message_id = m.id
        WHERE r.employee_id = ? AND r.acknowledged_at IS NULL AND m.expires_at > ? ORDER BY m.created_at`).all(session.employee_id, ctx.now);
      return { messages: rows.map(r => ({ id: r.id, title: r.title, message: r.message, priority: r.priority, created_at: iso(r.created_at), expires_at: iso(r.expires_at), delivered_at: iso(r.delivered_at) })) };
    }
    app.requireAdmin(ctx);
    const date = ctx.query.date || businessDay(ctx.now);
    if (!validDate(date)) fail(400, 'تاريخ غير صحيح');
    const w = dayWindow(date), employee = ctx.query.employee ? Number(ctx.query.employee) : null;
    const rows = db.prepare(`SELECT m.*, r.employee_id, r.delivered_at, r.acknowledged_at, e.name AS employee_name
      FROM messages m JOIN message_recipients r ON r.message_id = m.id LEFT JOIN employees e ON e.id = r.employee_id
      WHERE m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR r.employee_id = ?) ORDER BY m.created_at DESC LIMIT 1001`).all(w.start, w.end, employee, employee);
    return {
      truncated: rows.length > 1000,
      messages: rows.slice(0, 1000).map(r => ({ id: r.id, employee_id: r.employee_id, employee_name: r.employee_name || 'حساب محذوف', title: r.title, message: r.message,
        priority: r.priority, created_at: iso(r.created_at), delivered_at: iso(r.delivered_at), acknowledged_at: iso(r.acknowledged_at), expires_at: iso(r.expires_at) })),
    };
  });

  app.route('POST', '/api/messages', ctx => {
    const who = app.requireAdmin(ctx, 'write');
    const b = ctx.body, title = String(b.title || '').trim(), message = String(b.message || '').trim();
    if (!title || !message || title.length > 80 || message.length > 1000) fail(400, 'اكتب العنوان والرسالة');
    const id = String(b.id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) fail(400, 'invalid_request');
    const existing = db.prepare('SELECT COUNT(*) n FROM message_recipients WHERE message_id = ?').get(id);
    if (db.prepare('SELECT 1 FROM messages WHERE id = ?').get(id)) return { ok: true, duplicate: true, recipients: existing.n };
    const active = db.prepare('SELECT id FROM employees WHERE active = 1 AND deleted_at IS NULL').all().map(e => e.id);
    const recipients = b.recipients === 'all' ? active : Array.isArray(b.recipients) ? [...new Set(b.recipients.map(Number))].filter(x => active.includes(x)) : [];
    if (!recipients.length) fail(400, 'اختار المستلمين');
    const hours = HOURS.includes(Number(b.hours)) ? Number(b.hours) : 4;
    db.transaction(() => {
      db.prepare('INSERT INTO messages (id, title, message, priority, created_at, expires_at, created_by) VALUES (?,?,?,?,?,?,?)')
        .run(id, title, message, b.priority === 'urgent' ? 'urgent' : 'normal', ctx.now, ctx.now + hours * 3600000, who.name);
      const add = db.prepare('INSERT INTO message_recipients (message_id, employee_id) VALUES (?,?)');
      for (const e of recipients) add.run(id, e);
    })();
    app.audit('message_sent', null, { actor: who.name, title, recipients: recipients.length });
    return { ok: true, recipients: recipients.length };
  });

  app.route('PATCH', '/api/messages', ctx => {
    const { session } = app.requireSession(ctx);
    const column = ctx.body.action === 'acknowledged' ? 'acknowledged_at' : ctx.body.action === 'delivered' ? 'delivered_at' : null;
    if (!column) fail(400, 'invalid_action');
    const r = db.prepare('SELECT * FROM message_recipients WHERE message_id = ? AND employee_id = ?').get(String(ctx.body.id), session.employee_id);
    if (!r) fail(404, 'not_found');
    db.prepare(`UPDATE message_recipients SET ${column} = COALESCE(${column}, ?)${column === 'acknowledged_at' ? ', delivered_at = COALESCE(delivered_at, ?)' : ''} WHERE message_id = ? AND employee_id = ?`)
      .run(...(column === 'acknowledged_at' ? [ctx.now, ctx.now] : [ctx.now]), r.message_id, r.employee_id);
    return { ok: true };
  });
}

module.exports = { setup };
