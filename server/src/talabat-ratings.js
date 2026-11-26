// تقييم الفروع على طلبات (Karim 11-16: «واتصرف أن الشيتات تبقي كامله من غير احتياج ادخال يدوي حتي التقييمات»؛
// «المنافس هو مطعم الدهان التاني الي اللوجو بتاعه بني»): each branch's rating on Talabat and the competitor branch's, read
// from Talabat's public restaurant pages (the rate and the number of ratings in the page's data), a few times a day. The
// admin sets each branch's two Talabat pages; a rating typed by hand in «خدمة العملاء» stays first.
import { businessDay } from './time.js';
import { parseJson } from './order-match.js';

// Found 11-16 on Talabat: our three branches (white logo; the same vendors as the Talabat screens), the competitor's
// Fifth Settlement branch (brown logo), and the competitor's brand page (al-dahan-od) where its branch is not known.
export const DEFAULT_PAGES = { 'مدينة نصر': { ours: '608556', rival: 'al-dahan-od' }, 'التجمع': { ours: '760858', rival: '503267' }, 'مدينتي': { ours: '802223', rival: 'al-dahan-od' } };
const EVERY_MS = 3 * 3600000;

// The page's rating: the first restaurant object in its data (the branch shown).
export function ratingFromPage(html) {
  const data = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(String(html || ''))?.[1] || '';
  // A brand page: the brand's rating in its data.
  try { const d = JSON.parse(data)?.props?.pageProps?.data; if (d && !Array.isArray(d) && Number(d.rate) > 0 && !data.includes('"branchName"')) return { rate: Number(d.rate), ratings: Number(d.totalRatings) || null, branch: d.name || null }; } catch {}
  const at = data.indexOf('"restaurant":{'), part = at >= 0 ? data.slice(at, at + 20000) : data;
  const rate = Number(/"rate":([\d.]+)/.exec(part)?.[1]), ratings = Number(/"totalRatings":(\d+)/.exec(part)?.[1]);
  return rate > 0 && rate <= 5 ? { rate, ratings: Number.isFinite(ratings) ? ratings : null, branch: /"branchName":"([^"]*)"/.exec(part)?.[1] || null } : null;
}
// A branch page («…/restaurant/608556/…» or the number) or a brand page («talabat.com/egypt/al-dahan-od» or the name).
export const vendorIdOf = v => { const s = String(v || '').trim(); return /\/restaurant\/(\d+)/.exec(s)?.[1] || /^(\d{4,9})$/.exec(s)?.[1]
  || /talabat\.com\/(?:ar\/)?egypt\/([a-z0-9-]{3,60})\/?(?:[?#]|$)/i.exec(s)?.[1]?.toLowerCase() || /^([a-z][a-z0-9-]{2,59})$/i.exec(s)?.[1]?.toLowerCase() || ''; };
const pageUrl = id => /^\d+$/.test(id) ? 'https://www.talabat.com/ar/egypt/restaurant/' + id + '/x' : 'https://www.talabat.com/ar/egypt/' + id;

function setup(app) {
  const { db, fail } = app;
  const doFetch = app.config.talabatFetch || ((...a) => fetch(...a));
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v == null ? null : String(v));
  const get = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const pages = async () => ({ ...DEFAULT_PAGES, ...parseJson(await get('talabat_rating_pages'), {}) });

  async function readAll(now) {
    const day = businessDay(now), errors = [];
    for (const [branch, p] of Object.entries(await pages())) for (const side of ['ours', 'rival']) {
      const id = vendorIdOf(p[side]); if (!id) continue;
      try {
        const r = await doFetch(pageUrl(id), { headers: { accept: 'text/html', 'accept-language': 'ar' }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw Error('طلبات رد ' + r.status);
        const x = ratingFromPage(await r.text()); if (!x) throw Error('مالقيتش التقييم في الصفحة');
        await db.prepare('INSERT INTO talabat_ratings (day, branch, side, vendor_id, rate, ratings, at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(day, branch, side) DO UPDATE SET vendor_id = excluded.vendor_id, rate = excluded.rate, ratings = excluded.ratings, at = excluded.at')
          .run(day, branch, side, id, x.rate, x.ratings, now);
      } catch (e) { errors.push(branch + ' ' + (side === 'ours' ? 'إحنا' : 'المنافس') + ': ' + String(e.message).slice(0, 80)); }
    }
    await put('talabat_rating_error', errors.length ? errors.join(' · ') : null);
    await put('talabat_rating_at', now);
  }
  let last = 0, running = false;
  app.afterRequest(async now => {
    if (running || now - last < 60000) return; last = now;
    if (now - (Number(await get('talabat_rating_at')) || 0) < EVERY_MS) return;
    running = true; try { await readAll(now); } finally { running = false; }
  });

  // The main Talabat screen reads the portal's Reviews page of each of our vendors (Karim 11-16 «ومعاك البورتال»): the
  // store's rating, and each review's stars, words and order. The vendor is the branch.
  const VENDOR_BRANCH = { 'HF_EG;608556': 'مدينة نصر', 'HF_EG;760858': 'التجمع', 'HF_EG;802223': 'مدينتي' };
  app.route('POST', '/api/talabat/reviews', async ctx => {
    await app.talabatScreen(ctx);
    const b = ctx.body || {}, vendorId = /^(?:HF_EG;)?(\d+)$/.exec(String(b.vendor || ''))?.[1];
    const vendor = 'HF_EG;' + (vendorId || '');
    const branch = VENDOR_BRANCH[vendor];
    if (!branch) fail(400, 'unknown_vendor');
    const w = [];
    for (const r of (Array.isArray(b.reviews) ? b.reviews : []).slice(0, 300)) {
      const id = String(r.orderId || '').replace(/\D/g, ''), at = Number(r.at), rating = Number(r.rating);
      if (!id || !Number.isFinite(at)) continue;
      w.push(db.prepare('INSERT INTO talabat_reviews (order_id, vendor, branch, day, at, rating, text, seen_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET rating = excluded.rating, text = excluded.text, seen_at = excluded.seen_at')
        .bind(id, vendor, branch, businessDay(at), at, rating >= 1 && rating <= 5 ? Math.round(rating) : null, String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 1000) || null, ctx.now));
    }
    const rate = Number(b.stats?.rating);
    if (rate > 0 && rate <= 5) w.push(db.prepare("INSERT INTO talabat_ratings (day, branch, side, vendor_id, rate, ratings, at) VALUES (?,?,'ours',?,?,?,?) ON CONFLICT(day, branch, side) DO UPDATE SET rate = excluded.rate, ratings = excluded.ratings, at = excluded.at")
      .bind(businessDay(ctx.now), branch, vendor.split(';')[1], rate, Number(b.stats?.total) || null, ctx.now));
    if (w.length) await db.batch(w);
    return { ok: true, saved: w.length };
  });
  app.talabatReviews = async (from, to) => db.prepare('SELECT * FROM talabat_reviews WHERE day BETWEEN ? AND ? ORDER BY at DESC').all(from, to).catch(() => []);

  // For «خدمة العملاء» and the reports: each day's rating per branch (by hand first, else Talabat's page).
  app.talabatRatings = async (from, to) => (await db.prepare('SELECT * FROM talabat_ratings WHERE day BETWEEN ? AND ?').all(from, to).catch(() => []));

  app.route('GET', '/api/talabat/rating-pages', async ctx => {
    await app.requireAdmin(ctx, 'csRead');
    return { pages: await pages(), error: await get('talabat_rating_error'), at: Number(await get('talabat_rating_at')) || null };
  });
  app.route('POST', '/api/talabat/rating-pages', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const out = {};
    for (const b of Object.keys(DEFAULT_PAGES)) { const x = ctx.body?.pages?.[b] || {}; out[b] = { ours: vendorIdOf(x.ours), rival: vendorIdOf(x.rival) };
      for (const s of ['ours', 'rival']) if (x[s] && !out[b][s]) fail(400, 'لينك صفحة طلبات مش مفهوم: ' + String(x[s]).slice(0, 80)); }
    await put('talabat_rating_pages', JSON.stringify(out)); await put('talabat_rating_at', 0);
    await app.audit('talabat_rating_pages', null, { actor: who.name, pages: out });
    return { ok: true, pages: out };
  });
}

export { setup };
