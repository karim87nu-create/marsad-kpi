// Admin read endpoints. All numbers come from engine.js.
import { businessDay, validDate, iso } from './time.js';

function setup(app) {
  const { db, fail } = app;
  const date = ctx => { const today = businessDay(ctx.now), d = ctx.query.date || today; if (!validDate(d) || d > today) fail(400, 'تاريخ غير صحيح'); return d; };

  // Now: employees' states and the customers waiting. Cheap; the admin page asks every second.
  app.route('GET', '/api/live', async ctx => {
    await app.requireAdmin(ctx);
    const [snap, employees, pending] = await Promise.all([app.latestLive(), app.live(ctx.now), db.prepare("SELECT COUNT(*) n FROM break_requests WHERE status = 'pending'").get()]);
    const records = snap ? JSON.parse(snap.rows) : [];
    return {
      serverNow: iso(ctx.now), employees,
      queue: snap ? { observedAt: iso(snap.observed_at), stale: ctx.now - snap.observed_at > 30000, waiting: records.filter(r => /^(on wait|waiting)$/i.test(String(r[10]).trim())).map(r => ({ queue: r[0], phone: r[9], wait: r[8] })),
        active: records.filter(r => /^live call$/i.test(String(r[10]).trim())).length } : null,
      pendingBreaks: pending.n,
    };
  });

  // One data day: KPIs, employees, calls, missed calls, states.
  app.route('GET', '/api/day', async ctx => {
    await app.requireAdmin(ctx);
    return app.heavy('day', date(ctx), ctx.now);
  });

  // Who could have answered one missed call.
  app.route('GET', '/api/missed', async ctx => {
    await app.requireAdmin(ctx);
    const r = await app.heavy('missedContext', date(ctx), Number(ctx.query.index), ctx.now);
    if (!r) fail(404, 'المكالمة غير موجودة');
    return r;
  });
}

export { setup };
