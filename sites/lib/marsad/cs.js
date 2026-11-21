// خدمة العملاء (Karim 11-16: «صفحه تصدير لشيت خدمه العملاء ويبقي صفحه زي كده في التقرير ويتبني عليه الارقام»): the
// sheet the team fills by hand today — each comment, complaint or rating from Talabat, the website or a call, the branch,
// the customer, whether they were reached and what was done — and each branch's Talabat rating of the day next to the
// competitor's. Entered here; the reports and the Excel files count from it.
import { businessDay, validDate, iso } from './time.js';

export const PLATFORMS = ['طلبات', 'الموقع', 'الكول سنتر', 'وفرها'];
export const REACHED = ['تم التواصل', 'عدم الرد', 'مقفول', 'لا'];
// The three branches as the page writes them (Apex writes «مدينتى»; Talabat «سيتي ستار»).
export const branchName = v => { const t = String(v || ''); return /مدينة نصر|سيتي ستار|مكرم|city ?stars|nasr/i.test(t) ? 'مدينة نصر' : /التجمع|البنفسج|tagamo|settlement/i.test(t) ? 'التجمع' : /مدينت[يى]|ساوث بارك|madinaty/i.test(t) ? 'مدينتي' : (t || null); };
const prevDay = d => new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);

function setup(app) {
  const { db, fail } = app;
  const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n) || null;
  const shape = (r, l) => ({ id: r.id, day: r.day, platform: r.platform, branch: r.branch, customer: r.customer, phone: r.phone, orderNo: r.order_no, rating: r.rating,
    comment: r.comment, complaint: r.complaint, reached: r.reached, action: r.action, by: r.by_name, at: iso(r.updated_at),
    link: l ? { platform: l.platform, apexNo: l.apex_no, sn: l.sn, branch: l.branch, employee: l.employee, pilot: l.pilot, at: iso(l.at), out: iso(l.out_at) } : null });

  // Karim 11-16 «الشكوى تتربط بالأوردر»: the order number the customer gives (Talabat's number or its #code, the website's
  // order, or Apex's number / serial) → the Apex order: its branch, who entered it and the pilot. That day and the day before.
  async function orderOf(no, day, platform) {
    const q = String(no || '').replace(/\D/g, ''); if (!q || !validDate(day)) return null;
    const names = app.apexNameMap ? await app.apexNameMap() : {}, nm = u => u ? names[u] || u : null;
    for (const d of [day, prevDay(day)]) {
      let snap = null; try { snap = JSON.parse((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(d))?.data || 'null'); } catch {}
      const late = new Map((snap?.lateOut || []).map(x => [String(x.no), x]));
      const of = (platform, a, branch) => a ? { platform, apexNo: String(a.no), sn: a.sn != null ? String(a.sn).replace(/\.0+$/, '') : null, branch: branchName(a.branch || branch), employee: nm(a.user),
        pilot: nm(a.pilot || late.get(String(a.no))?.pilot) || null, at: a.at ? Date.parse(a.at) : null, out: a.out ? Date.parse(a.out) : null, day: d }
        : { platform, apexNo: null, sn: null, branch: branchName(branch), employee: null, pilot: null, at: null, out: null, day: d };
      const tal = !platform || platform === 'طلبات' ? await db.prepare('SELECT id, store FROM talabat_orders WHERE day = ? AND (id = ? OR code = ?) ORDER BY (id = ?) DESC LIMIT 1').get(d, q, q, q) : null;
      if (tal) { const m = app.talabat ? await app.talabat.matchDay(d).catch(() => null) : null; return of('طلبات', m?.matches.get(tal.id), tal.store); }
      if (!platform || platform === 'الموقع') {
        const site = await db.prepare('SELECT id, branch FROM site_orders WHERE day = ? AND id = ?').get(d, Number(q)).catch(() => null);
        if (site && app.site) {
          const rows = await db.prepare('SELECT * FROM site_orders WHERE day = ?').all(d);
          const m = await app.site.apexMatch(d, rows).catch(() => null), a = m?.matches.get(site.id);
          const full = a && (snap?.online || []).find(x => String(x.no) === String(a.no));
          return of('الموقع', a ? { ...full, ...a, user: full?.user || a.user } : null, site.branch);
        }
      }
      if (platform === 'طلبات' || platform === 'الموقع') continue;
      // Apex's own number or the serial the branch sees.
      const lists = ['online', 'open', 'lateOut', 'cancels'].flatMap(k => snap?.[k] || []);
      const a = lists.find(x => String(x.no) === q) || lists.find(x => String(x.sn ?? '').replace(/\.0+$/, '') === q);
      if (a) return of(a.kind === 'طلبات' ? 'طلبات' : a.kind === 'الموقع' ? 'الموقع' : a.kind === 'وفرها' ? 'وفرها' : 'الكول سنتر', { ...a, at: a.at || a.entry }, a.branch);
    }
    return null;
  }
  app.csOrderOf = orderOf;
  app.route('GET', '/api/cs/order', async ctx => {
    await app.requireAdmin(ctx, 'csRead');
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    return { order: await orderOf(ctx.query.no, day, ctx.query.platform) };
  });
  const saveLink = async (id, v) => {
    const l = v.orderNo ? await orderOf(v.orderNo, v.day, v.platform) : null;
    if (!l) { await db.prepare('DELETE FROM cs_links WHERE entry_id = ?').run(id); return null; }
    await db.prepare('INSERT INTO cs_links (entry_id, platform, apex_no, sn, branch, employee, pilot, at, out_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET platform = excluded.platform, apex_no = excluded.apex_no, sn = excluded.sn, branch = excluded.branch, employee = excluded.employee, pilot = excluded.pilot, at = excluded.at, out_at = excluded.out_at')
      .run(id, l.platform, l.apexNo, l.sn, l.branch, l.employee, l.pilot, l.at, l.out);
    return l;
  };

  app.route('GET', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'csRead');
    const to = validDate(String(ctx.query.to || '')) ? ctx.query.to : businessDay(ctx.now);
    const from = validDate(String(ctx.query.from || '')) && ctx.query.from <= to ? ctx.query.from : to;
    const rows = await db.prepare('SELECT * FROM cs_entries WHERE day BETWEEN ? AND ? ORDER BY day DESC, id DESC LIMIT 5000').all(from, to);
    const links = new Map((await db.prepare('SELECT l.* FROM cs_links l JOIN cs_entries e ON e.id = l.entry_id WHERE e.day BETWEEN ? AND ?').all(from, to).catch(() => [])).map(l => [l.entry_id, l]));
    const manual = await db.prepare('SELECT * FROM cs_branch_day WHERE day BETWEEN ? AND ? ORDER BY day, branch').all(from, to);
    // Karim 11-16: no typing — Talabat's public pages give each day's rating; one typed by hand stays first.
    const auto = app.talabatRatings ? await app.talabatRatings(from, to) : [], key = (d, b) => d + '|' + b, ratings = new Map();
    for (const r of auto) { const x = ratings.get(key(r.day, r.branch)) || { day: r.day, branch: r.branch, rating: null, competitor: null, by: 'طلبات (تلقائي)' }; x[r.side === 'ours' ? 'rating' : 'competitor'] = r.rate; ratings.set(key(r.day, r.branch), x); }
    // «التقييم» of a branch's day: the average of that day's reviews on the portal when there are some (Karim's sheet), else the store's rating.
    const reviews = app.talabatReviews ? await app.talabatReviews(from, to) : [];
    const dayAvg = new Map(); for (const r of reviews) if (r.rating != null) { const k = key(r.day, r.branch), x = dayAvg.get(k) || { s: 0, n: 0 }; x.s += r.rating; x.n++; dayAvg.set(k, x); }
    for (const [k, x] of dayAvg) { const [day, branch] = k.split('|'), v = ratings.get(k) || { day, branch, rating: null, competitor: null, by: 'طلبات (تلقائي)' }; v.rating = Math.round(x.s / x.n * 100) / 100; v.reviews = x.n; ratings.set(k, v); }
    for (const r of manual) { const x = ratings.get(key(r.day, r.branch)) || { day: r.day, branch: r.branch }; ratings.set(key(r.day, r.branch), { ...x, rating: r.rating ?? x.rating ?? null, competitor: r.competitor ?? x.competitor ?? null, by: r.by_name }); }
    // The website's customer ratings (the app's rating of each order, and the review form), with the order's branch.
    const site = [
      ...(await db.prepare('SELECT r.order_id, r.rating, r.comment, o.day, o.branch FROM site_ratings r JOIN site_orders o ON o.id = r.order_id WHERE o.day BETWEEN ? AND ?').all(from, to))
        .map(r => ({ day: r.day, platform: 'الموقع', branch: branchName(r.branch), orderNo: String(r.order_id), rating: r.rating, comment: r.comment, auto: 'rating' })),
      ...(await db.prepare('SELECT r.*, o.branch FROM site_reviews r LEFT JOIN site_orders o ON o.id = r.order_id WHERE r.day BETWEEN ? AND ?').all(from, to))
        .map(r => ({ day: r.day, platform: 'الموقع', branch: branchName(r.branch), orderNo: r.order_id == null ? null : String(r.order_id), customer: r.reviewer, phone: r.phone, rating: r.rating, comment: r.review ? [r.product, r.review].filter(Boolean).join(': ') : null, auto: 'review' }))];
    const talabat = reviews.map(r => ({ day: r.day, platform: 'طلبات', branch: branchName(r.branch), orderNo: r.order_id, rating: r.rating, comment: r.text, auto: 'talabat' }));
    // Karim 11-16 «التعليقات الايجابيه ... نخليها تلقائي»: every 5-star rating with words, from Talabat and the website.
    const positive = [...talabat, ...site].filter(r => r.rating === 5 && r.comment && String(r.comment).trim().length >= 2)
      .map(r => ({ day: r.day, platform: r.platform, branch: branchName(r.branch), customer: r.customer || null, orderNo: r.orderNo || null, comment: r.comment }));
    const entries = rows.map(r => shape(r, links.get(r.id)));
    const orderKey = (platform, no) => no ? platform + ':' + String(no).replace(/^#\s*/, '') : null;
    const latest = new Map();
    for (const e of entries) {
      const k = orderKey(e.platform, e.orderNo);
      if (k && !latest.has(k)) latest.set(k, e);
    }
    const matched = new Set();
    const platformFeedback = [...talabat, ...site].map(r => {
      const e = latest.get(orderKey(r.platform, r.orderNo));
      if (!e || matched.has(e.id)) return r;
      matched.add(e.id);
      return { ...r, customer: r.customer || e.customer, phone: r.phone || e.phone, complaint: e.complaint, reached: e.reached, action: e.action, followupId: e.id };
    });
    return { from, to, me: { name: who.name, role: who.role }, platforms: PLATFORMS, reached: REACHED, entries, platformFeedback, positive, talabat, ratings: [...ratings.values()].sort((a, b) => a.day.localeCompare(b.day) || a.branch.localeCompare(b.branch)), site };
  });

  const read = (b, now) => {
    const day = String(b.day || ''); if (!validDate(day) || day > businessDay(now)) fail(400, 'اختار اليوم');
    const platform = PLATFORMS.includes(b.platform) ? b.platform : fail(400, 'اختار المنصة');
    const rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
    if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) fail(400, 'التقييم من 1 لـ 5');
    const v = { day, platform, branch: clean(b.branch, 60), customer: clean(b.customer, 80), phone: clean(String(b.phone ?? '').replace(/[^\d+]/g, ''), 20), orderNo: clean(b.orderNo, 30), rating,
      comment: clean(b.comment, 1000), complaint: clean(b.complaint, 500), reached: b.reached && REACHED.includes(b.reached) ? b.reached : null, action: clean(b.action, 500) };
    if (!v.comment && !v.complaint && v.rating == null) fail(400, 'اكتب التعليق أو الشكوى أو التقييم');
    return v;
  };
  // The order's branch when the employee did not choose one.
  const withBranch = async v => { if (!v.branch && v.orderNo) v.branch = (await orderOf(v.orderNo, v.day, v.platform))?.branch || null; if (!v.branch) fail(400, 'اختار الفرع (أو اكتب رقم أوردر المرصد يعرفه)'); return v; };
  // Each customer-service user changes only their own lines; admin and supervisors any.
  const own = async (who, id) => { const e = await db.prepare('SELECT by_name FROM cs_entries WHERE id = ?').get(id); if (!e) fail(404, 'السطر مش موجود');
    if (who.role === 'cs' && e.by_name !== who.name) fail(403, 'السطر ده سجّله ' + (e.by_name || 'حد تاني') + '؛ تعدّل سطورك بس'); return e; };
  app.route('POST', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'cs'), v = await withBranch(read(ctx.body || {}, ctx.now));
    const r = await db.prepare('INSERT INTO cs_entries (day, platform, branch, customer, phone, order_no, rating, comment, complaint, reached, action, by_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(v.day, v.platform, v.branch, v.customer, v.phone, v.orderNo, v.rating, v.comment, v.complaint, v.reached, v.action, who.name, ctx.now, ctx.now);
    const link = await saveLink(r.lastInsertRowid, v).catch(() => null);
    return { ok: true, id: r.lastInsertRowid, link };
  });
  app.route('PUT', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'cs'), id = Number(ctx.body?.id); await own(who, id);
    const v = await withBranch(read(ctx.body || {}, ctx.now));
    // The line stays under the name of who wrote it.
    const r = await db.prepare('UPDATE cs_entries SET day=?, platform=?, branch=?, customer=?, phone=?, order_no=?, rating=?, comment=?, complaint=?, reached=?, action=?, updated_at=? WHERE id = ?')
      .run(v.day, v.platform, v.branch, v.customer, v.phone, v.orderNo, v.rating, v.comment, v.complaint, v.reached, v.action, ctx.now, id);
    if (!r.changes) fail(404, 'السطر مش موجود');
    const link = await saveLink(id, v).catch(() => null);
    return { ok: true, link };
  });
  app.route('DELETE', '/api/cs', async ctx => {
    const who = await app.requireAdmin(ctx, 'cs'), id = Number(ctx.body?.id || ctx.query.id); await own(who, id);
    const r = await db.prepare('DELETE FROM cs_entries WHERE id = ?').run(id); if (!r.changes) fail(404, 'السطر مش موجود');
    await db.prepare('DELETE FROM cs_links WHERE entry_id = ?').run(id);
    await app.audit('cs_deleted', null, { actor: who.name, id });
    return { ok: true };
  });
  // The branch's rating of the day on Talabat and the competitor's (empty removes it).
  app.route('POST', '/api/cs/rating', async ctx => {
    const who = await app.requireAdmin(ctx, 'cs'), b = ctx.body || {};
    const day = String(b.day || ''); if (!validDate(day)) fail(400, 'اختار اليوم');
    const branch = clean(b.branch, 60) || fail(400, 'اختار الفرع');
    const num = v => { if (v == null || v === '') return null; const n = Number(v); if (!(n >= 0 && n <= 5)) fail(400, 'التقييم من 0 لـ 5'); return Math.round(n * 100) / 100; };
    const rating = num(b.rating), competitor = num(b.competitor);
    if (rating == null && competitor == null) await db.prepare('DELETE FROM cs_branch_day WHERE day = ? AND branch = ?').run(day, branch);
    else await db.prepare('INSERT INTO cs_branch_day (day, branch, rating, competitor, by_name, at) VALUES (?,?,?,?,?,?) ON CONFLICT(day, branch) DO UPDATE SET rating = excluded.rating, competitor = excluded.competitor, by_name = excluded.by_name, at = excluded.at')
      .run(day, branch, rating, competitor, who.name, ctx.now);
    return { ok: true };
  });
}

export { setup };
