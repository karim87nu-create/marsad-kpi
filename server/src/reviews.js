// مراجعة الاستثناءات: any flagged item (entry error, late transfer of a website order, a Talabat order not found on
// Apex, …) can be answered from the admin page: «مش غلط» with the reason (e.g. a transfer we made between branches)
// or «غلط فعلًا». Answered items stop counting as errors.
// The monitor learns from the answers: items with the same pattern (signature) that were answered «مش غلط» at least
// 3 times and never «غلط فعلًا» are treated as not errors from then on — shown as «غالبًا مش غلط», out of the
// counts, and no Telegram alert — until someone answers one of them «غلط فعلًا».
import { iso, validDate, businessDay } from './time.js';

const LEARN_AT = 3;
const REASONS = { transfer: 'تحويل بين الفروع', intended: 'مقصود / متفق عليه', fixed: 'اتصلّح', customer: 'طلب العميل', system: 'مشكلة في السيستم', other: 'سبب تاني' };

function setup(app) {
  const { db, fail } = app;

  // signature -> { ok, error, reason (most given) }
  async function patterns() {
    const out = new Map();
    for (const r of await db.prepare("SELECT signature, verdict, reason, COUNT(*) n FROM exception_reviews WHERE signature IS NOT NULL GROUP BY signature, verdict, reason").all()) {
      const p = out.get(r.signature) || { ok: 0, error: 0, reasons: {} };
      if (r.verdict === 'ok') { p.ok += r.n; p.reasons[r.reason || 'other'] = (p.reasons[r.reason || 'other'] || 0) + r.n; } else p.error += r.n;
      out.set(r.signature, p);
    }
    for (const p of out.values()) { p.reason = Object.entries(p.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null; p.learned = p.ok >= LEARN_AT && p.error === 0; }
    return out;
  }
  app.reviewPatterns = patterns;
  app.learnedOk = async signature => !!(await patterns()).get(signature)?.learned;

  app.route('GET', '/api/exception-reviews', async ctx => {
    await app.requireAdmin(ctx);
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : businessDay(ctx.now), to = validDate(String(ctx.query.to || '')) ? ctx.query.to : from;
    const rows = await db.prepare('SELECT * FROM exception_reviews WHERE day >= ? AND day <= ? ORDER BY at DESC').all(from, to);
    const p = await patterns();
    return { reasons: REASONS, learnAt: LEARN_AT,
      reviews: rows.map(r => ({ key: r.key, source: r.source, ref: r.ref, day: r.day, verdict: r.verdict, reason: r.reason, note: r.note, by: r.by_name, at: iso(r.at), signature: r.signature })),
      patterns: Object.fromEntries([...p].map(([k, v]) => [k, { ok: v.ok, error: v.error, reason: v.reason, learned: v.learned }])) };
  });
  app.route('POST', '/api/exception-reviews', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const b = ctx.body || {}, key = String(b.key || '').slice(0, 160);
    if (!key) fail(400, 'invalid_key');
    const before = await db.prepare('SELECT * FROM exception_reviews WHERE key = ?').get(key);
    if (b.verdict == null) {
      // Preserve the original review in the append-only audit before clearing its current decision.
      await db.batch([
        db.prepare('INSERT INTO audit (occurred_at,action,employee_id,details) VALUES (?,?,NULL,?)').bind(ctx.now,'exception_review_cleared',JSON.stringify({actor:who.name,key,before:before||null,after:null,reason:String(b.note||'').slice(0,500)||null})),
        db.prepare('DELETE FROM exception_reviews WHERE key = ?').bind(key),
      ]);
      return { ok: true };
    }
    if (!['ok', 'error'].includes(b.verdict)) fail(400, 'invalid_verdict');
    if (b.verdict === 'ok' && b.reason && !REASONS[b.reason]) fail(400, 'invalid_reason');
    const day = validDate(String(b.day || '')) ? b.day : businessDay(ctx.now);
    await db.prepare(`INSERT INTO exception_reviews (key, source, ref, day, verdict, reason, note, signature, by_name, at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, note = excluded.note, signature = COALESCE(excluded.signature, exception_reviews.signature), by_name = excluded.by_name, at = excluded.at`)
      .run(key, String(b.source || '').slice(0, 40), String(b.ref || '').slice(0, 40), day, b.verdict, b.verdict === 'ok' ? (b.reason || 'other') : null, String(b.note || '').slice(0, 500) || null,
        b.signature ? String(b.signature).slice(0, 200) : null, who.name, ctx.now);
    await app.audit('exception_review', null, { actor: who.name, key, verdict: b.verdict, reason: b.reason, before: before || null, after: { verdict:b.verdict, reason:b.reason || null, note:b.note || null } });
    return { ok: true };
  });
}

// The pattern of an Apex entry issue: same kind of problem, same platform, same branch.
const entrySignature = i => 'entry:' + (i.type || '') + ':' + (i.kind || '') + ':' + (i.branch || '');

export { setup, entrySignature, REASONS };
