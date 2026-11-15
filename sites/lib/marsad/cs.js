// خدمة العملاء (Karim 11-16: «صفحه تصدير لشيت خدمه العملاء ويبقي صفحه زي كده في التقرير ويتبني عليه الارقام»): the
// sheet the team fills by hand today — each comment, complaint or rating from Talabat, the website or a call, the branch,
// the customer, whether they were reached and what was done — and each branch's Talabat rating of the day next to the
// competitor's. Entered here; the reports and the Excel files count from it.
import { businessDay, validDate, iso } from './time.js';

export const PLATFORMS = ['طلبات', 'الموقع', 'الكول سنتر', 'وفرها'];
export const REACHED = ['تم التواصل', 'عدم الرد', 'مقفول', 'لا'];

function setup(app) {
  const { db, fail } = app;
  const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n) || null;
  const shape = r => ({ id: r.id, day: r.day, platform: r.platform, branch: r.branch, customer: r.customer, phone: r.phone, orderNo: r.order_no, rating: r.rating,
    comment: r.comment, complaint: r.complaint, reached: r.reached, action: r.action, by: r.by_name, at: iso(r.updated_at) });

  app.route('GET', '/api/cs', async ctx => {
    await app.requireAdmin(ctx);
    const to = validDate(String(ctx.query.to || '')) ? ctx.query.to : businessDay(ctx.now);
    const from = validDate(String(ctx.query.from || '')) && ctx.query.from <= to ? ctx.query.from : to;
    const rows = await db.prepare('SELECT * FROM cs_entries WHERE day BETWEEN ? AND ? ORDER BY day DESC, id DESC LIMIT 5000').all(from, to);
    const ratings = await db.prepare('SELECT * FROM cs_branch_day WHERE day BETWEEN ? AND ? ORDER BY day, branch').all(from, to);
    return { from, to, platforms: PLATFORMS, reached: REACHED, entries: rows.map(shape), ratings: ratings.map(r => ({ day: r.day, branch: r.branch, rating: r.rating, competitor: r.competitor, by: r.by_name })) };
  });

  const read = (b, now) => {
    const day = String(b.day || ''); if (!validDate(day) || day > businessDay(now)) fail(400, 'اختار اليوم');
    const platform = PLATFORMS.includes(b.platform) ? b.platform : fail(400, 'اختار المنصة');
    const rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
    if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) fail(400, 'التقييم من 1 لـ 5');
    const v = { day, platform, branch: clean(b.branch, 60), customer: clean(b.customer, 80), phone: clean(String(b.phone ?? '').replace(/[^\d+]/g, ''), 20), orderNo: clean(b.orderNo, 30), rating,
      comment: clean(b.comment, 1000), complaint: clean(b.complaint, 500), reached: b.reached && REACHED.includes(b.reached) ? b.reached : null, action: clean(b.action, 500) };
    if (!v.branch) fail(400, 'اختار الفرع');
    if (!v.comment && !v.complaint && v.rating == null) fail(400, 'اكتب التعليق أو الشكوى أو التقييم');
    return v;
  };
  app.route('POST', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), v = read(ctx.body || {}, ctx.now);
    const r = await db.prepare('INSERT INTO cs_entries (day, platform, branch, customer, phone, order_no, rating, comment, complaint, reached, action, by_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(v.day, v.platform, v.branch, v.customer, v.phone, v.orderNo, v.rating, v.comment, v.complaint, v.reached, v.action, who.name, ctx.now, ctx.now);
    return { ok: true, id: r.lastInsertRowid };
  });
  app.route('PUT', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), id = Number(ctx.body?.id), v = read(ctx.body || {}, ctx.now);
    const r = await db.prepare('UPDATE cs_entries SET day=?, platform=?, branch=?, customer=?, phone=?, order_no=?, rating=?, comment=?, complaint=?, reached=?, action=?, by_name=?, updated_at=? WHERE id = ?')
      .run(v.day, v.platform, v.branch, v.customer, v.phone, v.orderNo, v.rating, v.comment, v.complaint, v.reached, v.action, who.name, ctx.now, id);
    if (!r.changes) fail(404, 'السطر مش موجود');
    return { ok: true };
  });
  app.route('DELETE', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), id = Number(ctx.body?.id || ctx.query.id);
    const r = await db.prepare('DELETE FROM cs_entries WHERE id = ?').run(id); if (!r.changes) fail(404, 'السطر مش موجود');
    await app.audit('cs_deleted', null, { actor: who.name, id });
    return { ok: true };
  });
  // The branch's rating of the day on Talabat and the competitor's (empty removes it).
  app.route('POST', '/api/cs/rating', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), b = ctx.body || {};
    const day = String(b.day || ''); if (!validDate(day)) fail(400, 'اختار اليوم');
    const branch = clean(b.branch, 60) || fail(400, 'اختار الفرع');
    const num = v => { if (v == null || v === '') return null; const n = Number(v); if (!(n >= 0 && n <= 5)) fail(400, 'التقييم من 0 لـ 5'); return Math.round(n * 100) / 100; };
    const rating = num(b.rating), competitor = num(b.competitor);
    if (rating == null && competitor == null) await db.prepare('DELETE FROM cs_branch_day WHERE day = ? AND branch = ?').run(day, branch);
    else await db.prepare('INSERT INTO cs_branch_day (day, branch, rating, competitor, by_name, at) VALUES (?,?,?,?,?,?) ON CONFLICT(day, branch) DO UPDATE SET rating = excluded.rating, competitor = excluded.competitor, by_name = excluded.by_name, at = excluded.at')
      .run(day, branch, rating, competitor, who.name, ctx.now);
    return { ok: true };
  });
}

export { setup };
