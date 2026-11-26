import { addDays, businessDay, validDate } from './time.js';
import { parseJson } from './order-match.js';
import { branchName, COMPLAINT_TYPES, DEPARTMENTS } from './cs.js';

const BRANCHES = ['مدينة نصر', 'التجمع', 'مدينتي'];
const UNKNOWN = 'غير محدد';
const GROUPS = [
  ['جودة الأكل', /جوده|بارد|محروق|نيء|مش مستوي|تسويه|طعم|رائحه/],
  ['تأخير التجهيز', /تاخير (?:في )?(?:التجهيز|التحضير)/],
  ['تأخير التوصيل', /تاخير (?:في )?التوصيل|اتاخرت? (?:في )?التوصيل/],
  ['تأخير غير محدد', /تاخير|اتاخرت?|متاخر/],
  ['صنف ناقص أو غلط', /ناقص|ناقصه|غلط|صنف (?:تاني|خاطئ)|خطا في الطلب/],
  ['تغليف أو انسكاب', /تغليف|انسكاب|مسكوب|تسريب|اتكب/],
  ['تعامل وخدمة', /تعامل|اسلوب|سوء خدمه|رد الموظف/],
  ['دفع أو سعر', /دفع|سعر|فلوس|فاتوره|خصم|فيزا/],
  ['إلغاء الطلب', /الغاء|اتلغي|طلب مرفوض/],
];
const normalize = value => String(value || '').normalize('NFKC').replace(/[\p{M}ـ]/gu, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const typeOf = row => {
  if (COMPLAINT_TYPES.includes(row.complaint_type)) return row.complaint_type;
  const label = normalize(row.complaint);
  const hits = GROUPS.filter(([, pattern]) => pattern.test(label)).map(([name]) => name);
  const specific = hits.filter(name => name !== 'تأخير غير محدد' || !hits.some(n => n === 'تأخير التجهيز' || n === 'تأخير التوصيل'));
  return specific.length === 1 ? specific[0] : UNKNOWN;
};
const share = (count, total) => total > 0 ? Math.round(count / total * 10000) / 100 : null;
const branchOf = label => {
  const canonical = branchName(label);
  return BRANCHES.includes(canonical) ? canonical : UNKNOWN;
};
const empty = () => ({ orders: 0, apexDays: 0, complaints: 0, contacted: 0, actions: 0, linked: 0, uncovered: 0, ratings: 0, ratingTotal: 0, lowRatings: 0 });
const breakdown = (rows, key) => {
  const grouped = new Map();
  for (const r of rows) {
    const labels = key(r), k = JSON.stringify(labels);
    const entry = grouped.get(k) || { labels, count: 0, contacted: 0, actions: 0 };
    entry.count++;
    entry.contacted += Number(r.contacted);
    entry.actions += Number(r.action);
    grouped.set(k, entry);
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count || a.labels.join(' ').localeCompare(b.labels.join(' '), 'ar'))
    .map(r => ({ ...r, pct: share(r.count, rows.length) }));
};

export function complaintPerformance({ from, to, snapshots, complaints, ratings, website = [] }) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  const byDay = new Map(days.map(day => [day, { day, orders: 0, covered: false, complaints: 0, uncertainBranch: false }]));
  const branchDays = new Map([...BRANCHES, UNKNOWN].map(branch => [branch, new Map(days.map(day => [day, { day, orders: null, complaints: 0 }]))]));
  const branches = new Map([...BRANCHES, UNKNOWN].map(b => [b, { name: b, ...empty() }]));
  const coverage = new Set();
  for (const row of snapshots) {
    const totals = new Map();
    for (const b of parseJson(row.branches, [])) {
      const name = branchOf(b.name);
      if (name === UNKNOWN || b.orders == null || !Number.isFinite(Number(b.orders)) || Number(b.orders) < 0) continue;
      totals.set(name, (totals.get(name) || 0) + Number(b.orders));
    }
    for (const [name, orders] of totals) {
      const b = branches.get(name);
      b.orders += orders;
      b.apexDays++;
      coverage.add(row.day + '|' + name);
      branchDays.get(name).get(row.day).orders = orders;
    }
    const day = byDay.get(row.day);
    if (day) { day.orders = [...totals.values()].reduce((sum, n) => sum + n, 0); day.covered = totals.size === BRANCHES.length; }
  }
  const classified = complaints.map(r => ({
    day: r.day, branch: branchOf(r.branch || r.link_branch), channel: r.platform || UNKNOWN,
    type: typeOf(r), department: DEPARTMENTS.includes(r.department) ? r.department : UNKNOWN,
    contacted: r.reached === 'تم التواصل', action: !!String(r.action || '').trim(), linked: !!r.apex_no,
    recorder: r.by_name || UNKNOWN,
  }));
  for (const r of classified) {
    const b = branches.get(r.branch);
    b.complaints++;
    b.contacted += Number(r.contacted);
    b.actions += Number(r.action);
    b.linked += Number(r.linked);
    if (!coverage.has(r.day + '|' + r.branch)) b.uncovered++;
    if (byDay.has(r.day)) {
      const day = byDay.get(r.day);
      day.complaints++;
      if (r.branch === UNKNOWN) day.uncertainBranch = true;
      branchDays.get(r.branch).get(r.day).complaints++;
    }
  }
  for (const r of ratings) {
    const b = branches.get(branchOf(r.branch));
    b.ratings += Number(r.n) || 0;
    b.ratingTotal += Number(r.total) || 0;
    b.lowRatings += Number(r.low) || 0;
  }
  const web = new Map();
  for (const r of website) {
    const branch = branchOf(r.branch), b = web.get(branch) || { count: 0, seconds: 0, deliveryN: 0, dispatch: 0, branchDispatch: 0, extensionDispatch: 0 };
    for (const key of Object.keys(b)) b[key] += Number(r[key]) || 0;
    web.set(branch, b);
  }
  const websiteStats = [...web].map(([name, b]) => ({ name, ...b,
    deliveryMinutes: b.deliveryN ? Math.round(b.seconds / b.deliveryN / 60) : null,
    unknownDispatch: b.dispatch - b.branchDispatch - b.extensionDispatch,
  }));
  const group = rows => ({
    types: breakdown(rows, r => [r.type]),
    departments: breakdown(rows, r => [r.department]),
    channels: breakdown(rows, r => [r.channel]),
    channelTypes: breakdown(rows, r => [r.channel, r.type]),
    recorders: breakdown(rows, r => [r.recorder]),
  });
  const metrics = b => ({ ...b, orders: b.apexDays ? b.orders : null,
    rate: b.apexDays === days.length && !b.uncovered ? share(b.complaints, b.orders) : null,
    contactPct: share(b.contacted, b.complaints), actionPct: share(b.actions, b.complaints),
    rating: b.ratings ? Math.round(b.ratingTotal / b.ratings * 100) / 100 : null,
  });
  const all = [...branches.values()];
  const total = empty();
  for (const b of all) for (const key of Object.keys(total)) total[key] += b[key];
  total.apexDays = [...byDay.values()].filter(d => d.covered).length;
  return {
    from, to, days: days.length,
    totals: metrics(total),
    branches: all.filter(b => b.name !== UNKNOWN || b.complaints || b.ratings).map(b => ({
      ...metrics(b), ...group(classified.filter(r => r.branch === b.name)),
      daily: [...branchDays.get(b.name).values()].map(r => ({ ...r, rate: share(r.complaints, r.orders) })),
    })),
    daily: [...byDay.values()].map(d => ({ day: d.day, complaints: d.complaints, orders: d.covered ? d.orders : null,
      rate: d.covered && !d.uncertainBranch ? share(d.complaints, d.orders) : null })),
    website: websiteStats,
    ...group(classified),
  };
}

export function setupComplaintPerformance(app) {
  const { db, fail } = app;
  app.route('GET', '/api/reports/complaint-performance', async ctx => {
    await app.requireAdmin(ctx);
    const to = String(ctx.query.to || ''), from = String(ctx.query.from || '');
    if (!validDate(from) || !validDate(to) || from > to || to > businessDay(ctx.now) || to >= addDays(from, 62)) fail(400, 'اختار فترة لحد 62 يوم');
    const [snapshots, complaints, ratings, website] = await Promise.all([
      db.prepare("SELECT day, json_extract(data, '$.branches') AS branches FROM orders_days WHERE day BETWEEN ? AND ?").all(from, to),
      db.prepare(`SELECT e.day,e.branch,e.platform,e.complaint,e.complaint_type,e.department,e.reached,e.action,e.by_name,l.apex_no,l.branch AS link_branch
        FROM cs_entries e LEFT JOIN cs_links l ON l.entry_id=e.id
        WHERE e.day BETWEEN ? AND ? AND NULLIF(TRIM(e.complaint),'') IS NOT NULL`).all(from, to),
      db.prepare(`SELECT branch, COUNT(*) n, SUM(rating) total, SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) low FROM (
        SELECT branch,rating FROM talabat_reviews WHERE day BETWEEN ? AND ?
        UNION ALL SELECT o.branch,r.rating FROM site_ratings r JOIN site_orders o ON o.id=r.order_id WHERE o.day BETWEEN ? AND ?
        UNION ALL SELECT o.branch,r.rating FROM site_reviews r LEFT JOIN site_orders o ON o.id=r.order_id WHERE r.day BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM site_ratings sr WHERE sr.order_id=r.order_id)
      ) WHERE rating BETWEEN 1 AND 5 GROUP BY branch`).all(from, to, from, to, from, to),
      db.prepare(`SELECT o.branch, COUNT(*) count,
        SUM(CASE WHEN o.out_at IS NOT NULL THEN 1 ELSE 0 END) dispatch,
        SUM(CASE WHEN o.out_at IS NOT NULL AND d.actor = 'branch' THEN 1 ELSE 0 END) branchDispatch,
        SUM(CASE WHEN o.out_at IS NOT NULL AND d.actor = 'extension' THEN 1 ELSE 0 END) extensionDispatch,
        SUM(CASE WHEN o.delivered_at > o.out_at THEN 1 ELSE 0 END) deliveryN,
        SUM(CASE WHEN o.delivered_at > o.out_at THEN (o.delivered_at-o.out_at)/1000.0 ELSE 0 END) seconds
        FROM site_orders o LEFT JOIN site_dispatch_actors d ON d.site_id = o.id WHERE o.day BETWEEN ? AND ?
        AND LOWER(o.fulfillment) = 'delivery' AND o.status NOT IN ('failed','wallet-failed','checkout-draft','trash','cancelled','refunded')
        GROUP BY o.branch`).all(from, to),
    ]);
    return complaintPerformance({ from, to, snapshots, complaints, ratings, website });
  });
}
