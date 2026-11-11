// الجودة (QA) (Karim 11-11): each week the Marsad picks calls for every employee — the flagged ones first (complaint,
// very short or long, the customer called again, didn't order from us but ordered on Talabat or the website, the order
// was edited after entry) and then at random. A supervisor listens to the recording on Arabicss and scores it on the
// form below (built on the call-center script). The employee's quality score is the average; the same call scored by
// two supervisors shows how far apart they are (calibration).
import { addDays, businessDay, validDate, iso } from './time.js';
import { weekStart } from './perf.js';

const FORM = [
  { key: 'opening', label: 'الافتتاحية والترحيب', weight: 10 },
  { key: 'verify', label: 'التأكد من الاسم والتليفون والعنوان', weight: 15 },
  { key: 'order', label: 'تسجيل الأوردر صح (الأصناف والأوزان والملاحظات)', weight: 20 },
  { key: 'branch', label: 'الفرع والمنطقة ووقت التوصيل', weight: 10 },
  { key: 'upsell', label: 'الاقتراح والبيع الإضافي', weight: 10 },
  { key: 'problem', label: 'التعامل مع الشكوى أو المشكلة', weight: 10 },
  { key: 'tone', label: 'الأسلوب ونبرة الصوت والاحترام', weight: 10 },
  { key: 'closing', label: 'الختام وتلخيص الأوردر', weight: 10 },
  { key: 'script', label: 'الالتزام بالسكريبت والوقت', weight: 5 },
];
// ممتاز / مقبول / محتاج تحسين / مش منطبق.
const MARKS = { good: 1, ok: 0.6, bad: 0, na: null };
const CRITICAL = { rude: 'إساءة للعميل', wrongPrice: 'سعر أو عرض غلط اتقال للعميل', noOrder: 'العميل طلب والأوردر ماتسجلش' };
const FLAGS = { complaint: 'شكوى', short: 'مكالمة طلب قصيرة جدًا', long: 'مكالمة طويلة', repeat: 'العميل اتصل تاني', wentToPlatform: 'ماطلبش مننا وطلب من طلبات أو الموقع', fixed: 'الأوردر اتعدل بعد الضرب' };
const PER_WEEK = 5;

export function scoreOf(marks, critical) {
  if (critical && Object.keys(CRITICAL).includes(critical)) return 0;
  let got = 0, max = 0;
  for (const f of FORM) { const m = MARKS[marks?.[f.key]]; if (m == null) continue; got += m * f.weight; max += f.weight; }
  return max ? Math.round(got / max * 1000) / 10 : null;
}

function setup(app) {
  const { db, fail } = app;

  // The calls to review this week, per employee (built from the linked days).
  async function sample(week, now) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter(d => d <= businessDay(now));
    const all = [];
    for (const d of days) { try { const p = await app.perfDay(d, now); all.push(...p.calls); } catch {} }
    const done = new Map((await db.prepare('SELECT call_key, COUNT(*) n FROM qa_evals WHERE week = ? GROUP BY call_key').all(week)).map(r => [r.call_key, r.n]));
    const by = new Map(); for (const c of all) (by.get(c.employeeId) || by.set(c.employeeId, []).get(c.employeeId)).push(c);
    const out = [];
    for (const [id, list] of by) {
      // Flagged first (most flags first), then a fixed random order (the same each time the page opens this week).
      const rnd = c => { let h = 0; for (const ch of c.key + week) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
      const pick = [...list].sort((a, b) => b.flags.length - a.flags.length || rnd(a) - rnd(b)).slice(0, PER_WEEK);
      for (const c of pick) out.push({ ...c, at: iso(c.at), flagLabels: c.flags.map(f => FLAGS[f] || f), evaluated: done.get(c.key) || 0 });
    }
    return out;
  }

  app.route('GET', '/api/qa', async ctx => {
    await app.requireAdmin(ctx);
    const week = weekStart(validDate(String(ctx.query.week || '')) ? ctx.query.week : businessDay(ctx.now));
    const names = new Map((await db.prepare('SELECT id, name FROM employees').all()).map(e => [e.id, e.name]));
    const evals = await db.prepare('SELECT * FROM qa_evals WHERE week = ? ORDER BY id DESC').all(week);
    const calls = (await sample(week, ctx.now)).map(c => ({ ...c, employee: names.get(c.employeeId) || '—' }));
    // Calibration: the same call scored by more than one supervisor.
    const twice = new Map(); for (const e of evals) (twice.get(e.call_key) || twice.set(e.call_key, []).get(e.call_key)).push(e);
    const calibration = [...twice.values()].filter(l => l.length > 1).map(l => ({ callKey: l[0].call_key, employee: names.get(l[0].employee_id) || '—', scores: l.map(e => ({ by: e.evaluator, total: e.total })), spread: Math.max(...l.map(e => e.total ?? 0)) - Math.min(...l.map(e => e.total ?? 0)) }));
    return { week, form: FORM, marks: { good: 'ممتاز', ok: 'مقبول', bad: 'محتاج تحسين', na: 'مش منطبق' }, critical: CRITICAL, flags: FLAGS, calls,
      evals: evals.map(e => ({ id: e.id, callKey: e.call_key, employeeId: e.employee_id, employee: names.get(e.employee_id) || '—', callAt: iso(e.call_at), evaluator: e.evaluator, total: e.total, critical: e.critical, notes: e.notes, marks: JSON.parse(e.marks || '{}'), at: iso(e.created_at) })),
      calibration };
  });
  app.route('POST', '/api/qa', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), b = ctx.body;
    const key = String(b.callKey || ''), m = key.match(/^(\d{4}-\d{2}-\d{2})\|(\d+)\|(\d+)$/);
    if (!m) fail(400, 'اختار المكالمة');
    const marks = {}; for (const f of FORM) { const v = String(b.marks?.[f.key] || ''); if (!Object.hasOwn(MARKS, v)) fail(400, 'قيّم «' + f.label + '»'); marks[f.key] = v; }
    const critical = b.critical && CRITICAL[b.critical] ? b.critical : null;
    const total = scoreOf(marks, critical);
    if (total == null) fail(400, 'كله «مش منطبق» — قيّم بند واحد على الأقل');
    const week = weekStart(m[1]);
    await db.prepare(`INSERT INTO qa_evals (week, day, call_key, employee_id, call_at, evaluator, marks, critical, total, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(call_key, evaluator) DO UPDATE SET marks = excluded.marks, critical = excluded.critical, total = excluded.total, notes = excluded.notes, created_at = excluded.created_at`)
      .run(week, m[1], key, Number(m[2]), Number(m[3]), who.name, JSON.stringify(marks), critical, total, String(b.notes || '').slice(0, 1000), ctx.now);
    await app.audit('qa_eval', null, { actor: who.name, callKey: key, total });
    return { ok: true, total };
  });

  // For the KPI page: each employee's quality score in a period, and how many reviews each supervisor did.
  app.qaRange = async (from, to) => {
    const rows = await db.prepare('SELECT employee_id, evaluator, total FROM qa_evals WHERE day BETWEEN ? AND ?').all(from, to);
    const emp = new Map(), sup = new Map();
    for (const r of rows) {
      const e = emp.get(r.employee_id) || emp.set(r.employee_id, { sum: 0, n: 0 }).get(r.employee_id); if (r.total != null) { e.sum += r.total; e.n++; }
      sup.set(r.evaluator, (sup.get(r.evaluator) || 0) + 1);
    }
    return { employees: new Map([...emp].map(([id, x]) => [id, { qaScore: x.n ? Math.round(x.sum / x.n * 10) / 10 : null, qaCount: x.n }])), supervisors: sup };
  };
}

export { setup, FORM, CRITICAL, FLAGS };
