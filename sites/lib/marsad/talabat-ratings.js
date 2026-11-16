// تقييم الفروع على طلبات (Karim 11-16: «واتصرف أن الشيتات تبقي كامله من غير احتياج ادخال يدوي حتي التقييمات»؛
// «المنافس هو مطعم الدهان التاني الي اللوجو بتاعه بني»): each branch's rating on Talabat and the competitor branch's, read
// from Talabat's public restaurant pages (the rate and the number of ratings in the page's data), a few times a day. The
// admin sets each branch's two Talabat pages; a rating typed by hand in «خدمة العملاء» stays first.
import { businessDay } from './time.js';
import { parseJson } from './order-match.js';

// Found 11-16 on Talabat: ours in Nasr City (City Stars, white logo), the competitor in the Fifth Settlement (brown logo).
export const DEFAULT_PAGES = { 'مدينة نصر': { ours: '608556', rival: '' }, 'التجمع': { ours: '', rival: '503267' }, 'مدينتي': { ours: '', rival: '' } };
const EVERY_MS = 3 * 3600000;

// The page's rating: the first restaurant object in its data (the branch shown).
export function ratingFromPage(html) {
  const data = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(String(html || ''))?.[1] || '';
  const at = data.indexOf('"restaurant":{'), part = at >= 0 ? data.slice(at, at + 20000) : data;
  const rate = Number(/"rate":([\d.]+)/.exec(part)?.[1]), ratings = Number(/"totalRatings":(\d+)/.exec(part)?.[1]);
  return rate > 0 && rate <= 5 ? { rate, ratings: Number.isFinite(ratings) ? ratings : null, branch: /"branchName":"([^"]*)"/.exec(part)?.[1] || null } : null;
}
export const vendorIdOf = v => String(/\/restaurant\/(\d+)/.exec(String(v || ''))?.[1] || /^\s*(\d{4,9})\s*$/.exec(String(v || ''))?.[1] || '');

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
        const r = await doFetch('https://www.talabat.com/ar/egypt/restaurant/' + id + '/x', { headers: { accept: 'text/html', 'accept-language': 'ar' }, signal: AbortSignal.timeout(20000) });
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

  // For «خدمة العملاء» and the reports: each day's rating per branch (by hand first, else Talabat's page).
  app.talabatRatings = async (from, to) => (await db.prepare('SELECT * FROM talabat_ratings WHERE day BETWEEN ? AND ?').all(from, to).catch(() => []));

  app.route('GET', '/api/talabat/rating-pages', async ctx => {
    await app.requireAdmin(ctx);
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
