// التقارير اليومية (Karim 11-16: «تقارير يوميه عايزها كل يوم اعرف اسحبها اكسل لليوم الي قبله أو لو هحدد فتره»): the
// numbers behind the call center's own daily sheets, one compact line per day, for the admin page to write the Excel
// files: the call center report, the branches' sales by platform and payment, the orders by branch and source, the
// cancellations, Talabat's closing time. From Apex (the cashier monitor's day), Arabicss, the website and Talabat.
// A finished day is kept once built.
import { businessDay, addDays, validDate, iso } from './time.js';
import { parseJson } from './order-match.js';
import { apexReportCancelOwner } from './cancels.js';
import { branchName } from './cs.js';
import { BRANCHES as TALABAT_BRANCHES } from './stock.js';

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const ORDER_QUEUE = '7671';   // «طلب أوردر»: a missed call there is an order that may be lost

// Talabat has localized and older owner labels. Explicit ownership wins; a generic reason cannot establish ownership.
function cancellationOwner(value, reason, reviewed, status) {
  const clean = s => String(s || '').trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ً-ْ]/g, '').toLowerCase();
  if (/^(?:REJECTED|(?:الطلب|طلب) مرفوض)$/i.test(status || '') || /(?:^|\s)(?:الطلب|طلب)\s+مرفوض(?:$|\s|[.:：،—-])/.test(clean(reason)))
    return { owner: 'Vendor', ownerEvidence: 'طلب مرفوض على المنصة' };
  const raw = clean(value).replace(/^(?:owner|cancelled by|canceled by|الالغاء على|صاحب الالغاء)\s*[:：]\s*/, '').trim();
  const labels = raw.split(/[()[\]/]+/).map(x => x.trim()).filter(Boolean);
  if (labels.length && labels.every(label => /^(?:vendor|restaurant|merchant|store|المطعم|الفرع|المتجر)$/.test(label)))
    return { owner: 'Vendor', ownerEvidence: 'تحديد المنصة' };
  if (raw && !/^(?:unknown|n\/a|[-—]|غير معروف|غير محدد)$/.test(raw)) return { owner: raw, ownerEvidence: 'تحديد المنصة' };
  if (reviewed === 'branch') return { owner: 'Vendor', ownerEvidence: 'مسؤولية الفرع مؤكدة في مراجعة الإلغاء' };
  if (reviewed) return { owner: reviewed, ownerEvidence: 'مراجعة الإلغاء' };
  if (/(?:^(?:(?:cancelled|canceled|rejected) by (?:the )?(?:vendor|restaurant|merchant|store)|(?:الالغاء|الرفض|تم الالغاء|تم الرفض) (?:من (?:قبل )?|على )(?:المطعم|الفرع))(?:\s|:|$))/.test(clean(reason)))
    return { owner: 'Vendor', ownerEvidence: 'سبب الإلغاء في المنصة' };
  return { owner: null, ownerEvidence: null };
}


export async function reportDay(app, day, now) {
  const { db } = app;
  const row = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
  const full = parseJson(row?.data, null);
  // Calls (Arabicss): totals, missed (not the short ones), after hours, the missed on the order queue.
  let calls = null;
  try {
    const d = await app.heavy('day', day, now), r = d?.history?.report;
    if (r) calls = { calls: r.calls, recordedCalls: r.recordedCalls ?? r.calls, shortAbandoned: r.shortAbandoned ?? 0, answered: r.answered, abandoned: r.abandoned, afterHours: r.afterHours,
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
  app.route('GET', '/api/reports/platform-cancels', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now), to = String(ctx.query.to || ''), from = String(ctx.query.from || '');
    if (!validDate(from) || !validDate(to) || from > to || to > today || to >= addDays(from, 62)) app.fail(400, 'اختار فترة صحيحة');
    const [talabat, site] = await Promise.all([
      db.prepare(`SELECT day, vendor_id, store, COUNT(*) AS n FROM talabat_orders
        WHERE day BETWEEN ? AND ? GROUP BY day, vendor_id, store`).all(from, to),
      db.prepare(`SELECT day, branch, c.via, COUNT(*) AS n FROM site_orders
        LEFT JOIN site_channels c USING (id) WHERE day BETWEEN ? AND ?
        AND status NOT IN ('failed','wallet-failed','checkout-draft','trash') GROUP BY day, branch, c.via`).all(from, to),
    ]);
    const [talabatCancels, siteCancels, ratingSnapshots, apexDays, apexReviews] = await Promise.all([
      db.prepare(`SELECT t.day, t.id, t.code, t.vendor_id, t.store, t.status, t.cancelled_at, t.cancel_owner, t.cancel_reason, t.total, t.subtotal, o.owner AS reviewed_owner
        FROM talabat_orders t LEFT JOIN cancel_owners o ON o.key = 'talabat:' || t.id
        WHERE t.day BETWEEN ? AND ? AND (t.status IN ('CANCELLED','REJECTED','طلب مرفوض','الطلب مرفوض') OR (t.cancelled_at IS NOT NULL AND t.cancel_reason LIKE '%طلب مرفوض%'))`).all(from, to),
      db.prepare(`SELECT day, id, branch, gone_at, status, total, c.via FROM site_orders
        LEFT JOIN site_channels c USING (id) WHERE day BETWEEN ? AND ? AND status = 'cancelled'`).all(from, to),
      db.prepare(`SELECT day, branch, side, rate FROM talabat_ratings
        WHERE day BETWEEN ? AND ? AND rate > 0 AND rate <= 5 ORDER BY day DESC, at DESC`).all(addDays(from, -30), to),
      db.prepare(`SELECT day, json_extract(data, '$.branches') AS branches, json_extract(data, '$.cancels') AS cancels FROM orders_days WHERE day BETWEEN ? AND ?`).all(from, to),
      db.prepare("SELECT day, ref, owner FROM cancel_owners WHERE source = 'apex' AND day BETWEEN ? AND ?").all(from, to),
    ]);
    const talBranch = x => branchName(TALABAT_BRANCHES.find(b => b.outlet.split(';').at(-1) === String(x.vendor_id || '').split(';').at(-1))?.name || x.store);
    const sitePlatform = x => /rest-api|app/i.test(x.via || '') ? 'APP' : 'WEB';
    const platformTotals = [
      ...talabat.map(x => ({ day: x.day, branch: talBranch(x), platform: 'Talabat', orders: x.n })),
      ...site.filter(x => sitePlatform(x) === 'APP').map(x => ({ day: x.day, branch: branchName(x.branch), platform: 'APP', orders: x.n })),
    ];
    const list = [
      ...talabatCancels.map(x => ({ day: x.day, orderNo: x.id, code: x.code, branch: talBranch(x), platform: 'Talabat', status: x.status, at: iso(x.cancelled_at),
        amount: x.total ?? x.subtotal, reason: x.cancel_reason, ...cancellationOwner(x.cancel_owner, x.cancel_reason, x.reviewed_owner, x.status) })),
      ...siteCancels.filter(x => sitePlatform(x) === 'APP').map(x => ({ day: x.day, orderNo: String(x.id), branch: branchName(x.branch), platform: 'APP', status: x.status, amount: x.total, reason: null, owner: null })),
    ];
    const reviewed = new Map(apexReviews.map(x => [x.day + '|' + x.ref, x.owner]));
    for (const { day, branches, cancels } of apexDays) {
      for (const b of parseJson(branches, [])) {
        const branch = branchName(b.name), whatsapp = Number(b.sources?.whatsapp) || 0;
        const hotline = Math.max(0, (Number(b.kinds?.Hotline) || 0) - whatsapp - (Number(b.sources?.page) || 0));
        platformTotals.push({ day, branch, platform: 'Hotline', orders: hotline }, { day, branch, platform: 'Whatsapp', orders: whatsapp });
      }
      const orders = new Map(parseJson(cancels, []).map(c => [String(c.no), c]));
      for (const [no, c] of orders) {
        if (c.kind !== 'Hotline') continue;
        const name = String(c.customer?.name || '');
        if (c.src === 'page' || /بيدج|بيج|فيس|page|facebook/i.test(name)) continue;
        const platform = c.src === 'whatsapp' || /وات?س|whats/i.test(name) ? 'Whatsapp' : 'Hotline';
        list.push({ day, orderNo: no, branch: branchName(c.branch), platform, at: c.at, amount: c.amount,
          area: c.area || null,
          reason: [c.reasonName, c.reason].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(' — ') || null,
          owner: apexReportCancelOwner(c, reviewed.get(day + '|' + no)) });
      }
    }
    const dates = new Map();
    for (let day = from; day <= to; day = addDays(day, 1)) dates.set(day, { day, closedAt: {} });
    const closures = await db.prepare('SELECT day, branch, name, outlet, started_at FROM talabat_closures WHERE day BETWEEN ? AND ? ORDER BY started_at').all(from, to);
    for (const row of closures) dates.get(row.day).closedAt[talBranch({ vendor_id: row.outlet, store: row.branch || row.name || row.outlet })] = row.started_at;
    return { days: [...dates.values()], ratingSnapshots, list: list.sort((a, b) => b.day.localeCompare(a.day) || (b.at || '').localeCompare(a.at || '')), platformTotals };
  });
  app.route('GET', '/api/reports/days', async ctx => {
    await app.requireAdmin(ctx);
    const today = businessDay(ctx.now), to = validDate(String(ctx.query.to || '')) ? ctx.query.to : addDays(today, -1);
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : to;
    if (from > to || to > today) app.fail(400, 'اختار فترة صحيحة');
    const days = []; for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
    const out = [];
    for (const d of days) {
      const done = d < today;
      if (done) { const hit = parseJson((await db.prepare('SELECT data FROM report_days WHERE day = ?').get(d).catch(() => null))?.data, null); if (hit?.calls?.recordedCalls != null) { out.push(hit); continue; } }
      const v = await reportDay(app, d, ctx.now);
      // Kept only when the day is complete (Apex and the calls both there), so a day read early is built again.
      if (done && v.linked && v.calls) await db.prepare('INSERT INTO report_days (day, data, at) VALUES (?,?,?) ON CONFLICT(day) DO UPDATE SET data = excluded.data, at = excluded.at').run(d, JSON.stringify(v), ctx.now).catch(() => {});
      out.push(v);
    }
    return { from, to, days: out };
  });
}

export { setup };
