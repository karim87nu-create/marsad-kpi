// تقرير اليوم (Karim 11-14: «تقرير يوم واحد شامل … مقارنة بالأيام اللي فاتت … يتبعت على تليجرام»): one day — the calls,
// the team, the orders by kind and branch, the transfers to Apex (automatic or by staff), the cancellations — each number
// next to the same weekday a week before. The admin page shows it; the manager's Telegram group gets it at the day's end.
import { businessDay, addDays, validDate, iso } from './time.js';
import { parseJson } from './order-match.js';
import { autoReport } from './autotransfer.js';
import { TARGETS } from './kpi.js';

const KIND_NAMES = { Hotline: 'الكول سنتر', 'طلبات': 'طلبات', 'الموقع': 'الموقع', 'وفرها': 'وفرها', 'المنيوز': 'المنيوز' };
const r1 = v => v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10;

async function one(app, day, now) {
  const { db } = app;
  const d = await app.heavy('day', day, now).catch(() => null);
  const r = d?.history?.report || null, e = d?.employees || [], sum = k => e.reduce((n, x) => n + (Number(x[k]) || 0), 0);
  const row = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
  const full = parseJson(row?.data, null), t = full?.totals || {};
  const auto = autoReport(await db.prepare('SELECT source, ref, day, code, decision, reasons FROM auto_transfer_log WHERE day = ? LIMIT 20000').all(day));
  const jobs = await db.prepare("SELECT source, state, employee_name FROM transfer_jobs WHERE day = ? AND state = 'auto_done'").all(day);
  const cx = await db.prepare('SELECT state, COUNT(*) n FROM apex_cancels WHERE day = ? GROUP BY state').all(day).catch(() => []);
  const cxN = s => cx.filter(x => s.includes(x.state)).reduce((n, x) => n + x.n, 0);
  const tr = app.transferDayStats ? await app.transferDayStats(day, now).catch(() => null) : null;
  const pf = app.perfRange ? await app.perfRange(day, day, now).catch(() => null) : null;
  const adh = (pf?.employees || []).map(e => e.adherencePct).filter(v => v != null);
  return {
    day,
    apex: tr,
    adherencePct: adh.length ? r1(adh.reduce((a, b) => a + b, 0) / adh.length) : null,
    calls: r ? { calls: r.calls, answered: r.answered, abandoned: r.abandoned, sla: r1(r.sla), asa: r1(r.asa), abandonmentRate: r1(r.abandonmentRate), meanCallSeconds: r1(r.meanCallSeconds), afterHours: r.afterHours } : null,
    team: e.length ? { people: e.length, workSeconds: sum('workSeconds'), callSeconds: sum('callSeconds'), breakSeconds: sum('breakSeconds'), overBreak: e.filter(x => (x.breakSeconds || 0) > 1800).length } : null,
    orders: full ? { orders: t.orders ?? null, sales: r1(t.sales), open: t.open ?? null, avgOut: r1(t.avgOut), outCount: t.outCount ?? null, outLate: t.outLate ?? null,
      lateRate: t.delayRateCount ? r1(t.delayRateLate / t.delayRateCount * 100) : null, cancels: t.cancels ?? null, cancelSales: r1(t.cancelSales), discounts: r1(t.discounts), issues: t.issues ?? null } : null,
    kinds: full ? Object.entries(t.kinds || {}).map(([k, n]) => ({ kind: k, name: KIND_NAMES[k] || k, orders: n })) : [],
    branches: (full?.branches || []).map(b => ({ no: b.no, name: b.name, orders: b.orders, sales: r1(b.sales), avgOut: r1(b.avgOut), outCount: b.outCount, outLate: b.outLate,
      lateRate: b.delayRateCount ? r1(b.delayRateLate / b.delayRateCount * 100) : null, cancels: b.cancels, cancelSales: r1(b.cancelSales) })),
    transfers: { talabat: auto.totals.talabat, site: auto.totals.site, byPage: jobs.filter(j => j.employee_name !== 'المرصد آلي').length,
      reasons: auto.reasons.slice(0, 8).map(x => ({ reason: x.reason, orders: x.orders, details: x.details.slice(0, 5) })) },
    apexCancels: { done: cxN(['done']), manual: cxN(['manual', 'failed']), withPilot: cxN(['withPilot']) }
  };
}

// A finished day does not change: kept once computed (the trend reads up to 31 of them).
async function oneKept(app, day, now) {
  const { db } = app, done = day < businessDay(now);
  if (done) {
    const hit = await db.prepare('SELECT data FROM daily_kpi WHERE day = ?').get(day).catch(() => null);
    const v = hit && parseJson(hit.data, null); if (v) return v;
  }
  const v = await one(app, day, now);
  if (done && (v.calls || v.orders)) await db.prepare('INSERT INTO daily_kpi (day, data, at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data, at = excluded.at').run(day, JSON.stringify(v), now).catch(() => {});
  return v;
}

// The eight headline numbers (تصور المؤشرات, Karim 11-14), each with its target.
export function headline(d) {
  const o = d.orders || {}, c = d.calls || {}, a = d.apex || {};
  const v = { sla: c.sla, abandon: c.abandonmentRate, toApexMin: a.toApexMin, autoPct: a.autoPct, avgOut: o.avgOut, latePct: o.lateRate,
    cancelPct: o.orders ? r1(o.cancels / (o.orders + o.cancels) * 100) : null, adherencePct: d.adherencePct };
  return Object.entries(v).map(([key, value]) => ({ key, value: value ?? null, ...TARGETS[key] }));
}
export function judge(t, v) {
  if (v == null || !t) return '';
  const lo = t.min != null && v < t.min, hi = t.max != null && v > t.max;
  if (!lo && !hi) return 'good';
  const span = Math.max(Math.abs((t.max ?? t.min) || 1) * 0.2, 1);
  return (lo ? t.min - v : v - t.max) > span ? 'bad' : 'warn';
}

export async function dailyReport(app, day, now) {
  const before = addDays(day, -7);
  const [cur, prev] = await Promise.all([oneKept(app, day, now), oneKept(app, before, now)]);
  const ph = new Map(headline(prev).map(x => [x.key, x.value]));
  return { day, compareDay: before, generatedAt: iso(now), headline: headline(cur).map(x => ({ ...x, before: ph.get(x.key) ?? null, tone: judge(x, x.value) })), cur, prev };
}

// على مدار الوقت: the eight numbers day by day (up to 62 days), and the targets.
export async function trend(app, from, to, now) {
  const days = []; for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
  const out = [];
  for (const d of days) out.push({ day: d, values: Object.fromEntries(headline(await oneKept(app, d, now)).map(x => [x.key, x.value])) });
  return { from, to, targets: Object.fromEntries(headline({}).map(x => [x.key, { label: x.label, unit: x.unit, min: x.min ?? null, max: x.max ?? null }])), days: out };
}

// The Telegram text: the headline numbers with the change from a week before.
export function dailyText(rep) {
  const c = rep.cur, p = rep.prev, lines = [];
  const fmt = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const ch = (a, b, unit = '') => a == null || b == null || !b ? '' : ' (' + (a >= b ? '+' : '') + fmt(Math.round((a - b) / b * 100)) + '%' + ')';
  const line = (label, a, b, unit = '') => lines.push('• ' + label + ': ' + fmt(a) + unit + ch(a, b));
  lines.push('📊 تقرير يوم ' + rep.day + ' — مقارنة بـ ' + rep.compareDay);
  const dot = { good: '🟢', warn: '🟡', bad: '🔴' };
  if (rep.headline?.length) { lines.push(''); for (const k of rep.headline) if (k.value != null) lines.push((dot[k.tone] || '⚪') + ' ' + k.label + ': ' + fmt(k.value) + (k.unit ? ' ' + k.unit : '') + ch(k.value, k.before)); }
  if (c.calls) { lines.push('', '☎️ الكول سنتر'); line('مكالمات', c.calls.calls, p.calls?.calls); line('اترد عليها', c.calls.answered, p.calls?.answered); line('نسبة الفائتة', c.calls.abandonmentRate, p.calls?.abandonmentRate, '%'); line('الرد خلال 10ث', c.calls.sla, p.calls?.sla, '%'); }
  if (c.orders) {
    lines.push('', '🧾 الأوردرات'); line('أوردرات', c.orders.orders, p.orders?.orders); line('مبيعات', c.orders.sales, p.orders?.sales, ' ج');
    line('متوسط وقت الخروج', c.orders.avgOut, p.orders?.avgOut, ' د'); line('نسبة التأخير', c.orders.lateRate, p.orders?.lateRate, '%'); line('إلغاءات', c.orders.cancels, p.orders?.cancels);
    for (const b of c.branches) lines.push('  – ' + b.name + ': ' + fmt(b.orders) + ' أوردر · خروج ' + fmt(b.avgOut) + ' د · تأخير ' + fmt(b.lateRate) + '% · إلغاء ' + fmt(b.cancels));
  }
  const tr = c.transfers, all = tr.talabat.all + tr.site.all, autoN = tr.talabat.auto + tr.site.auto;
  if (all) {
    lines.push('', '🤖 التحويل على Apex');
    lines.push('• آلي ' + autoN + ' من ' + all + ' (' + Math.round(autoN / all * 100) + '%) — طلبات ' + tr.talabat.auto + '/' + tr.talabat.all + ' · الموقع ' + tr.site.auto + '/' + tr.site.all);
    for (const r of tr.reasons.slice(0, 4)) lines.push('  – ' + r.reason + ': ' + r.orders + (r.details.length ? ' (' + r.details.map(d => d.name).join('، ') + ')' : ''));
  }
  return lines.join('\n').slice(0, 3900);
}

function setup(app) {
  app.route('GET', '/api/daily', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now), day = validDate(String(ctx.query.day || '')) ? ctx.query.day : today;
    if (day > today) app.fail(400, 'اختار يوم صحيح');
    return dailyReport(app, day, ctx.now);
  });
  app.route('GET', '/api/trend', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now), to = validDate(String(ctx.query.to || '')) ? ctx.query.to : today;
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : addDays(to, -27);
    if (from > to || to > today) app.fail(400, 'اختار فترة صحيحة');
    return trend(app, from, to, ctx.now);
  });
}
export { setup };
