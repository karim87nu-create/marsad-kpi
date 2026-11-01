// مؤشرات الأداء (Karim 01-11): one place with clear numbers for each employee and each branch, against a target and
// against the same length of time just before (yesterday for a day, the week before for a week). Read-only: built from
// what the other pages already use (the call center day/range, and the Apex snapshot the cashier PC sends each day).
import { addDays, businessDay, validDate, iso } from './time.js';
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

  app.route('GET', '/api/kpi', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now);
    const to = validDate(String(ctx.query.to || '')) ? ctx.query.to : today;
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : to;
    if (from > to || to > today) fail(400, 'اختار فترة صحيحة');
    const n = daysOf(from, to).length;
    const pTo = addDays(from, -1), pFrom = addDays(from, -n);
    const [cc, br, pcc, pbr] = await Promise.all([callCenter(from, to, ctx.now), branches(from, to), callCenter(pFrom, pTo, ctx.now).catch(() => null), branches(pFrom, pTo)]);
    return { from, to, prev: { from: pFrom, to: pTo }, targets: TARGETS, team: cc.team, employees: cc.employees, branches: br,
      before: { team: pcc?.team || null, employees: pcc?.employees || [], branches: pbr }, serverNow: iso(ctx.now) };
  });
}

export { setup, TARGETS };
