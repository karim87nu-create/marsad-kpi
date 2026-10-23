// Follow-up items, saved day reports, and the system status (connector, devices, admin log).
import { randomUUID } from './security.js';
import { iso, validDate as isDate } from './time.js';

const STATUSES = ['new', 'in_progress', 'resolved', 'reviewed'];
const validDate = d => typeof d === 'string' && isDate(d);

function setup(app) {
  const { db, fail } = app;

  // ---- المتابعة ----
  app.route('GET', '/api/reviews', async ctx => {
    await app.requireAdmin(ctx);
    const date = ctx.query.date;
    const open = ctx.query.open === '1';
    const rows = open
      ? await db.prepare("SELECT * FROM reviews WHERE status IN ('new','in_progress') ORDER BY updated_at DESC LIMIT 300").all()
      : await db.prepare('SELECT * FROM reviews WHERE date = ? ORDER BY updated_at DESC').all(validDate(date) ? date : '');
    return { reviews: rows.map(r => ({ id: r.id, date: r.date, employeeId: r.employee_id, title: r.title, owner: r.owner, status: r.status, note: r.note, updatedAt: iso(r.updated_at), updatedBy: r.updated_by })) };
  });
  app.route('POST', '/api/reviews', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const b = ctx.body || {};
    const title = String(b.title || '').trim(), note = String(b.note || '').trim(), owner = String(b.owner || '').trim();
    if (!STATUSES.includes(b.status)) fail(400, 'اختار الحالة');
    if (b.id) {
      const r = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(String(b.id));
      if (!r) fail(404, 'المتابعة غير موجودة');
      await db.prepare('UPDATE reviews SET status = ?, note = ?, owner = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(b.status, note.slice(0, 2000) || r.note, owner.slice(0, 100) || r.owner, ctx.now, who.name, r.id);
      await app.audit('review_updated', r.employee_id, { actor: who.name, title: r.title, status: b.status });
      return { ok: true, id: r.id };
    }
    if (!validDate(b.date)) fail(400, 'التاريخ غير صحيح');
    if (!title || title.length > 200) fail(400, 'اكتب الموضوع');
    const id = randomUUID(), employeeId = b.employeeId ? Number(b.employeeId) : null;
    await db.prepare('INSERT INTO reviews (id, date, reference, employee_id, title, owner, status, note, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, b.date, id, employeeId, title, owner.slice(0, 100) || null, b.status, note.slice(0, 2000) || null, ctx.now, who.name);
    await app.audit('review_added', employeeId, { actor: who.name, title });
    return { ok: true, id };
  });

  // ---- تقارير محفوظة: ملخص اليوم كما كان وقت الحفظ ----
  app.route('GET', '/api/saved-reports', async ctx => {
    await app.requireAdmin(ctx);
    const id = ctx.query.id;
    if (id) {
      const r = await db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(id);
      if (!r) fail(404, 'التقرير غير موجود');
      return { id: r.id, date: r.date, createdAt: iso(r.created_at), filters: JSON.parse(r.filters || '{}'), payload: JSON.parse(r.payload) };
    }
    const date = ctx.query.date;
    const rows = await db.prepare('SELECT id, date, created_at, filters FROM saved_reports WHERE date = ? ORDER BY created_at DESC').all(validDate(date) ? date : '');
    return { reports: rows.map(r => ({ id: r.id, date: r.date, createdAt: iso(r.created_at), filters: JSON.parse(r.filters || '{}') })) };
  });
  app.route('POST', '/api/saved-reports', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const date = ctx.body?.date;
    if (!validDate(date)) fail(400, 'التاريخ غير صحيح');
    const d = await app.heavy('day', date);
    const payload = { report: d.history.report, queues: d.history.queues, employees: d.employees, slots: d.slots, attribution: d.history.attribution };
    const id = randomUUID();
    await db.prepare('INSERT INTO saved_reports (id, date, created_at, filters, payload) VALUES (?,?,?,?,?)').run(id, date, ctx.now, JSON.stringify({ by: who.name }), JSON.stringify(payload));
    await app.audit('report_saved', null, { actor: who.name, date });
    return { ok: true, id };
  });

  // ---- حالة النظام ----
  app.route('GET', '/api/system', async ctx => {
    await app.requireAdmin(ctx);
    const now = ctx.now;
    const [history, live, collectors, devices, audit] = await Promise.all([
      db.prepare('SELECT date, imported_at, source, verified_total FROM history_reports ORDER BY imported_at DESC LIMIT 1').get(),
      db.prepare('SELECT observed_at, received_at FROM live_snapshots ORDER BY observed_at DESC LIMIT 1').get(),
      db.prepare('SELECT COUNT(*) n, MAX(created_at) last FROM collector_tokens WHERE revoked_at IS NULL AND refresh_expires_at > ?').get(now),
      db.prepare(`SELECT s.id, s.employee_id, e.name, s.extension, s.client_version, s.last_seen, s.issued_at, s.revoked_at FROM employee_sessions s LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.last_seen > ? AND s.device NOT LIKE 'legacy:%' ORDER BY s.last_seen DESC LIMIT 200`).all(now - 24 * 3600000),
      db.prepare('SELECT a.occurred_at, a.action, a.employee_id, a.details, e.name FROM audit a LEFT JOIN employees e ON e.id = a.employee_id ORDER BY a.id DESC LIMIT 300').all(),
    ]);
    return {
      serverNow: iso(now),
      collector: { linked: collectors.n, linkedAt: iso(collectors.last), lastHistory: history ? { date: history.date, at: iso(history.imported_at), verified: !!history.verified_total } : null, lastLive: live ? iso(live.observed_at) : null },
      devices: devices.map(d => ({ sessionId: d.id, employeeId: d.employee_id, name: d.name || 'حساب محذوف', extension: d.extension, version: d.client_version, lastSeen: iso(d.last_seen), startedAt: iso(d.issued_at), open: d.revoked_at == null })),
      audit: audit.map(a => { let x = {}; try { x = JSON.parse(a.details); } catch {} return { at: iso(a.occurred_at), action: a.action, employee: a.name || null, actor: x.actor || null, details: x }; }),
    };
  });
}

export { setup };
