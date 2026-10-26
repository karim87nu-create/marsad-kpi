// What the monitor learns by itself, so linking gets faster and surer with use:
// - from every sure link (the #code written on Apex, or a link a supervisor chose), which names mean the same branch
//   on Talabat / the website and on Apex, and how long after acceptance each branch usually enters the order;
// - anything a screen showed that the monitor did not know yet (a new status, a new step, a new cancellation owner),
//   kept and listed on the admin page instead of being dropped.
// Each fact is stored once per order (ref), so counting refs is counting evidence.

function setup(app) {
  const { db } = app;
  const learn = app.learn = {
    async record(kind, a, b, ref, value = null, now = app.now()) {
      if (!a || !b || !ref) return;
      await db.prepare('INSERT INTO learned (kind, a, b, ref, value, at) VALUES (?,?,?,?,?,?) ON CONFLICT(kind, a, b, ref) DO UPDATE SET value = excluded.value, at = excluded.at')
        .run(kind, String(a).slice(0, 160), String(b).slice(0, 160), String(ref).slice(0, 60), value, now);
    },
    // kind -> Map(a -> Map(b -> evidence count))
    async pairs(kind) {
      const out = new Map();
      for (const r of await db.prepare('SELECT a, b, COUNT(*) n FROM learned WHERE kind = ? GROUP BY a, b').all(kind)) {
        if (!out.has(r.a)) out.set(r.a, new Map());
        out.get(r.a).set(r.b, r.n);
      }
      return out;
    },
    // The values seen for (kind, a), newest first (at most 200).
    async values(kind, a) { return (await db.prepare('SELECT value FROM learned WHERE kind = ? AND a = ? AND value IS NOT NULL ORDER BY at DESC LIMIT 200').all(kind, a)).map(r => r.value); },
    // Something new on a screen: kept once per value.
    async unknown(source, what, sample, now = app.now()) {
      await db.prepare('INSERT INTO learned (kind, a, b, ref, value, at) VALUES (?,?,?,?,NULL,?) ON CONFLICT(kind, a, b, ref) DO NOTHING')
        .run('unknown', String(source).slice(0, 40), String(what).slice(0, 160), String(sample || '-').slice(0, 60), now);
    },
  };

  app.route('GET', '/api/learned', async ctx => {
    await app.requireAdmin(ctx);
    const rows = await db.prepare("SELECT kind, a, b, COUNT(*) n, MAX(at) last FROM learned WHERE kind != 'delay' GROUP BY kind, a, b ORDER BY kind, n DESC LIMIT 500").all();
    const delays = await db.prepare("SELECT a, COUNT(*) n FROM learned WHERE kind = 'delay' GROUP BY a").all();
    return { facts: rows.map(r => ({ kind: r.kind, a: r.a, b: r.b, evidence: r.n, last: new Date(r.last).toISOString() })), delays: delays.map(r => ({ branch: r.a, evidence: r.n })) };
  });
  app.route('POST', '/api/learned', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    // Forget one learned pair (when a link taught something wrong).
    await db.prepare('DELETE FROM learned WHERE kind = ? AND a = ? AND b = ?').run(String(ctx.body.kind || ''), String(ctx.body.a || ''), String(ctx.body.b || ''));
    await app.audit('learned_forgotten', null, { actor: who.name, kind: ctx.body.kind, a: ctx.body.a, b: ctx.body.b });
    return { ok: true };
  });
  return learn;
}

export { setup };
