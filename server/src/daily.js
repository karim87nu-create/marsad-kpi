// تقرير اليوم (Karim 11-14: «تقرير يوم واحد شامل … مقارنة بالأيام اللي فاتت … يتبعت على تليجرام»): one day — the calls,
// the team, the orders by kind and branch, the transfers to Apex (automatic or by staff), the cancellations — each number
// next to the same weekday a week before. The admin page shows it; the manager's Telegram group gets it at the day's end.
import { businessDay, addDays, validDate, isOperating, iso } from './time.js';
import { parseJson } from './order-match.js';
import { autoReport } from './autotransfer.js';

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
  return {
    day,
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

export async function dailyReport(app, day, now) {
  const before = addDays(day, -7);
  const [cur, prev] = await Promise.all([one(app, day, now), one(app, before, now)]);
  return { day, compareDay: before, generatedAt: iso(now), cur, prev };
}

// The Telegram text: the headline numbers with the change from a week before.
export function dailyText(rep) {
  const c = rep.cur, p = rep.prev, lines = [];
  const fmt = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const ch = (a, b, unit = '') => a == null || b == null || !b ? '' : ' (' + (a >= b ? '+' : '') + fmt(Math.round((a - b) / b * 100)) + '%' + ')';
  const line = (label, a, b, unit = '') => lines.push('• ' + label + ': ' + fmt(a) + unit + ch(a, b));
  lines.push('📊 تقرير يوم ' + rep.day + ' — مقارنة بـ ' + rep.compareDay);
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
}
export { setup };
