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
    return ctx.query.to || ctx.query.from ? app.heavy('range', ctx.query.from || date(ctx), ctx.query.to || date(ctx), ctx.now) : app.heavy('day', date(ctx), ctx.now);
  });

  // The last hours minute by minute (the "now" screen's pulse bar and time travel).
  app.route('GET', '/api/pulse', async ctx => {
    await app.requireAdmin(ctx);
    return app.heavy('pulse', ctx.now, Number(ctx.query.minutes) || 180);
  });

  // The order of the seats on the "now" screen, shared by every admin.
  app.route('GET', '/api/now-layout', async ctx => {
    await app.requireAdmin(ctx);
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'now_layout'").get();
    let order = []; try { order = JSON.parse(row?.value || '[]'); } catch {}
    return { order: Array.isArray(order) ? order : [] };
  });
  app.route('POST', '/api/now-layout', async ctx => {
    await app.requireAdmin(ctx, 'write');
    const order = ctx.body?.order;
    if (!Array.isArray(order) || order.length > 500 || order.some(x => typeof x !== 'string' && typeof x !== 'number' || String(x).length > 64)) fail(400, 'ترتيب غير صحيح');
    const clean = [...new Set(order.map(String))];
    await db.prepare("INSERT INTO settings (key, value) VALUES ('now_layout', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(clean));
    return { order: clean };
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
