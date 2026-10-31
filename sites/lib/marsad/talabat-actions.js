// أوامر شاشة طلبات (Karim 31-10-2026): what the Talabat live screen is allowed to do by itself, per branch, set from admin.
//  - accept: accept a new order on the branch's delivery time (minutes), set from admin before the orders come.
//  - onTheWay: press «في الطريق» once the matched Apex order left with its pilot.
// Everything is off until admin turns it on for a branch. The connector also sends a sample of the screen's buttons
// (names and test ids only, no customer details) so the clicks are built on the real page, never guessed.
import { businessDay, iso } from './time.js';
import { parseJson } from './order-match.js';
import { sha256 } from './security.js';
import { TALABAT_PRODUCTS } from './menu-seed.js';

const OUT = new Set(['PICKED_UP', 'PICKED UP', 'IN_DELIVERY', 'IN DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED']);
const clean = c => {
  const branches = {};
  for (const [store, v] of Object.entries(c?.branches || {}).slice(0, 40)) {
    const name = String(store).trim().slice(0, 120); if (!name) continue;
    const minutes = Math.round(Number(v?.minutes));
    branches[name] = { accept: v?.accept === true, minutes: minutes >= 5 && minutes <= 180 ? minutes : null, onTheWay: v?.onTheWay === true };
  }
  return { branches };
};

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const config = async () => clean(parseJson(await setting('talabat_actions'), {}));
  const screen = async ctx => {
    const hash = await setting('talabat_token_hash'), given = ctx.header('x-talabat-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح شاشة طلبات غير صحيح');
  };

  // Admin: the branches seen on Talabat lately, each with its setting, the last results and the screen samples.
  app.route('GET', '/api/talabat/actions-config', async ctx => {
    await app.requireAdmin(ctx);
    const since = businessDay(ctx.now - 7 * 86400000);
    const stores = (await db.prepare('SELECT DISTINCT store FROM talabat_orders WHERE day >= ? AND store IS NOT NULL').all(since)).map(r => r.store).filter(Boolean).sort();
    const c = await config();
    const log = parseJson(await setting('talabat_actions_log'), []);
    const ui = {};
    for (const k of ['new', 'accepted', 'onTheWay']) ui[k] = parseJson(await setting('talabat_ui:' + k), null);
    return { branches: [...new Set([...stores, ...Object.keys(c.branches)])].map(s => ({ store: s, ...(c.branches[s] || { accept: false, minutes: null, onTheWay: false }) })),
      acceptReady: false, log: log.slice(0, 30), ui };
  });
  app.route('POST', '/api/talabat/actions-config', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const c = clean(ctx.body);
    await put('talabat_actions', JSON.stringify(c));
    await app.audit('talabat_actions', null, { actor: who.name, ...c });
    return { ok: true, ...c };
  });

  // The live screen asks what to do. Delivery times per branch always; «في الطريق» only for orders whose Apex order left.
  app.route('GET', '/api/talabat/actions', async ctx => {
    await screen(ctx);
    const c = await config(), day = businessDay(ctx.now);
    const accept = Object.fromEntries(Object.entries(c.branches).filter(([, v]) => v.accept && v.minutes).map(([s, v]) => [s, v.minutes]));
    const wantOut = Object.entries(c.branches).filter(([, v]) => v.onTheWay).map(([s]) => s);
    const onTheWay = [];
    if (wantOut.length && app.talabat) {
      const tm = await app.talabat.matchDay(day);
      const snap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day))?.data, {});
      const outOf = new Map([...(snap.lateOut || []), ...(snap.online || [])].filter(a => a.out).map(a => [String(a.no), a.out]));
      for (const o of tm.rows) {
        if (!wantOut.includes(o.store) || OUT.has(String(o.status || '').toUpperCase()) || o.picked_up_at || o.delivered_at) continue;
        const a = tm.matches.get(o.id), out = a && outOf.get(String(a.no));
        if (out) onTheWay.push({ id: String(o.id), code: o.code || null, out });
      }
    }
    return { accept, onTheWay: onTheWay.slice(0, 20), serverNow: iso(ctx.now) };
  });

  // ---- إيقاف الأصناف لكل فرع (Karim 31-10): admin ticks the dishes stopped in a branch; the Talabat screen applies it. ----
  const PRODUCT = new Map(TALABAT_PRODUCTS.map(p => [p[0], { id: p[0], name: p[1], category: p[2] }]));
  const stockOf = async () => { const v = parseJson(await setting('talabat_stock'), {}); return v && typeof v === 'object' ? v : {}; };
  app.route('GET', '/api/talabat/stock-config', async ctx => {
    await app.requireAdmin(ctx);
    const since = businessDay(ctx.now - 7 * 86400000);
    const stores = (await db.prepare('SELECT DISTINCT store FROM talabat_orders WHERE day >= ? AND store IS NOT NULL').all(since)).map(r => r.store).filter(Boolean).sort();
    const stock = await stockOf(), applied = parseJson(await setting('talabat_stock_applied'), {});
    return { stores: [...new Set([...stores, ...Object.keys(stock)])], products: [...PRODUCT.values()], stopped: stock, applied, ready: false };
  });
  app.route('POST', '/api/talabat/stock-config', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const store = String(ctx.body?.store || '').trim().slice(0, 120); if (!store) fail(400, 'اختار الفرع');
    const ids = [...new Set((Array.isArray(ctx.body?.stopped) ? ctx.body.stopped : []).map(String).filter(id => PRODUCT.has(id)))].slice(0, 300);
    const stock = await stockOf(); stock[store] = ids; await put('talabat_stock', JSON.stringify(stock));
    await app.audit('talabat_stock', null, { actor: who.name, store, stopped: ids.map(id => PRODUCT.get(id).name) });
    return { ok: true, store, stopped: ids };
  });
  // The screen asks which dishes must be stopped in which branch, and reports what it set.
  app.route('GET', '/api/talabat/stock', async ctx => { await screen(ctx); return { stopped: await stockOf() }; });
  app.route('POST', '/api/talabat/stock/result', async ctx => {
    await screen(ctx);
    const store = String(ctx.body?.store || '').slice(0, 120), applied = parseJson(await setting('talabat_stock_applied'), {});
    applied[store] = { at: ctx.now, ok: ctx.body?.ok === true, note: String(ctx.body?.note || '').slice(0, 200), stopped: (Array.isArray(ctx.body?.stopped) ? ctx.body.stopped : []).map(String).slice(0, 300) };
    await put('talabat_stock_applied', JSON.stringify(applied));
    return { ok: true };
  });

  // What the screen did (or could not do), kept short for admin.
  app.route('POST', '/api/talabat/actions/result', async ctx => {
    await screen(ctx);
    const b = ctx.body || {};
    const row = { at: ctx.now, id: String(b.id || '').replace(/\D/g, '').slice(0, 20), action: ['accept', 'onTheWay'].includes(b.action) ? b.action : 'other',
      ok: b.ok === true, note: String(b.note || '').slice(0, 200) };
    const log = parseJson(await setting('talabat_actions_log'), []);
    await put('talabat_actions_log', JSON.stringify([row, ...log].slice(0, 100)));
    return { ok: true };
  });
  // A sample of the screen's controls (button words, test ids, roles): no customer details.
  app.route('POST', '/api/talabat/ui', async ctx => {
    await screen(ctx);
    const kind = ['new', 'accepted', 'onTheWay'].includes(ctx.body?.kind) ? ctx.body.kind : null;
    if (!kind) fail(400, 'invalid_kind');
    const controls = (Array.isArray(ctx.body.controls) ? ctx.body.controls : []).slice(0, 120).map(x => ({
      tag: String(x?.tag || '').slice(0, 12), testid: String(x?.testid || '').slice(0, 120), role: String(x?.role || '').slice(0, 30),
      aria: String(x?.aria || '').slice(0, 80), text: String(x?.text || '').replace(/\d{6,}/g, '#').slice(0, 60) }));
    await put('talabat_ui:' + kind, JSON.stringify({ at: iso(ctx.now), controls }));
    return { ok: true };
  });
}
export { setup };
