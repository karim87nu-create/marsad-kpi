// مؤشرات الأداء (Karim 01-11): one place with clear numbers for each employee and each branch, against a target and
// against the same length of time just before (yesterday for a day, the week before for a week). Read-only: built from
// what the other pages already use (the call center day/range, and the Apex snapshot the cashier PC sends each day).
import { addDays, businessDay, validDate, iso, dayWindow as dayWindowOf } from './time.js';
import { parseJson } from './order-match.js';

// Targets: what «good» is. Kept here so every page judges the same way.
const TARGETS = {
  sla: { min: 90, label: 'الرد خلال 10 ث', unit: '%' },
  abandon: { max: 3, label: 'نسبة الفائتة', unit: '%' },
  asa: { max: 15, label: 'متوسط انتظار الرد', unit: 'ث' },
  occupancy: { min: 35, max: 75, label: 'نسبة الانشغال', unit: '%' },
  breakPerDay: { max: 30, label: 'البريك في اليوم', unit: 'د' },
  avgOut: { max: 30, label: 'متوسط وقت الخروج', unit: 'د' },
  latePct: { max: 10, label: 'خرجوا بعد 30 دقيقة', unit: '%' },
  discountPct: { max: 10, label: 'الخصومات من المبيعات', unit: '%' },
  cancelPct: { max: 5, label: 'الإلغاءات من الأوردرات', unit: '%' },
  // Karim 11-11: the call, the order and the customer linked; the shift set by the supervisors.
  conversionPct: { min: 40, label: 'المكالمات اللي بقت أوردر', unit: '%' },
  fcrPct: { min: 85, label: 'الحل من أول مكالمة (FCR)', unit: '%' },
  avgAnswerWait: { max: 10, label: 'متوسط انتظار العميل لحد الرد', unit: 'ث' },
  missedMine: { max: 0, label: 'فائتة كان ممكن يلحقها', unit: '' },
  adherencePct: { min: 90, label: 'الالتزام بالشيفت', unit: '%' },
  lateDays: { max: 0, label: 'أيام تأخير', unit: '' },
  qaScore: { min: 85, label: 'درجة الجودة', unit: '%' },
  // Supervisors (Karim 11-11).
  approvalMin: { max: 5, label: 'وقت الرد على الموافقات', unit: 'د' },
  reviewMin: { max: 15, label: 'وقت الرد على رسايل الفروع', unit: 'د' },
  breakReplyMin: { max: 2, label: 'وقت الرد على طلبات البريك', unit: 'د' },
  qaDone: { min: 10, label: 'تقييمات جودة في الأسبوع', unit: '' },
  // Branches, from Talabat, the website and the bot.
  closedHours: { max: 1, label: 'ساعات القفل على طلبات في اليوم', unit: 'س' },
  siteOutMin: { max: 30, label: 'أوردر الموقع من التحويل للخروج', unit: 'د' },
  talabatCancelPct: { max: 3, label: 'إلغاءات طلبات', unit: '%' },
};

const r1 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
const daysOf = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 93; d = addDays(d, 1)) out.push(d); return out; };

function setup(app) {
  const { db, fail } = app;

  // Branches for one Apex day, from the snapshot (cached until the cashier PC sends a newer one).
  const dayCache = new Map();
  async function branchDay(day) {
    const row = await db.prepare('SELECT data, received_at FROM orders_days WHERE day = ?').get(day);
    if (!row) return [];
    const hit = dayCache.get(day);
    if (hit && hit.at === row.received_at) return hit.rows;
    const d = parseJson(row.data, {});
    const disc = new Map();
    for (const s of d.sales || []) disc.set(s.branch, (disc.get(s.branch) || 0) + (Number(s.discounts) || 0));
    const rows = (d.branches || []).map(b => ({ name: b.name, orders: Number(b.orders) || 0, sales: Number(b.sales) || 0, outCount: Number(b.outCount) || 0,
      outMinutes: (Number(b.avgOut) || 0) * (Number(b.outCount) || 0), outLate: Number(b.outLate) || 0, cancels: Number(b.cancels) || 0, cancelSales: Number(b.cancelSales) || 0,
      discounts: disc.get(b.name) || 0, kinds: b.kinds || {} }));
    dayCache.set(day, { at: row.received_at, rows });
    if (dayCache.size > 120) dayCache.delete(dayCache.keys().next().value);
    return rows;
  }
  async function branches(from, to) {
    const by = new Map();
    for (const day of daysOf(from, to)) for (const b of await branchDay(day)) {
      const o = by.get(b.name) || { name: b.name, orders: 0, sales: 0, outCount: 0, outMinutes: 0, outLate: 0, cancels: 0, cancelSales: 0, discounts: 0, talabat: 0, hotline: 0, site: 0 };
      for (const k of ['orders', 'sales', 'outCount', 'outMinutes', 'outLate', 'cancels', 'cancelSales', 'discounts']) o[k] += b[k];
      o.talabat += Number(b.kinds['طلبات']) || 0; o.hotline += Number(b.kinds.Hotline) || 0; o.site += Number(b.kinds['الموقع']) || 0;
      by.set(b.name, o);
    }
    return [...by.values()].map(o => ({ name: o.name, orders: o.orders, sales: Math.round(o.sales), avgTicket: o.orders ? Math.round(o.sales / o.orders) : null,
      avgOut: o.outCount ? r1(o.outMinutes / o.outCount) : null, latePct: o.outCount ? r1(o.outLate / o.outCount * 100) : null, outLate: o.outLate,
      cancels: o.cancels, cancelPct: o.orders + o.cancels ? r1(o.cancels / (o.orders + o.cancels) * 100) : null, cancelSales: Math.round(o.cancelSales), discounts: Math.round(o.discounts), discountPct: o.sales ? r1(o.discounts / o.sales * 100) : null,
      mix: { talabat: o.talabat, hotline: o.hotline, site: o.site } })).sort((a, b) => b.orders - a.orders);
  }

  // The call center for a period: the team and each employee.
  async function callCenter(from, to, now) {
    const r = from === to ? await app.day(from, now) : await app.range(from, to, now);
    const rep = r.history?.report || {};
    const team = { calls: rep.calls ?? null, answered: rep.answered ?? null, abandoned: rep.abandoned ?? null, sla: r1(rep.sla), abandon: r1(rep.abandonmentRate), asa: r1(rep.asa),
      meanCall: rep.meanCallSeconds != null ? Math.round(rep.meanCallSeconds) : null, complete: !!rep.verifiedTotal };
    const days = Math.max(1, daysOf(from, to).length);
    const employees = (r.employees || []).filter(e => (e.workSeconds || 0) > 0).map(e => {
      const worked = e.daysWorked || (from === to ? 1 : 1);
      const busy = (e.callSeconds || 0), ready = (e.readySeconds || 0);
      return { id: e.employeeId, name: e.name, daysWorked: worked, calls: e.answered ?? e.calls ?? 0, callsPerDay: r1((e.answered ?? e.calls ?? 0) / worked),
        meanCall: e.averageCallSeconds ?? (e.answered ? Math.round((e.talkSeconds || 0) / e.answered) : null), longCalls: e.longCalls || 0,
        occupancy: busy + ready ? r1(busy / (busy + ready) * 100) : null, workHours: r1((e.workSeconds || 0) / 3600), breakPerDay: r1((e.breakSeconds || 0) / 60 / worked),
        overBreakDays: e.overBreakDays ?? ((e.breakSeconds || 0) > 1800 ? 1 : 0) };
    }).sort((a, b) => b.calls - a.calls);
    return { team, employees, days };
  }

  // Supervisors: how fast they answer what waits for them, and the quality reviews they did (admin accounts by name).
  async function supervisors(from, to) {
    const w1 = dayWindowOf(from).start, w2 = dayWindowOf(to).end;
    const by = new Map(), S = name => by.get(name) || by.set(name, { name, approvals: 0, approvalMs: 0, reviews: 0, reviewMs: 0, breaks: 0, breakMs: 0, qaDone: 0, shiftDecisions: 0 }).get(name);
    const safe = async q => { try { return await q; } catch { return []; } };
    for (const r of await safe(db.prepare("SELECT needs, done_by, created_at, done_at FROM bot_cases WHERE needs IN ('approval','review') AND state = 'done' AND done_by IS NOT NULL AND done_at BETWEEN ? AND ?").all(w1, w2))) {
      const s = S(r.done_by); if (r.needs === 'approval') { s.approvals++; s.approvalMs += r.done_at - r.created_at; } else { s.reviews++; s.reviewMs += r.done_at - r.created_at; }
    }
    for (const r of await safe(db.prepare("SELECT decided_by, created_at, decided_at FROM break_requests WHERE decided_by IS NOT NULL AND decided_at BETWEEN ? AND ?").all(w1, w2))) { const s = S(r.decided_by); s.breaks++; s.breakMs += r.decided_at - r.created_at; }
    for (const r of await safe(db.prepare("SELECT decided_by, COUNT(*) n FROM shift_decisions WHERE decided_at BETWEEN ? AND ? GROUP BY decided_by").all(w1, w2))) if (r.decided_by) S(r.decided_by).shiftDecisions += r.n;
    const qa = app.qaRange ? await app.qaRange(from, to) : null;
    if (qa) for (const [name, n] of qa.supervisors) S(name).qaDone += n;
    const weeks = Math.max(1, daysOf(from, to).length / 7);
    return [...by.values()].map(s => ({ name: s.name, approvals: s.approvals, approvalMin: s.approvals ? r1(s.approvalMs / s.approvals / 60000) : null, reviews: s.reviews, reviewMin: s.reviews ? r1(s.reviewMs / s.reviews / 60000) : null,
      breaks: s.breaks, breakReplyMin: s.breaks ? r1(s.breakMs / s.breaks / 60000) : null, qaDone: s.qaDone, qaPerWeek: r1(s.qaDone / weeks), shiftDecisions: s.shiftDecisions })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }
  // Branches: Talabat closures and cancellations, website orders from transfer to out, and what they told the bot.
  const bkey = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^\s*(فرع|الدهان)[\s,،-]*/g, '').trim();
  const sameBranch = (a, b) => { const x = bkey(a), y = bkey(b); if (!x || !y) return false; return x === y || x.includes(y) || y.includes(x) || x.split(/[\s,،-]+/).some(w => w.length > 3 && y.includes(w)); };
  async function branchExtras(from, to, names) {
    const safe = async q => { try { return await q; } catch { return []; } };
    const out = new Map(names.map(n => [n, { closedMinutes: 0, closures: 0, talabatOrders: 0, talabatCancels: 0, siteOut: 0, siteOutN: 0, itemOut: 0, botRequests: 0 }]));
    const find = name => names.find(n => sameBranch(n, name));
    const w2 = dayWindowOf(to).end;
    for (const r of await safe(db.prepare('SELECT branch, name, started_at, ended_at FROM talabat_closures WHERE day BETWEEN ? AND ?').all(from, to))) {
      const n = find(r.branch || r.name); if (!n) continue; const o = out.get(n); o.closures++; o.closedMinutes += Math.max(0, (Math.min(r.ended_at || w2, w2) - r.started_at) / 60000);
    }
    for (const r of await safe(db.prepare("SELECT store, UPPER(COALESCE(status,'')) st, COUNT(*) n FROM talabat_orders WHERE day BETWEEN ? AND ? GROUP BY store, st").all(from, to))) {
      const n = find(r.store); if (!n) continue; const o = out.get(n); o.talabatOrders += r.n; if (/CANCEL|REJECT/.test(r.st)) o.talabatCancels += r.n;
    }
    for (const r of await safe(db.prepare("SELECT branch, transfer_at, out_at FROM site_orders WHERE day BETWEEN ? AND ? AND transfer_at IS NOT NULL AND out_at IS NOT NULL AND out_at > transfer_at").all(from, to))) {
      const n = find(r.branch); if (!n) continue; const o = out.get(n); o.siteOut += (r.out_at - r.transfer_at) / 60000; o.siteOutN++;
    }
    for (const r of await safe(db.prepare('SELECT branch, kind, COUNT(*) n FROM bot_cases WHERE day BETWEEN ? AND ? AND parent_id IS NULL GROUP BY branch, kind').all(from, to))) {
      const n = find(r.branch); if (!n) continue; const o = out.get(n); o.botRequests += r.n; if (r.kind === 'item_out') o.itemOut += r.n;
    }
    const days = Math.max(1, daysOf(from, to).length);
    return new Map([...out].map(([n, o]) => [n, { closedHours: r1(o.closedMinutes / 60 / days), closures: o.closures, talabatCancelPct: o.talabatOrders ? r1(o.talabatCancels / o.talabatOrders * 100) : null, talabatCancels: o.talabatCancels,
      siteOutMin: o.siteOutN ? r1(o.siteOut / o.siteOutN) : null, siteOrders: o.siteOutN, itemOut: o.itemOut, botRequests: o.botRequests }]));
  }

  app.route('GET', '/api/kpi', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now);
    const to = validDate(String(ctx.query.to || '')) ? ctx.query.to : today;
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : to;
    if (from > to || to > today) fail(400, 'اختار فترة صحيحة');
    return build(from, to, ctx);
  });

  // Karim 11-11 «يظهر للموظفين عادي»: each employee sees their own numbers and where they stand, on the transfer page.
  const good = (k, v) => { const t = TARGETS[k]; if (!t || v == null) return null; return !(t.max != null && v > t.max) && !(t.min != null && v < t.min); };
  const empScore = e => { const t = [['occupancy', e.occupancy], ['breakPerDay', e.breakPerDay], ['callsVsTeam', e.callsVsTeam], ['avgAnswerWait', e.avgAnswerWait], ['conversionPct', e.orderCalls ? e.conversionPct : null],
    ['fcrPct', e.fcrPct], ['missedMine', e.rosterDays || e.missedMine ? e.missedMine : null], ['adherencePct', e.adherencePct], ['lateDays', e.rosterDays ? e.lateDays : null], ['qaScore', e.qaCount ? e.qaScore : null]].map(([k, v]) => good(k, v)).filter(x => x != null);
    return t.length ? Math.round(t.filter(Boolean).length / t.length * 100) : null; };
  app.route('GET', '/api/me/kpi', async ctx => {
    const me = await app.transferWho(ctx);
    if (!me.staff) fail(400, 'الصفحة دي للموظف');
    const today = businessDay(ctx.now), range = String(ctx.query.range || 'week');
    const from = range === 'day' ? today : range === 'month' ? today.slice(0, 8) + '01' : addDays(today, -6);
    const d = await build(from, today, ctx);
    const avg = (() => { const w = d.employees.filter(e => e.callsPerDay != null); return w.length ? w.reduce((n, e) => n + e.callsPerDay, 0) / w.length : null; })();
    for (const e of d.employees) { e.callsVsTeam = avg && e.callsPerDay != null ? Math.round(e.callsPerDay / avg * 100) : null; e.score = empScore(e); }
    const ranked = d.employees.filter(e => e.score != null).sort((a, b) => b.score - a.score || (b.calls || 0) - (a.calls || 0));
    const mine = d.employees.find(e => e.id === me.id) || null, pmine = d.before.employees.find(e => e.id === me.id) || null;
    let qa = []; try { qa = await db.prepare('SELECT call_at, total, critical, notes, evaluator, created_at FROM qa_evals WHERE employee_id = ? AND day BETWEEN ? AND ? ORDER BY id DESC LIMIT 20').all(me.id, from, today); } catch {}
    return { from, to: today, range, targets: TARGETS, me: mine, before: pmine, rank: mine ? ranked.findIndex(e => e.id === me.id) + 1 || null : null, of: ranked.length,
      board: ranked.map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, me: e.id === me.id })), qa: qa.map(q => ({ callAt: iso(q.call_at), total: q.total, critical: q.critical, notes: q.notes, by: q.evaluator })) };
  });

  async function build(from, to, ctx) {
    const n = daysOf(from, to).length;
    const pTo = addDays(from, -1), pFrom = addDays(from, -n);
    const [cc, br, pcc, pbr] = await Promise.all([callCenter(from, to, ctx.now), branches(from, to), callCenter(pFrom, pTo, ctx.now).catch(() => null), branches(pFrom, pTo)]);
    // The linked numbers (perf.js): the same employees, plus anyone on the shift table who did not work.
    const [pf, ppf] = app.perfRange ? await Promise.all([app.perfRange(from, to, ctx.now).catch(() => null), app.perfRange(pFrom, pTo, ctx.now).catch(() => null)]) : [null, null];
    const names = new Map((await db.prepare('SELECT id, name FROM employees').all()).map(e => [e.id, e.name]));
    const merge = (list, p) => {
      if (!p) return list;
      const by = new Map(p.employees.map(e => [e.employeeId, e])), out = list.map(e => ({ ...e, ...(by.get(e.id) || {}) }));
      for (const e of p.employees) if (!list.some(x => x.id === e.employeeId) && (e.rosterDays || e.missedMine)) out.push({ id: e.employeeId, name: names.get(e.employeeId) || '—', calls: 0, ...e });
      return out;
    };
    const [qa, pqa] = app.qaRange ? await Promise.all([app.qaRange(from, to), app.qaRange(pFrom, pTo)]) : [null, null];
    const withQa = (list, q) => {
      if (!q) return list;
      const out = list.map(e => ({ ...e, ...(q.employees.get(e.id) || {}) }));
      for (const [id, x] of q.employees) if (!out.some(e => e.id === id)) out.push({ id, name: names.get(id) || '—', calls: 0, ...x });
      return out;
    };
    const [bx, pbx] = await Promise.all([branchExtras(from, to, br.map(b => b.name)), branchExtras(pFrom, pTo, pbr.map(b => b.name))]);
    const withBx = (list, x) => list.map(b => ({ ...b, ...(x.get(b.name) || {}) }));
    const [sup, psup] = await Promise.all([supervisors(from, to), supervisors(pFrom, pTo)]);
    return { from, to, prev: { from: pFrom, to: pTo }, targets: TARGETS, team: { ...cc.team, ...(pf?.team || {}) }, employees: withQa(merge(cc.employees, pf), qa), branches: withBx(br, bx), supervisors: sup,
      before: { team: pcc?.team ? { ...pcc.team, ...(ppf?.team || {}) } : null, employees: withQa(merge(pcc?.employees || [], ppf), pqa), branches: withBx(pbr, pbx), supervisors: psup }, serverNow: iso(ctx.now) };
  }
}

export { setup, TARGETS };
