// الجودة (QA). Karim 11-16: «تقرير الكواليتي … والدرجات الي بنبعتها … عايزين نظبط الادخال عليه»: the call center's own
// sheet (QA1): each call scored on 11 items out of 120 (until the 20-point «احترافية المكالمة» was added, out of 100),
// the percent is the total over the maximum, the grade from the percent. Entered here for any call (the employee, the
// day, the number, the time, the call type), or from the calls the Marsad suggests for the week (the flagged first);
// the old sheet is imported once. Management users (employee_flags.manager) are never suggested.
// The first form (11-11, marks per item, qa_evals) is still read for the averages of its days.
import { addDays, businessDay, validDate, iso } from './time.js';
import { weekStart } from './perf.js';

export const FORM = [
  { key: 'opening', label: 'الافتتاح', max: 10 },
  { key: 'verify', label: 'تأكيد البيانات', max: 10 },
  { key: 'product', label: 'معرفة المنتج', max: 10 },
  { key: 'upsell', label: 'البيع الإضافي', max: 10 },
  { key: 'record', label: 'دقة التسجيل', max: 15 },
  { key: 'tone', label: 'نبرة الصوت', max: 15 },
  { key: 'complaint', label: 'التعامل مع الشكوى', max: 10 },
  { key: 'closing', label: 'إنهاء المكالمة', max: 5 },
  { key: 'policy', label: 'السياسات', max: 10 },
  { key: 'general', label: 'الالتزام العام', max: 5 },
  { key: 'pro', label: 'احترافية المكالمة', max: 20 },
];
export const TYPES = ['اوردر', 'استفسار', 'شكوى'];
const FLAGS = { complaint: 'شكوى', short: 'مكالمة طلب قصيرة جدًا', long: 'مكالمة طويلة', repeat: 'العميل اتصل تاني', wentToPlatform: 'ماطلبش مننا وطلب من طلبات أو الموقع', fixed: 'الأوردر اتعدل بعد الضرب' };
const PER_WEEK = 5;
export const CRITICAL = {};

// The sheet's grade.
export const gradeOf = pct => pct == null ? null : pct >= 90 ? 'ممتاز' : pct >= 80 ? 'جيد جدًا' : pct >= 70 ? 'جيد' : pct >= 60 ? 'مقبول' : 'ضعيف';
// The call type as written in the sheet («اوردر »، «استفساار»، «شكوي») → one of TYPES.
export const typeOf = t => { const s = String(t || '').replace(/\s+/g, ''); return /^ا?و?ردر|order/i.test(s) ? 'اوردر' : /^ا*ستف/.test(s) ? 'استفسار' : /^شك/.test(s) ? 'شكوى' : s ? s.slice(0, 20) : null; };
// Names compared the way people write them (spaces, ى/ي, ة/ه, أ/ا, «عبد ال…»).
export const normName = n => String(n || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/عبد\s+ال/g, 'عبدال').replace(/\s+/g, ' ').trim();

// Scores of the 11 items (missing = not scored) → total, max, percent. An old row with no 11th item is out of 100.
export function scoreOf(scores) {
  let total = 0, max = 0;
  FORM.forEach((f, i) => { const v = scores[i]; if (v == null || v === '') return; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > f.max) throw Error(f.label); total += n; max += f.max; });
  if (!max) return null;
  if (scores[10] == null || scores[10] === '') max = Math.max(max, 100);
  return { total, max, pct: Math.round(total / max * 1000) / 10 };
}

function setup(app) {
  const { db, fail } = app;
  const managers = async () => new Set((await db.prepare('SELECT employee_id FROM employee_flags WHERE manager = 1').all().catch(() => [])).map(r => r.employee_id));

  // The calls to review this week, per employee (built from the linked days).
  async function sample(week, now) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter(d => d <= businessDay(now));
    const all = [];
    for (const d of days) { try { const p = await app.perfDay(d, now); all.push(...p.calls); } catch {} }
    const done = new Map((await db.prepare('SELECT call_key, COUNT(*) n FROM qa_scores WHERE day BETWEEN ? AND ? AND call_key IS NOT NULL GROUP BY call_key').all(week, addDays(week, 6))).map(r => [r.call_key, r.n]));
    const skip = await managers();
    const by = new Map(); for (const c of all) if (!skip.has(c.employeeId)) (by.get(c.employeeId) || by.set(c.employeeId, []).get(c.employeeId)).push(c);
    const out = [];
    for (const [, list] of by) {
      const rnd = c => { let h = 0; for (const ch of c.key + week) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
      const pick = [...list].sort((a, b) => b.flags.length - a.flags.length || rnd(a) - rnd(b)).slice(0, PER_WEEK);
      for (const c of pick) out.push({ ...c, at: iso(c.at), flagLabels: c.flags.map(f => FLAGS[f] || f), evaluated: done.get(c.key) || 0 });
    }
    return out;
  }
  const shape = r => ({ id: r.id, day: r.day, employeeId: r.employee_id, employee: r.employee_name, phone: r.phone, time: r.call_time, type: r.call_type,
    scores: JSON.parse(r.scores || '[]'), total: r.total, max: r.max_total, pct: r.pct, grade: gradeOf(r.pct), notes: r.notes, evaluator: r.evaluator, source: r.source, at: iso(r.created_at) });

  app.route('GET', '/api/qa', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now);
    const to = validDate(String(ctx.query.to || '')) ? ctx.query.to : validDate(String(ctx.query.week || '')) ? addDays(weekStart(ctx.query.week), 6) : today;
    const from = validDate(String(ctx.query.from || '')) && ctx.query.from <= to ? ctx.query.from : to;
    const week = weekStart(validDate(String(ctx.query.week || '')) ? ctx.query.week : to);
    const skip = await managers();
    const emps = (await db.prepare('SELECT id, name, active, deleted_at FROM employees ORDER BY name COLLATE NOCASE').all());
    const names = new Map(emps.map(e => [e.id, e.name]));
    const rows = await db.prepare('SELECT * FROM qa_scores WHERE day BETWEEN ? AND ? ORDER BY day DESC, call_time DESC, id DESC LIMIT 5000').all(from, to);
    const calls = (await sample(week, ctx.now)).map(c => ({ ...c, employee: names.get(c.employeeId) || '—' }));
    return { from, to, week, form: FORM, types: TYPES, calls, entries: rows.map(shape),
      employees: emps.filter(e => e.active && !e.deleted_at && !skip.has(e.id)).map(e => ({ id: e.id, name: e.name })) };
  });

  const write = async (ctx, who, b, id) => {
    const day = String(b.day || ''); if (!validDate(day) || day > businessDay(ctx.now)) fail(400, 'اختار يوم المكالمة');
    const emp = await db.prepare('SELECT id, name FROM employees WHERE id = ?').get(Number(b.employeeId)); if (!emp) fail(400, 'اختار الموظف');
    const type = TYPES.includes(b.type) ? b.type : fail(400, 'اختار نوع المكالمة');
    const time = /^\d{1,2}:\d{2}$/.test(String(b.time || '')) ? String(b.time).padStart(5, '0') : fail(400, 'اكتب وقت المكالمة');
    const scores = FORM.map(f => { const v = b.scores?.[f.key]; return v == null || v === '' ? null : Number(v); });
    let s; try { s = scoreOf(scores); } catch (e) { fail(400, 'درجة «' + e.message + '» أكبر من حدها أو مش رقم'); }
    if (!s) fail(400, 'اكتب الدرجات');
    if (scores.some(v => v == null)) fail(400, 'اكتب درجة كل بند (صفر لو مااتعملش)');
    const phone = String(b.phone || '').replace(/[^\d…+]/g, '').slice(0, 20) || null, notes = String(b.notes || '').slice(0, 1000) || null;
    const callKey = /^\d{4}-\d{2}-\d{2}\|\d+\|\d+$/.test(String(b.callKey || '')) ? String(b.callKey) : null;
    if (id) {
      const r = await db.prepare('UPDATE qa_scores SET day=?, employee_id=?, employee_name=?, phone=?, call_time=?, call_type=?, scores=?, total=?, max_total=?, pct=?, notes=?, evaluator=? WHERE id = ?')
        .run(day, emp.id, emp.name, phone, time, type, JSON.stringify(scores), s.total, s.max, s.pct, notes, who.name, id);
      if (!r.changes) fail(404, 'التقييم مش موجود');
    } else {
      await db.prepare('INSERT INTO qa_scores (day, employee_id, employee_name, phone, call_time, call_type, call_key, scores, total, max_total, pct, notes, evaluator, source, ext_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(day, emp.id, emp.name, phone, time, type, callKey, JSON.stringify(scores), s.total, s.max, s.pct, notes, who.name, 'marsad', 'm|' + day + '|' + emp.id + '|' + (phone || '') + '|' + time, ctx.now)
        .catch(e => { if (/UNIQUE/i.test(String(e.message))) fail(409, 'المكالمة دي متقيّمة قبل كده (نفس الموظف واليوم والرقم والوقت)'); throw e; });
    }
    await app.audit('qa_score', emp.id, { actor: who.name, day, pct: s.pct, id: id || null });
    return { ok: true, ...s, grade: gradeOf(s.pct) };
  };
  app.route('POST', '/api/qa', async ctx => { const who = await app.requireAdmin(ctx, 'write'); return write(ctx, who, ctx.body || {}, null); });
  app.route('PUT', '/api/qa', async ctx => { const who = await app.requireAdmin(ctx, 'write'); return write(ctx, who, ctx.body || {}, Number(ctx.body?.id) || fail(400, 'invalid_id')); });
  app.route('DELETE', '/api/qa', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), id = Number(ctx.body?.id || ctx.query.id);
    const r = await db.prepare('DELETE FROM qa_scores WHERE id = ?').run(id); if (!r.changes) fail(404, 'التقييم مش موجود');
    await app.audit('qa_score_deleted', null, { actor: who.name, id });
    return { ok: true };
  });

  // The old sheet, sent by the admin page in parts (the browser reads the Excel file). Each row once (same day,
  // name, number and time); a name not found among the employees is kept by its name and reported back.
  app.route('POST', '/api/qa/import', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const list = Array.isArray(ctx.body?.rows) ? ctx.body.rows.slice(0, 500) : [];
    const emps = await db.prepare('SELECT id, name FROM employees').all(), byName = new Map();
    for (const e of emps) { const n = normName(e.name); if (!byName.has(n)) byName.set(n, e); }
    const find = n => { const k = normName(n); if (byName.has(k)) return byName.get(k); const two = k.split(' ').slice(0, 2).join(' '); return [...byName].find(([x]) => x.split(' ').slice(0, 2).join(' ') === two)?.[1] || null; };
    const writes = [], unmatched = new Map(); let bad = 0;
    for (const x of list) {
      const day = String(x.day || ''), name = String(x.name || '').replace(/\s+/g, ' ').trim();
      if (!validDate(day) || !name) { bad++; continue; }
      const scores = FORM.map((_, i) => { const v = x.scores?.[i]; return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v); });
      let s; try { s = scoreOf(scores); } catch { s = null; } if (!s) { bad++; continue; }
      const e = find(name); if (!e) unmatched.set(name, (unmatched.get(name) || 0) + 1);
      const ph = String(x.phone ?? '').replace(/\D/g, '').slice(0, 20), phone = (/^1\d{9}$/.test(ph) ? '0' + ph : ph) || null, time = /^\d{1,2}:\d{2}/.test(String(x.time || '')) ? String(x.time).slice(0, 5).padStart(5, '0') : null;
      writes.push(db.prepare('INSERT OR IGNORE INTO qa_scores (day, employee_id, employee_name, phone, call_time, call_type, call_key, scores, total, max_total, pct, notes, evaluator, source, ext_key, created_at) VALUES (?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?)')
        .bind(day, e?.id ?? null, e?.name || name, phone, time, typeOf(x.type), JSON.stringify(scores), s.total, s.max, s.pct, String(x.notes || '').trim().slice(0, 1000) || null, 'الشيت', 'import', 'x|' + day + '|' + normName(name) + '|' + (phone || '') + '|' + (time || '') + '|' + (x.row ?? ''), ctx.now));
    }
    let added = 0;
    for (let i = 0; i < writes.length; i += 100) for (const r of await db.batch(writes.slice(i, i + 100))) added += r?.changes || 0;
    if (added) await app.audit('qa_import', null, { actor: who.name, added });
    return { ok: true, added, skipped: writes.length - added, bad, unmatched: [...unmatched].map(([name, n]) => ({ name, n })) };
  });

  // For the KPI page: each employee's quality score in a period (the sheet's percent; the first form's days too).
  app.qaRange = async (from, to) => {
    const rows = [...await db.prepare('SELECT employee_id, evaluator, pct AS total FROM qa_scores WHERE day BETWEEN ? AND ? AND employee_id IS NOT NULL').all(from, to),
      ...await db.prepare('SELECT employee_id, evaluator, total FROM qa_evals WHERE day BETWEEN ? AND ?').all(from, to)];
    const emp = new Map(), sup = new Map();
    for (const r of rows) {
      const e = emp.get(r.employee_id) || emp.set(r.employee_id, { sum: 0, n: 0 }).get(r.employee_id); if (r.total != null) { e.sum += r.total; e.n++; }
      sup.set(r.evaluator, (sup.get(r.evaluator) || 0) + 1);
    }
    return { employees: new Map([...emp].map(([id, x]) => [id, { qaScore: x.n ? Math.round(x.sum / x.n * 10) / 10 : null, qaCount: x.n }])), supervisors: sup };
  };
  // The employee's own page: the last evaluations with their notes.
  app.qaOf = async (id, from, to) => (await db.prepare('SELECT day, call_time, pct, notes, evaluator FROM qa_scores WHERE employee_id = ? AND day BETWEEN ? AND ? ORDER BY day DESC, id DESC LIMIT 20').all(id, from, to))
    .map(q => ({ callAt: q.day + (q.call_time ? 'T' + q.call_time + ':00+02:00' : ''), total: q.pct, critical: null, notes: q.notes, by: q.evaluator }));
  app.isManager = async id => (await managers()).has(Number(id));
  app.managerIds = managers;
}

export { setup, FLAGS };
