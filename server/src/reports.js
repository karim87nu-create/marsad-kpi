// التقارير اليومية (Karim 11-16: «تقارير يوميه عايزها كل يوم اعرف اسحبها اكسل لليوم الي قبله أو لو هحدد فتره»): the
// numbers behind the call center's own daily sheets, one compact line per day, for the admin page to write the Excel
// files: the call center report, the branches' sales by platform and payment, the orders by branch and source, the
// cancellations, Talabat's closing time. From Apex (the cashier monitor's day), Arabicss, the website and Talabat.
// A finished day is kept once built.
import { businessDay, addDays, validDate } from './time.js';
import { parseJson } from './order-match.js';

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const ORDER_QUEUE = '7671';   // «طلب أوردر»: a missed call there is an order that may be lost

export async function reportDay(app, day, now) {
  const { db } = app;
  const row = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
  const full = parseJson(row?.data, null);
  // Calls (Arabicss): totals, missed (not the short ones), after hours, the missed on the order queue.
  let calls = null;
  try {
    const d = await app.heavy('day', day, now), r = d?.history?.report;
    if (r) calls = { calls: r.calls, answered: r.answered, abandoned: r.abandoned, afterHours: r.afterHours,
      orderQueueMissed: (d.history.queues || []).filter(q => String(q.queue) === ORDER_QUEUE).reduce((n, q) => n + (q.abandoned || 0), 0) };
  } catch {}
  const branches = new Map(), B = name => branches.get(name) || branches.set(name, { name, kinds: {}, sales: [], offers: { talabat: 0, site: 0 }, site: { app: 0, web: 0, other: 0 }, cancels: {} }).get(name);
  for (const b of full?.branches || []) { Object.assign(B(b.name).kinds, b.kinds || {}); if (b.sources) B(b.name).sources = { whatsapp: Number(b.sources.whatsapp) || 0, page: Number(b.sources.page) || 0 }; }
  for (const s of full?.sales || []) B(s.branch).sales.push({ kind: s.kind, pay: s.pay, trans: s.trans, orders: s.orders, sales: r2(s.sales), discounts: r2(s.discounts) });
  // Offers: Talabat's offer lines («عرض … طلبات», each one), the website's orders with an offer (Karim's sheets).
  const online = full?.online || [];
  const via = new Map();
  const siteIds = online.filter(o => o.kind === 'الموقع' && /^\d+$/.test(String(o.tag || ''))).map(o => Number(o.tag));
  for (let i = 0; i < siteIds.length; i += 90) {
    const part = siteIds.slice(i, i + 90);
    for (const r of await db.prepare('SELECT id, via FROM site_channels WHERE id IN (' + part.map(() => '?').join(',') + ')').all(...part).catch(() => [])) via.set(r.id, r.via);
  }
  for (const o of online) {
    const items = (o.items || []).filter(Boolean), b = B(o.branch);
    if (o.kind === 'طلبات') b.offers.talabat += items.filter(i => /عرض/.test(i.name) && /طلبات/.test(i.name)).reduce((n, i) => n + (Number(i.qty) || 0), 0);
    if (o.kind === 'الموقع') {
      if (items.some(i => /عرض/.test(i.name) || /موقع/.test(i.name))) b.offers.site++;
      const v = String(via.get(Number(o.tag)) || '');
      b.site[/rest-api|app/i.test(v) ? 'app' : /checkout|store-api|admin/i.test(v) ? 'web' : 'other']++;
    }
  }
  const det = full?.details || {};
  const cancels = (full?.cancels || []).map(c => { B(c.branch).cancels[c.kind] = (B(c.branch).cancels[c.kind] || 0) + 1;
    // Karim 11-16: a Hotline order taken on WhatsApp / the page says so next to the customer's name.
    const nm = String(c.customer?.name || ''), src = c.kind !== 'Hotline' ? null : /وات?س|whats/i.test(nm) ? 'whatsapp' : /بيدج|بيج|فيس|page|facebook/i.test(nm) ? 'page' : null;
    return { no: c.no, sn: c.sn, kind: c.kind, src, branch: c.branch, amount: r2(c.amount), at: c.at, reason: c.reasonName || c.reason || null, area: String(det[c.no]?.loc || '').replace(/\.$/, '') || null }; });
  // Talabat's closing time: the last time each branch closed or went busy that day.
  const closes = await db.prepare('SELECT branch, name, outlet, started_at FROM talabat_closures WHERE day = ? ORDER BY started_at').all(day).catch(() => []);
  const closedAt = {}; for (const c of closes) closedAt[c.branch || c.name || c.outlet] = c.started_at;
  return { day, linked: !!full, calls, hotline: full?.totals?.kinds?.Hotline ?? null, orders: full?.totals?.orders ?? null, sales: full ? r2(full.totals?.sales) : null, branches: [...branches.values()], cancels, closedAt };
}

function setup(app) {
  const { db } = app;
  app.route('GET', '/api/reports/days', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now), to = validDate(String(ctx.query.to || '')) ? ctx.query.to : addDays(today, -1);
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : to;
    if (from > to || to > today) app.fail(400, 'اختار فترة صحيحة');
    const days = []; for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
    const out = [];
    for (const d of days) {
      const done = d < today;
      if (done) { const hit = parseJson((await db.prepare('SELECT data FROM report_days WHERE day = ?').get(d).catch(() => null))?.data, null); if (hit) { out.push(hit); continue; } }
      const v = await reportDay(app, d, ctx.now);
      // Kept only when the day is complete (Apex and the calls both there), so a day read early is built again.
      if (done && v.linked && v.calls) await db.prepare('INSERT INTO report_days (day, data, at) VALUES (?,?,?) ON CONFLICT(day) DO UPDATE SET data = excluded.data, at = excluded.at').run(d, JSON.stringify(v), ctx.now).catch(() => {});
      out.push(v);
    }
    return { from, to, days: out };
  });
}

export { setup };
