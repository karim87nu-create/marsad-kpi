// أوامر شاشة طلبات (Karim 31-10-2026): what the Talabat live screen is allowed to do by itself, per branch, set from admin.
//  - accept: accept a new order on the branch's delivery time (minutes), set from admin before the orders come.
//  - onTheWay: press «في الطريق» once the matched Apex order left with its pilot.
// Everything is off until admin turns it on for a branch. The connector also sends a sample of the screen's buttons
// (names and test ids only, no customer details) so the clicks are built on the real page, never guessed.
import { businessDay, iso } from './time.js';
import { parseJson } from './order-match.js';
import { sha256 } from './security.js';
import { TALABAT_PRODUCTS } from './menu-seed.js';
import { knownNos } from './items.js';

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
    const hash = await setting('talabat_token_hash'), given = ctx.header('x-talabat-token'), extras = parseJson(await setting('talabat_token_extra'), []);
    if (!given && app.config.deviceTokens.includes(ctx.header('x-device-token') || '')) return;   // a Live Orders tab on any PC with the extension
    if (!given || !((hash && sha256(given) === hash) || extras.includes(sha256(given)))) fail(401, 'مفتاح شاشة طلبات غير صحيح');
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

  // ---- إيقاف الأصناف لكل فرع (Karim 31-10, 01-11): admin ticks the dishes stopped in a branch; the Talabat screen applies
  // it on Talabat's «Menu Availability» page and the Apex writer on Apex (StoppedItems, the way Apex's own screen does).
  // Only what admin changed is applied (a queue of changes): dishes a branch stopped by itself are never touched.
  const PRODUCT = new Map(TALABAT_PRODUCTS.map(p => [p[0], { id: p[0], name: p[1], category: p[2] }]));
  // Talabat outlets (vendor ids on the menu page) for the three branches, as the account lists them (01-11-2026).
  const OUTLETS = [{ id: 'HF_EG;760858', apex: 1 }, { id: 'HF_EG;608556', apex: 2 }, { id: 'HF_EG;802223', apex: 3 }];
  const json = async (k, d) => { const v = parseJson(await setting(k), d); return v && typeof v === 'object' ? v : d; };
  const stockOf = () => json('talabat_stock', {});
  const apexBranch = store => { const t = String(store || ''); const h = [/التجمع/.test(t) && 1, /(مدينة نصر|سيتي ستار|مكرم)/.test(t) && 2, /مدينتي/.test(t) && 3].filter(Boolean); return h.length === 1 ? h[0] : null; };
  const apexNosOf = id => { const p = PRODUCT.get(id); return p ? knownNos(p.name) : []; };
  app.route('GET', '/api/talabat/stock-config', async ctx => {
    await app.requireAdmin(ctx);
    const since = businessDay(ctx.now - 7 * 86400000);
    const stores = (await db.prepare('SELECT DISTINCT store FROM talabat_orders WHERE day >= ? AND store IS NOT NULL').all(since)).map(r => r.store).filter(Boolean).sort();
    const stock = await stockOf();
    return { stores: [...new Set([...stores, ...Object.keys(stock)])], products: [...PRODUCT.values()], stopped: stock,
      actual: await json('talabat_stock_actual', {}), queue: await json('talabat_stock_queue', {}), apexQueue: await json('apex_stock_queue', {}),
      apply: await json('talabat_stock_apply', { talabat: false, apex: false }), log: (await json('talabat_stock_log', { rows: [] })).rows.slice(0, 30) };
  });
  app.route('POST', '/api/talabat/stock-config', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    if (ctx.body?.action === 'apply') {
      const v = { talabat: ctx.body.talabat === true, apex: ctx.body.apex === true };
      await put('talabat_stock_apply', JSON.stringify(v)); await app.audit('talabat_stock_apply', null, { actor: who.name, ...v });
      return { ok: true, ...v };
    }
    const store = String(ctx.body?.store || '').trim().slice(0, 160); if (!store) fail(400, 'اختار الفرع');
    const ids = [...new Set((Array.isArray(ctx.body?.stopped) ? ctx.body.stopped : []).map(String).filter(id => PRODUCT.has(id)))].slice(0, 300);
    const stock = await stockOf(), before = new Set(stock[store] || []), after = new Set(ids);
    stock[store] = ids; await put('talabat_stock', JSON.stringify(stock));
    // The changes, queued for the Talabat screen and the Apex writer (the latest wish per dish wins).
    const q = await json('talabat_stock_queue', {}), aq = await json('apex_stock_queue', {}), br = apexBranch(store);
    const changed = [...[...after].filter(id => !before.has(id)).map(id => [id, 'stop']), ...[...before].filter(id => !after.has(id)).map(id => [id, 'resume'])];
    for (const [id, act] of changed) {
      (q[store] ||= {})[id] = act;
      if (br) for (const no of apexNosOf(id)) (aq[br] ||= {})[no] = act;
    }
    await put('talabat_stock_queue', JSON.stringify(q)); await put('apex_stock_queue', JSON.stringify(aq));
    await app.audit('talabat_stock', null, { actor: who.name, store, stop: changed.filter(c => c[1] === 'stop').map(c => PRODUCT.get(c[0]).name), resume: changed.filter(c => c[1] === 'resume').map(c => PRODUCT.get(c[0]).name) });
    return { ok: true, store, stopped: ids, changes: changed.length };
  });
  const logStock = async row => { const l = await json('talabat_stock_log', { rows: [] }); l.rows = [{ at: Date.now(), ...row }, ...l.rows].slice(0, 100); await put('talabat_stock_log', JSON.stringify(l)); };
  // The Talabat screen (menu page): the outlets to visit, and for the one it is on, the queued changes (only when admin turned it on).
  app.route('GET', '/api/talabat/stock', async ctx => {
    await screen(ctx);
    const apply = await json('talabat_stock_apply', { talabat: false }), q = await json('talabat_stock_queue', {});
    // Per outlet (the menu page's vendor id): the queued changes of the branch it is.
    const byOutlet = {};
    for (const o of OUTLETS) for (const [store, items] of Object.entries(q)) if (apexBranch(store) === o.apex) for (const [id, act] of Object.entries(items)) (byOutlet[o.id] ||= {})[id] = act;
    return { outlets: OUTLETS.map(o => o.id), apply: apply.talabat === true, queue: byOutlet };
  });
  // What the menu page shows now for one outlet (dishes not available), and the changes it made.
  app.route('POST', '/api/talabat/stock/report', async ctx => {
    await screen(ctx);
    const b = ctx.body || {}, outlet = String(b.outlet || '').slice(0, 40), name = String(b.outletName || '').slice(0, 120);
    const actual = await json('talabat_stock_actual', {});
    actual[outlet] = { at: ctx.now, name, unavailable: (Array.isArray(b.unavailable) ? b.unavailable : []).map(String).filter(id => /^\d{6,12}$/.test(id)).slice(0, 400) };
    await put('talabat_stock_actual', JSON.stringify(actual));
    const q = await json('talabat_stock_queue', {});
    for (const d of (Array.isArray(b.done) ? b.done : []).slice(0, 50)) {
      const id = String(d.id || ''), br = OUTLETS.find(o => o.id === outlet)?.apex;
      for (const store of Object.keys(q)) if (apexBranch(store) === br && d.ok === true && q[store]?.[id] === d.act) delete q[store][id];
      await logStock({ where: 'talabat', store: name || outlet, dish: PRODUCT.get(id)?.name || id, act: d.act, ok: d.ok === true, note: String(d.note || '').slice(0, 120) });
    }
    await put('talabat_stock_queue', JSON.stringify(q));
    return { ok: true };
  });
  // The Apex writer: the queued stops/resumes per Apex branch and item (only when admin turned it on), and its answers.
  const writerKey = async ctx => {
    const given = ctx.header('x-apex-writer'), hashes = [await setting('apex_writer_token_hash'), await setting('orders_token_hash')].filter(Boolean);
    if (!given || !hashes.includes(sha256(given))) fail(401, 'مفتاح كاتب Apex غير صحيح');
  };
  app.route('POST', '/api/apex-writer/stock-next', async ctx => {
    await writerKey(ctx);
    const apply = await json('talabat_stock_apply', { apex: false });
    return { apply: apply.apex === true, queue: apply.apex === true ? await json('apex_stock_queue', {}) : {} };
  });
  app.route('POST', '/api/apex-writer/stock', async ctx => {
    await writerKey(ctx);
    const aq = await json('apex_stock_queue', {});
    for (const d of (Array.isArray(ctx.body?.done) ? ctx.body.done : []).slice(0, 100)) {
      const br = String(d.branch || ''), no = String(d.itemNo || '');
      if (d.ok === true && aq[br]?.[no] === d.act) delete aq[br][no];
      await logStock({ where: 'apex', branch: br, item: no, act: d.act, ok: d.ok === true, note: String(d.note || '').slice(0, 120) });
    }
    await put('apex_stock_queue', JSON.stringify(aq));
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
