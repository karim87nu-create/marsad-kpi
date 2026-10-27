// What the monitor learns by itself, so linking gets faster and surer with use:
// - from every sure link (the #code written on Apex, or a link a supervisor chose), which names mean the same branch
//   on Talabat / the website and on Apex, and how long after acceptance each branch usually enters the order;
// - anything a screen showed that the monitor did not know yet (a new status, a new step, a new cancellation owner),
//   kept and listed on the admin page instead of being dropped.
// Each fact is stored once per order (ref), so counting refs is counting evidence.

function setup(app) {
  const { db } = app;
  async function currentRows(kind) {
    const scope = kind?.startsWith('match-v2:') ? kind.split(':').at(-1) : null;
    const legacy = await db.prepare("SELECT * FROM learned WHERE (? IS NULL OR kind = ?) AND NOT EXISTS (SELECT 1 FROM learning_evidence e WHERE e.ref = learned.ref AND learned.kind LIKE 'match-v2:%:' || e.source)").all(kind || null, kind || null);
    const active = await db.prepare('SELECT * FROM learning_evidence WHERE ? IS NULL OR source = ?').all(scope, scope);
    for (const row of active) for (const f of JSON.parse(row.facts)) if (!kind || f.kind === kind) legacy.push({ ...f, ref: row.ref, at: row.at });
    return legacy;
  }
  const learn = app.learn = {
    async replace(source, ref, facts) {
      const data = JSON.stringify(facts), now = app.now();
      await db.batch([
        ...facts.map(f => db.prepare('INSERT INTO learned (kind,a,b,ref,value,at) VALUES (?,?,?,?,?,?) ON CONFLICT(kind,a,b,ref) DO NOTHING').bind(f.kind,f.a,f.b,String(ref),f.value ?? null,now)),
        db.prepare('INSERT INTO learning_evidence (source,ref,facts,at) VALUES (?,?,?,?) ON CONFLICT(source,ref) DO UPDATE SET facts=excluded.facts,at=excluded.at WHERE learning_evidence.facts != excluded.facts').bind(source,String(ref),data,now),
      ]);
    },
    async record(kind, a, b, ref, value = null, now = app.now()) {
      if (!a || !b || !ref) return;
      await db.prepare('INSERT INTO learned (kind, a, b, ref, value, at) VALUES (?,?,?,?,?,?) ON CONFLICT(kind, a, b, ref) DO UPDATE SET value = excluded.value, at = excluded.at')
        .run(kind, String(a).slice(0, 160), String(b).slice(0, 160), String(ref).slice(0, 60), value, now);
    },
    // kind -> Map(a -> Map(b -> evidence count))
    async pairs(kind) {
      const out = new Map();
      for (const r of await currentRows(kind)) {
        if (!out.has(r.a)) out.set(r.a, new Map());
        out.get(r.a).set(r.b, (out.get(r.a).get(r.b) || 0) + 1);
      }
      return out;
    },
    // The values seen for (kind, a), newest first (at most 200).
    async values(kind, a) { return (await currentRows(kind)).filter(r => r.a === a && r.value != null).sort((x,y) => y.at-x.at).slice(0,200).map(r => r.value); },
    // Something new on a screen: kept once per value.
    async unknown(source, what, sample, now = app.now()) {
      await db.prepare('INSERT INTO learned (kind, a, b, ref, value, at) VALUES (?,?,?,?,NULL,?) ON CONFLICT(kind, a, b, ref) DO NOTHING')
        .run('unknown', String(source).slice(0, 40), String(what).slice(0, 160), String(sample || '-').slice(0, 60), now);
    },
  };

  app.route('GET', '/api/learned', async ctx => {
    await app.requireAdmin(ctx);
    const grouped = new Map();
    for (const r of await currentRows()) {
      if (r.kind === 'delay') continue;
      const key = JSON.stringify([r.kind,r.a,r.b]), prev = grouped.get(key) || { kind:r.kind,a:r.a,b:r.b,n:0,last:0 };
      prev.n++; prev.last=Math.max(prev.last,r.at); grouped.set(key,prev);
    }
    const rows = [...grouped.values()].sort((x,y)=>x.kind.localeCompare(y.kind)||y.n-x.n).slice(0,500);
    const delays = await db.prepare("SELECT a, COUNT(*) n FROM learned WHERE kind = 'delay' GROUP BY a").all();
    return { facts: rows.map(r => ({ kind: r.kind, a: r.a, b: r.b, evidence: r.n, last: new Date(r.last).toISOString() })), delays: delays.map(r => ({ branch: r.a, evidence: r.n })) };
  });
  app.route('POST', '/api/learned', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    // Apply an explicit forgotten pair to current evidence as well as the legacy view.
    const before = [];
    for (const row of await db.prepare('SELECT * FROM learning_evidence').all()) {
      const facts = JSON.parse(row.facts), kept = facts.filter(f => !(f.kind === ctx.body.kind && f.a === ctx.body.a && f.b === ctx.body.b));
      if (kept.length === facts.length) continue;
      before.push({ source: row.source, ref: row.ref, facts: facts.filter(f => !kept.includes(f)) });
      await db.prepare('UPDATE learning_evidence SET facts=?,at=? WHERE source=? AND ref=?').run(JSON.stringify(kept),ctx.now,row.source,row.ref);
    }
    // Forget one learned pair (when a link taught something wrong).
    await db.prepare('DELETE FROM learned WHERE kind = ? AND a = ? AND b = ?').run(String(ctx.body.kind || ''), String(ctx.body.a || ''), String(ctx.body.b || ''));
    await app.audit('learned_forgotten', null, { actor: who.name, kind: ctx.body.kind, a: ctx.body.a, b: ctx.body.b, before, after: [], reason: String(ctx.body.reason || '').slice(0,500) || null });
    return { ok: true };
  });
  return learn;
}

export { setup };
