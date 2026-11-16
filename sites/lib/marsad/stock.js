// الأصناف الواقفة (Karim 11-16: «وقف الأصناف لو فيه أصناف مش موجوده علي طلبات وموجوده علي ابيكس أو العكس هنعمل اي
// / والموقع عايزين ندخله في الموضوع ده» — «عايز زرار واحد يوقف في الكل»). What each branch has stopped on Apex (the
// cashier's monitor reads Apex's StoppedItems every 5 minutes), on Talabat (the extension reads the Menu Availability
// page) and on the website (its products' stock), side by side; what differs is told to the branch and the online group.
// The stops admin ticks are applied by talabat-actions.js (Talabat, Apex); the website's by this module, when turned on.
import { businessDay, iso } from './time.js';
import { parseJson } from './order-match.js';
import { sha256 } from './security.js';
import { TALABAT_PRODUCTS } from './menu-seed.js';
import { knownNos } from './items.js';

// Apex branch number → the branch (as Apex and the Telegram branch groups name it) and its Talabat outlet.
export const BRANCHES = [{ no: 1, name: 'التجمع', outlet: 'HF_EG;760858' }, { no: 2, name: 'مدينة نصر', outlet: 'HF_EG;608556' }, { no: 3, name: 'مدينتى', outlet: 'HF_EG;802223' }];
const FRESH_MS = 40 * 60000, PERSIST_MS = 15 * 60000, SITE_EVERY_MS = 30 * 60000;
// Names compared the way they are written on Apex and the website.
export const normDish = s => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
// A row of Apex's StoppedItems: stopped unless its status says 0.
const isStopped = r => r.status == null || Number(r.status) !== 0;

// The comparison, from the three readings (pure, for the page, the alerts and the tests).
export function compare({ apex, talabat, site }, now) {
  const products = TALABAT_PRODUCTS.map(p => ({ id: String(p[0]), name: p[1], category: p[2], nos: knownNos(p[1]) }));
  const apexFresh = apex?.at && now - apex.at < FRESH_MS;
  const siteOut = (site?.products || []).filter(p => p.stock === 'outofstock');
  const out = [];
  const stoppedEverywhere = new Map();   // Apex item → the branches it is stopped in
  for (const b of BRANCHES) {
    const tb = talabat?.[b.outlet], tbFresh = tb?.at && now - tb.at < FRESH_MS;
    const aStop = (apex?.stopped || []).filter(r => r.branch === b.no && isStopped(r));
    const aSet = new Set(aStop.map(r => String(r.item)));
    for (const r of aStop) stoppedEverywhere.set(String(r.item), [...(stoppedEverywhere.get(String(r.item)) || []), b.no]);
    const tUnav = new Set((tb?.unavailable || []).map(String));
    const diffs = [];
    if (apexFresh && tbFresh) {
      for (const p of products) {
        if (!p.nos.length) continue;
        const onApex = p.nos.some(n => aSet.has(n)), offTalabat = tUnav.has(p.id);
        // A Talabat dish made of several Apex sizes: stopped on Apex when every size is stopped.
        const allApex = p.nos.every(n => aSet.has(n));
        if (allApex && !offTalabat) diffs.push({ key: 'a:' + p.id, dish: p.name, talabatId: p.id, apexNos: p.nos, side: 'apexOnly', text: 'واقف على Apex وشغال على طلبات' });
        else if (offTalabat && !onApex) diffs.push({ key: 't:' + p.id, dish: p.name, talabatId: p.id, apexNos: p.nos, side: 'talabatOnly', text: 'واقف على طلبات وشغال على Apex' });
      }
    }
    out.push({ branch: b.no, name: b.name, outlet: b.outlet,
      apex: aStop.map(r => ({ item: String(r.item), name: r.name || String(r.item), status: r.status, reason: r.reason })), apexAt: apex?.at || null,
      talabat: [...tUnav].map(id => ({ id, name: products.find(p => p.id === id)?.name || id })), talabatAt: tb?.at || null,
      diffs, checked: !!(apexFresh && tbFresh) });
  }
  // The website is one menu for every branch: a dish stopped on Apex in all three branches and still on sale there,
  // or out of stock there while some branch has it.
  const siteDiffs = [];
  if (apexFresh && site?.at && now - site.at < 2 * SITE_EVERY_MS) {
    const names = new Map((apex?.stopped || []).map(r => [String(r.item), r.name]));
    const all = [...stoppedEverywhere].filter(([, bs]) => BRANCHES.every(b => bs.includes(b.no))).map(([item]) => ({ item, n: normDish(names.get(item)) })).filter(x => x.n);
    for (const p of site.products || []) {
      const n = normDish(p.name), hit = all.find(x => x.n === n || (x.n.length >= 6 && (n.includes(x.n) || x.n.includes(n))));
      if (hit && p.stock !== 'outofstock') siteDiffs.push({ key: 's:' + p.id, dish: p.name, siteId: p.id, side: 'siteOn', text: 'واقف على Apex في كل الفروع وشغال على الموقع' });
    }
  }
  return { branches: out, site: { at: site?.at || null, outOfStock: siteOut.map(p => ({ id: p.id, name: p.name })), diffs: siteDiffs, count: (site?.products || []).length }, apexAt: apex?.at || null };
}

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const json = async (k, d) => { const v = parseJson(await setting(k), d); return v && typeof v === 'object' ? v : d; };
  const readings = async () => ({ apex: await json('apex_stock_actual', null), talabat: await json('talabat_stock_actual', {}), site: await json('site_stock', null) });

  // The cashier's monitor: Apex's StoppedItems now and the last stops / resumes made there.
  app.route('POST', '/api/apex-stock', async ctx => {
    const hash = await setting('orders_token_hash'), given = ctx.header('x-orders-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح مرصد الأوردرات غير صحيح');
    const b = ctx.body || {};
    const stopped = (Array.isArray(b.stopped) ? b.stopped : []).slice(0, 3000).map(r => ({ branch: Number(r.branch), item: String(r.item || '').trim().slice(0, 20), status: r.status == null ? null : Number(r.status),
      reason: r.reason == null ? null : Number(r.reason), name: String(r.name || '').trim().slice(0, 80) })).filter(r => r.item && Number.isInteger(r.branch));
    const recent = (Array.isArray(b.recent) ? b.recent : []).slice(0, 60).map(r => ({ branch: Number(r.branch), item: String(r.item || '').trim().slice(0, 20), reason: r.reason ?? null, at: r.at ? Date.parse(r.at) || null : null, user: String(r.user || '').slice(0, 60) || null }));
    await put('apex_stock_actual', JSON.stringify({ at: ctx.now, stopped, recent }));
    await alerts(ctx.now).catch(() => {});
    return { ok: true, stopped: stopped.length };
  });

  // The website's products and their stock, every 30 minutes (read-only unless admin turned the website's stops on).
  let siteAt = 0, siteBusy = false;
  async function readSite(now) {
    if (!app.siteWc) return;
    const products = [];
    for (let page = 1; page <= 10; page++) {
      const list = await app.siteWc('products', { per_page: 100, page, status: 'publish', _fields: 'id,name,stock_status,sku,categories' });
      if (!Array.isArray(list) || !list.length) break;
      for (const p of list) products.push({ id: Number(p.id), name: String(p.name || '').replace(/&amp;/g, '&').slice(0, 120), sku: String(p.sku || '').slice(0, 30) || null, stock: String(p.stock_status || ''), category: String(p.categories?.[0]?.name || '').slice(0, 60) || null });
      if (list.length < 100) break;
    }
    await put('site_stock', JSON.stringify({ at: now, products }));
  }
  app.afterRequest(async now => {
    if (siteBusy || now - siteAt < 60000) return; siteAt = now;
    const last = (await json('site_stock', null))?.at || 0, err = Number(await setting('site_stock_error_at')) || 0;
    if (now - last < SITE_EVERY_MS || now - err < SITE_EVERY_MS) return;
    siteBusy = true;
    try { await readSite(now); await put('site_stock_error', ''); } catch (e) { await put('site_stock_error_at', now); await put('site_stock_error', String(e.message).slice(0, 200)); } finally { siteBusy = false; }
  });

  // A difference seen for 15 minutes is told once a day to the branch and the online group.
  async function alerts(now) {
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get().catch(() => null);
    const off = parseJson(c?.rules, {}).stockMismatch === false;
    const r = compare(await readings(), now), seen = await json('stock_diff_seen', {}), next = {}, day = businessDay(now), rows = [];
    for (const b of r.branches) for (const d of b.diffs) {
      const k = b.branch + '|' + d.key; next[k] = seen[k] || now;
      if (now - next[k] >= PERSIST_MS) rows.push({ key: 'stock:' + day + ':' + k, branch: b.name, text: '🍽️ الأصناف | ' + d.dish + ' — ' + d.text + '\nالفرع: ' + b.name + '\n' + (d.side === 'apexOnly' ? 'وقفوه على طلبات أو رجّعوه على Apex' : 'رجّعوه على طلبات أو وقفوه على Apex') });
    }
    for (const d of r.site.diffs) { const k = 'site|' + d.key; next[k] = seen[k] || now; if (now - next[k] >= PERSIST_MS) rows.push({ key: 'stock:' + day + ':' + k, branch: null, text: '🍽️ الأصناف | ' + d.dish + ' — ' + d.text + '\nوقفوه على الموقع' }); }
    await put('stock_diff_seen', JSON.stringify(next));
    if (off || !rows.length) return;
    await db.batch(rows.flatMap(x => [...(x.branch ? [['branches', x.branch, '']] : []), ['online', null, ':online']].map(([target, branch, sfx]) =>
      db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch) VALUES (?, 'stockMismatch', NULL, ?, ?, NULL, ?, ?)").bind(x.key + sfx, x.text, now, target, branch))));
  }
  app.stockAlerts = alerts;

  app.route('GET', '/api/stock/compare', async ctx => {
    await app.requireAdmin(ctx);
    const r = compare(await readings(), ctx.now), apex = await json('apex_stock_actual', null);
    return { ...r, recent: (apex?.recent || []).slice(0, 30).map(x => ({ ...x, at: x.at ? iso(x.at) : null })), siteError: (await setting('site_stock_error')) || null,
      siteApply: (await json('talabat_stock_apply', {})).site === true };
  });
  // The website: stop or bring back a product (admin, only when the website's stops are turned on).
  app.route('POST', '/api/stock/site', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    if ((await json('talabat_stock_apply', {})).site !== true) fail(409, 'وقف الأصناف على الموقع مقفول؛ شغّله من «إيقاف الأصناف» الأول');
    const id = Number(ctx.body?.id), stop = ctx.body?.stop === true;
    if (!Number.isInteger(id) || id <= 0) fail(400, 'اختار الصنف');
    if (!app.siteWcWrite) fail(409, 'الموقع مش متربط');
    const p = await app.siteWcWrite('products/' + id, { stock_status: stop ? 'outofstock' : 'instock' });
    const s = await json('site_stock', null);
    if (s?.products) { const x = s.products.find(q => q.id === id); if (x) x.stock = String(p?.stock_status || (stop ? 'outofstock' : 'instock')); await put('site_stock', JSON.stringify(s)); }
    await app.audit('site_stock', null, { actor: who.name, id, name: p?.name || null, stop });
    return { ok: true, stock: p?.stock_status || null };
  });
}

export { setup };
