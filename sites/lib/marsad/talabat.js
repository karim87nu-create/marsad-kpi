import { talabatReference } from './order-identifiers.js';
// طلبات: one monitor screen (Firefox on a PC that stays on, signed in with the call center's Talabat account that sees
// every branch) reads Order History and each order's details, and pushes them here. Per order we keep the times
// (received, accepted and how fast, picked up, delivered, cancelled), the cancellation owner and reason, the items and
// the subtotal. Customer matching fields are kept separately, for matching only. Each order is then tied to its Apex order (who entered it and when).
import { businessDay, iso, validDate } from './time.js';
import { sha256, randomToken } from './security.js';
import { compareItems, itemKey, SEED } from './items.js';
import { resolveOrders, customerOf, parseJson } from './order-match.js';

const NOT_ENTERED_MIN = 10, STALE_MS = 5 * 60000, WINDOW_MIN = 45;
const cancelReady = o => o.status === 'CANCELLED' && !!o.cancelled_at && !!o.store && !!o.cancel_owner?.trim() && !!o.cancel_reason?.trim();
const statusRank = s => ({ NEW: 0, 'PREORDER ACCEPTED': 1, ACCEPTED: 1, READY: 2, 'READY FOR PICKUP': 2, 'PICKED UP': 3, 'IN DELIVERY': 3, COMPLETED: 4, DELIVERED: 4, CANCELLED: 5, REJECTED: 5 })[s];
const FINAL = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERED']);
const KNOWN_STATUS = new Set([...FINAL, 'NEW', 'ACCEPTED', 'READY', 'READY FOR PICKUP', 'PICKED UP', 'IN DELIVERY', 'PREORDER ACCEPTED']);
const KNOWN_STEP = new Set(['DISPLAYED_AT_VENDOR', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED']);
const KNOWN_OWNER = new Set(['Customer', 'Vendor', 'Platform', 'Transport', 'Rider']);
const norm = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^\s*(فرع|الدهان)[\s,،]*/g, '').trim();
// "الدهان، التجمع الخامس - البنفسج" ~ "التجمع"; "الدهان سيتي ستار مول" ~ "سيتي ستار".
// Talabat store names → the Apex branch they are (the stores do not carry the branch's name).
const STORE_AREA = [[/سيتي ستار|مكرم عبيد|makram|city ?stars|nasr|نصر/i, 'نصر'], [/مدينتي|madinaty|ساوث بارك/i, 'مدينتي'], [/التجمع|البنفسج|tagamo|banafseg|الخامس/i, 'التجمع']];
const area = s => STORE_AREA.find(([re]) => re.test(String(s || '')))?.[1] || null;
// One name per branch on the pages and in the messages (Talabat shows each store in Arabic and in English).
const BRANCH_NAME = { 'نصر': 'مدينة نصر', 'مدينتي': 'مدينتي', 'التجمع': 'التجمع' };
const storeName = s => BRANCH_NAME[area(s)] || s || null;
function sameBranch(a, b) {
  const ka = area(a), kb = area(b);
  if (ka && kb) return ka === kb;
  const x = norm(a), y = norm(b);
  if (!x || !y) return null;
  const words = s => s.split(/[\s،,\-]+/).filter(w => w.length > 2);
  return words(x).some(w => y.includes(w)) || words(y).some(w => x.includes(w));
}

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

  // ---- the monitor screen's key (made from the admin page, handed to the extension on that PC) ----
  app.route('GET', '/api/talabat/token', async ctx => {
    await app.requireAdmin(ctx);
    const last = Number(await setting('talabat_last_push')) || null;
    return { linked: !!await setting('talabat_token_hash'), lastPush: iso(last), ageSeconds: last ? Math.round((ctx.now - last) / 1000) : null };
  });
  app.route('POST', '/api/talabat/token', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const token = 'tal_' + randomToken(24);
    await put('talabat_token_hash', sha256(token));
    await app.audit('talabat_token_created', null, { actor: who.name });
    return { token };
  });

  // ---- the monitor pushes what it read ----
  app.route('POST', '/api/talabat/push', async ctx => {
    const hash = await setting('talabat_token_hash'), given = ctx.header('x-talabat-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح شاشة طلبات غير صحيح');
    const now = ctx.now, list = (Array.isArray(ctx.body?.orders) ? ctx.body.orders : []).slice(0, 800), writes = [];
    // From Live Orders: the short code (#2703) next to the full number; it is what is written on Apex next to the customer.
    for (const c of (Array.isArray(ctx.body?.codes) ? ctx.body.codes : []).slice(0, 200)) {
      const id = String(c.id || '').replace(/\D/g, '').slice(0, 20), code = String(c.code || '').replace(/\D/g, '').slice(0, 10);
      if (id.length < 6 || !code) continue;
      writes.push(db.prepare('INSERT INTO talabat_orders (id, day, code, store, first_seen, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, store = COALESCE(talabat_orders.store, excluded.store)')
        .bind(id, businessDay(now), code, c.store ? String(c.store).slice(0, 160) : null, now, now));
    }
    // Anything the screen showed that is not known yet is kept (listed under «اللي المرصد اتعلمه»), never dropped.
    const unknown = [];
    for (const o of list) {
      if (!o || typeof o !== 'object') continue;
      const st = String(o.status || '').toUpperCase();
      if (st && !KNOWN_STATUS.has(st)) unknown.push(['talabat', 'حالة: ' + st, o.id]);
      for (const k of Object.keys(o.detail?.milestones || {})) if (!KNOWN_STEP.has(k)) unknown.push(['talabat', 'خطوة: ' + k, o.id]);
      if (o.detail?.cancelOwner && !KNOWN_OWNER.has(o.detail.cancelOwner)) unknown.push(['talabat', 'الإلغاء على: ' + o.detail.cancelOwner, o.id]);
    }
    for (const u of unknown.slice(0, 20)) await app.learn?.unknown(...u, now);
    const accepted = [], priorRows = new Map(), seen = new Set();
    const ids = [...new Set(list.filter(o => o && typeof o === 'object').map(o => String(o.id || '').replace(/\D/g, '').slice(0, 20)).filter(id => id.length >= 6))];
    const priorSql = `SELECT t.id,t.status,i.observed_at,p.data AS profile FROM talabat_orders t
      LEFT JOIN order_ingest i ON i.source='talabat' AND i.ref=t.id
      LEFT JOIN match_profiles p ON p.source='talabat' AND p.ref=t.id WHERE t.id IN `;
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = ids.slice(offset, offset + 50);
      for (const row of await db.prepare(priorSql + '(' + chunk.map(() => '?').join(',') + ')').all(...chunk)) priorRows.set(row.id, row);
    }
    let pendingWrites = [], pendingOrders = [];
    const flushOrders = async () => {
      if (!pendingWrites.length) return;
      const committed = await db.batch(pendingWrites);
      for (const item of pendingOrders) if (committed[item.orderIndex].changes) accepted.push(item.order);
      pendingWrites = []; pendingOrders = [];
    };
    for (const o of list) {
      if (!o || typeof o !== 'object') continue;
      const id = String(o.id || '').replace(/\D/g, '').slice(0, 20);
      if (id.length < 6) continue;
      if (seen.has(id)) {
        // Duplicate IDs in one input retain sequential semantics, without penalizing normal unique batches.
        await flushOrders();
        priorRows.set(id, await db.prepare(priorSql + '(?)').get(id));
      }
      seen.add(id);
      const prior = priorRows.get(id), meta = prior;
      const observed = ms(o.observedAt);
      if (o.observedAt && (!observed || observed > now + 300000)) continue;
      if (meta?.observed_at && (!observed || observed < meta.observed_at)) continue;
      const incoming = String(o.status || '').toUpperCase();
      if (prior?.status && incoming && statusRank(incoming) != null && statusRank(prior.status) != null && statusRank(incoming) < statusRank(prior.status)) continue;
      if (FINAL.has(prior?.status) && incoming && incoming !== prior.status) continue;
      // Optimistic guard makes the observation + order + profile one atomic update.
      const guard = "NOT EXISTS (SELECT 1 FROM order_ingest WHERE source = 'talabat' AND ref = ? AND COALESCE(observed_at, 0) > ?)";
      const orderWrites = [];
      const guardTime = observed || meta?.observed_at || 0;
      // The exact time comes with the details; until then the time shown on the list row (to the minute).
      const placed = ms(o.placedAt) || ms(o.receivedAt) || ms(o.listAt), d = o.detail || null;
      const customer = customerOf({ ...(o.customer || {}), ...(d?.customer || {}), phone: d?.customer?.phone || o.customer?.phone || o.phone || '' });
      if (Object.values(customer).some(Boolean)) {
        const old = parseJson(prior?.profile, {});
        for (const [k, v] of Object.entries(customer)) if (v) old[k] = v;
        orderWrites.push(db.prepare("INSERT INTO match_profiles (source, ref, data) SELECT 'talabat',?,? WHERE " + guard + " ON CONFLICT(source, ref) DO UPDATE SET data = excluded.data").bind(id, JSON.stringify(old), id, guardTime));
      }
      const items = d && Array.isArray(d.items) ? JSON.stringify(d.items.slice(0, 60).map(x => ({ qty: Number(x.qty) || 1, name: String(x.name || '').slice(0, 120), price: Number(x.price) || null }))) : null;
      orderWrites.push(db.prepare(`INSERT INTO talabat_orders (id, day, vendor_id, store, status, billable, placed_at, total, received_at, accept_seconds, accepted_at, picked_up_at, delivered_at,
          cancelled_at, cancel_owner, cancel_reason, items, subtotal, delivery_type, milestones, detail_at, first_seen, updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
        ON CONFLICT(id) DO UPDATE SET day = CASE WHEN excluded.placed_at IS NOT NULL THEN excluded.day ELSE talabat_orders.day END, vendor_id = COALESCE(excluded.vendor_id, talabat_orders.vendor_id), store = COALESCE(excluded.store, talabat_orders.store),
          status = COALESCE(excluded.status, talabat_orders.status), billable = COALESCE(excluded.billable, talabat_orders.billable), placed_at = CASE WHEN excluded.placed_at IS NOT NULL AND (talabat_orders.placed_at IS NULL OR talabat_orders.placed_at % 60000 = 0) THEN excluded.placed_at ELSE talabat_orders.placed_at END,
          total = COALESCE(excluded.total, talabat_orders.total), received_at = COALESCE(excluded.received_at, talabat_orders.received_at),
          accept_seconds = COALESCE(excluded.accept_seconds, talabat_orders.accept_seconds), accepted_at = COALESCE(excluded.accepted_at, talabat_orders.accepted_at),
          picked_up_at = COALESCE(excluded.picked_up_at, talabat_orders.picked_up_at), delivered_at = COALESCE(excluded.delivered_at, talabat_orders.delivered_at),
          cancelled_at = COALESCE(excluded.cancelled_at, talabat_orders.cancelled_at), cancel_owner = COALESCE(excluded.cancel_owner, talabat_orders.cancel_owner),
          cancel_reason = COALESCE(excluded.cancel_reason, talabat_orders.cancel_reason), items = COALESCE(excluded.items, talabat_orders.items), milestones = COALESCE(excluded.milestones, talabat_orders.milestones),
          subtotal = COALESCE(excluded.subtotal, talabat_orders.subtotal), delivery_type = COALESCE(excluded.delivery_type, talabat_orders.delivery_type),
          detail_at = CASE WHEN excluded.detail_at IS NOT NULL THEN excluded.detail_at WHEN excluded.status IS NOT talabat_orders.status THEN NULL ELSE talabat_orders.detail_at END,
          updated_at = excluded.updated_at`)
        .bind(id, businessDay(placed || now), o.vendorId ? String(o.vendorId).slice(0, 20) : null, o.store ? String(o.store).slice(0, 160) : null, String(o.status || '').toUpperCase().slice(0, 40) || null,
          d?.billable ? String(d.billable).slice(0, 40) : null, placed, Number(o.total) || null, ms(d?.receivedAt), Number.isFinite(d?.acceptSeconds) ? d.acceptSeconds : null, ms(d?.acceptedAt),
          ms(d?.pickedUpAt), ms(d?.deliveredAt), ms(d?.cancelledAt), d?.cancelOwner ? String(d.cancelOwner).slice(0, 60) : null, d?.cancelReason ? String(d.cancelReason).slice(0, 300) : null,
          items, Number(d?.subtotal) || null, d?.deliveryType ? String(d.deliveryType).slice(0, 60) : null, d?.milestones ? JSON.stringify(d.milestones).slice(0, 2000) : null, d ? now : null, now, now, id, guardTime));
      orderWrites.push(db.prepare("INSERT INTO order_ingest (source, ref, observed_at, updated_at) VALUES ('talabat',?,?,?) ON CONFLICT(source, ref) DO UPDATE SET observed_at = MAX(COALESCE(order_ingest.observed_at,0),COALESCE(excluded.observed_at,0)), updated_at = excluded.updated_at").bind(id, observed, now));
      pendingOrders.push({ order: o, orderIndex: pendingWrites.length + orderWrites.length - 2 });
      pendingWrites.push(...orderWrites);
      if (pendingOrders.length >= 25) await flushOrders();
    }
    await flushOrders();
    if (writes.length) await db.batch(writes);
    if (writes.length || accepted.length) { matchRevision++; matchCache.clear(); }
    await put('talabat_last_push', now);
    // What the monitor should open next: orders never read in detail or whose status changed since, and orders still
    // waiting at the branch (new / accepted / ready) read over a minute ago.
    const cancellationPending = "t.status = 'CANCELLED' AND (t.cancelled_at IS NULL OR NULLIF(TRIM(t.store),'') IS NULL OR NULLIF(TRIM(t.cancel_owner),'') IS NULL OR NULLIF(TRIM(t.cancel_reason),'') IS NULL)";
    const want = await db.prepare(`SELECT t.id FROM talabat_orders t LEFT JOIN order_ingest i ON i.source = 'talabat' AND i.ref = t.id
      WHERE t.updated_at >= ? AND (((${cancellationPending}) AND COALESCE(i.detail_attempts,0) < 5 AND COALESCE(i.detail_retry_at,0) <= ?)
      OR (t.status IS NOT 'CANCELLED' AND (t.detail_at IS NULL OR (t.status NOT IN ('COMPLETED','REJECTED','DELIVERED','PICKED UP') AND t.detail_at < ?))))
      ORDER BY t.status = 'CANCELLED' DESC, t.detail_at IS NOT NULL, t.placed_at DESC LIMIT 4`).all(now - 12 * 3600000, now, now - 60000);
    // Retry only requested incomplete cancellations, bounded and persisted across restarts.
    if (want.length) await db.batch(want.map(({ id }) => db.prepare(`INSERT INTO order_ingest (source,ref,detail_attempts,detail_retry_at,updated_at)
      SELECT 'talabat',id,1,?,? FROM talabat_orders WHERE id=? AND status='CANCELLED'
      ON CONFLICT(source,ref) DO UPDATE SET detail_attempts=order_ingest.detail_attempts+1, detail_retry_at=excluded.detail_retry_at, updated_at=excluded.updated_at`).bind(now + 60000, now, id)));
    const alertWork = maybeAlerts(now, accepted.some(o => String(o.status || '').toUpperCase() === 'CANCELLED'));
    if (db.kind === 'd1') ctx.waitUntil(alertWork.catch(error => console.error('Talabat alert pass failed', error?.message)));
    else await alertWork;
    // WhatsApp (when on): the customers' numbers for the welcome and the survey; «phones» tells the screen to read them.
    await app.whatsapp?.take(accepted, now);
    return { ok: true, want: want.map(r => r.id), phones: !!await app.whatsapp?.wantPhones(), serverNow: iso(now) };
  }, { limit: 1024 * 1024 });

  // ---- Talabat order ↔ Apex order ----
  // Resolve links only from unique, full-evidence matches. Manual choices remain proposals.
  // Time-only and partial-code candidates remain unconfirmed and cannot teach.
  const matchCache = new Map(), matchFlights = new Map();
  let matchRevision = 0;
  async function matchDay(day, options = {}) {
    const teach = !!options.teach, cached = matchCache.get(day);
    if (!teach && cached && Date.now() - cached.at < 8000) return cached.value;
    const running = matchFlights.get(day);
    if (running) { await running; if (!teach) return matchDay(day, options); }
    const revision = matchRevision;
    const flight = computeMatchDay(day, { teach });
    matchFlights.set(day, flight);
    try {
      const value = await flight;
      if (revision === matchRevision) matchCache.set(day, { at: Date.now(), value });
      while (matchCache.size > 4) matchCache.delete(matchCache.keys().next().value);
      return value;
    } finally { if (matchFlights.get(day) === flight) matchFlights.delete(day); }
  }
  async function computeMatchDay(day, { teach = false } = {}) {
    const rows = await db.prepare('SELECT * FROM talabat_orders WHERE day = ? AND (placed_at IS NOT NULL OR received_at IS NOT NULL) ORDER BY placed_at').all(day);
    const r = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
    let d = null; try { d = r ? JSON.parse(r.data) : null; } catch {}
    // Apex orders of طلبات, and the ones deleted after the pilot took them (a Talabat order cancelled late is one of them).
    const apex = [...(d?.online || []).filter(a => a.kind === 'طلبات' && a.at), ...(d?.cancels || []).filter(a => a.kind === 'طلبات' && a.entry).map(a => ({ ...a, at: a.entry, cancelled: true }))]
      .map(a => ({ ...a, t: Date.parse(a.at), tag: a.tag || null }));
    const manual = new Map((await db.prepare('SELECT talabat_id, apex_no FROM talabat_links WHERE day = ?').all(day)).map(x => [x.talabat_id, x.apex_no]));
    const names = app.apexNameMap ? await app.apexNameMap() : {};
    const aliases = app.learn ? await app.learn.pairs('match-v2:branch:talabat') : new Map();
    const branchOk = (store, apexBranch) => {
      const known = aliases.get(store);
      if (known && [...known.values()].reduce((a, b) => a + b, 0) >= 3) return known.has(apexBranch);
      return sameBranch(store, apexBranch);
    };
    const windowFor = async store => {
      const v = app.learn ? await app.learn.values('match-v2:delay:talabat', store) : [];
      if (v.length < 10) return WINDOW_MIN * 60000;
      const s = [...v].sort((a, b) => a - b), p95 = s[Math.floor(s.length * 0.95)];
      return Math.min(90, Math.max(15, p95 / 60 * 1.5)) * 60000;
    };
    const learnedItems = new Map(), itemPairs = app.learn ? await app.learn.pairs('match-v2:item:talabat') : new Map();
    for (const [n, m] of itemPairs) { const ok = new Map([...m].filter(([, c]) => c >= 2)); if (ok.size) learnedItems.set(n, ok); }
    const ratios = app.learn ? await app.learn.values('match-v2:ratio:talabat', '-') : [], ratio = ratios.length >= 5 ? [...ratios].sort((x, y) => x - y)[Math.floor(ratios.length / 2)] : 1.13;
    const profiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map(x => [x.ref, parseJson(x.data, {})]));
    const windows = new Map(); for (const o of rows) if (!windows.has(o.store)) windows.set(o.store, await windowFor(o.store));
    const decision = resolveOrders(rows.map(o => ({ ...o, source: 'talabat', branch: o.store, anchor: o.accepted_at || o.received_at || o.placed_at,
      amount: o.total || o.subtotal, customer: profiles.get(o.id), items: parseJson(o.items, []), excluded: o.status === 'REJECTED' })), apex,
      { manual, branchOk, windowFor: o => windows.get(o.store), learned: learnedItems, ratio });
    const { matches, how } = decision, usedA = decision.used;
    const evidence = new Map(rows.map(o => [o.id, []]));
    const record = (kind,a,b,ref,value=null) => evidence.get(ref)?.push({kind,a,b,value});
    // Learning from independently confirmed links.
    if (teach && app.learn) for (const o of rows) {
      const a = matches.get(o.id), h = how.get(o.id);
      if (!a || (h !== 'code' && h !== 'evidence')) continue;
      if (o.store && a.branch) record('match-v2:branch:talabat', o.store, a.branch, o.id);
      const anchor = o.accepted_at || o.received_at;
      if (o.store && anchor) record('match-v2:delay:talabat', o.store, '-', o.id, Math.max(0, (a.t - anchor) / 1000));
    }
    // The items: what Talabat received against what was entered on Apex (translated, same quantity, a fitting price).
    const okReviews = new Set((await db.prepare("SELECT ref FROM exception_reviews WHERE source = 'talabatItems' AND day = ? AND verdict = 'ok'").all(day)).map(r => r.ref));
    const itemsOf = new Map();
    for (const o of rows) {
      const a = matches.get(o.id); let ti = null; try { ti = JSON.parse(o.items || 'null'); } catch {}
      if (!a || !Array.isArray(ti) || !ti.length || !Array.isArray(a.items) || !a.items.length) continue;
      const c = compareItems(ti, a.items, { learned: learnedItems, ratio });
      c.reviewedOk = okReviews.has(o.id);
      itemsOf.set(o.id, c);
      const sure = how.get(o.id) === 'code' || how.get(o.id) === 'evidence';
      if (!teach || !app.learn || !sure || !c.ok) continue;   // only full-evidence automatic matches teach
      // Sure pairs teach the dish name and the price ratio. One left on each side with the same quantity and a fitting
      // price is the same dish under another name — also when the name is known with another Apex item (Talabat orders
      // are entered with Apex's own «طلبات» items); a wrong weight or dish has a price that does not fit, so it is never
      // learned. It counts once two orders showed it.
      for (const p of c.pairs) {
        record('match-v2:item:talabat', itemKey(p.talabat), String(p.apexNo).trim(), o.id);
        if (p.ratio && p.how === 'known') record('match-v2:ratio:talabat', '-', itemKey(p.talabat), o.id, p.ratio);
      }

    }
    if (teach && app.learn) for (const [id,facts] of evidence) await app.learn.replace('talabat',id,facts);
    const shape = (a, h, id) => a && { no: a.no, sn: a.sn ?? null, at: iso(a.t), user: names[a.user] || a.user || null, branch: a.branch, amount: a.amount ?? null, manual: h === 'manual', how: h || null, cancelled: !!a.cancelled,
      items: id && itemsOf.get(id) || null };
    return { rows, matches: new Map([...matches].map(([k, a]) => [k, shape(a, how.get(k), k)])), states: decision.states, hasApex: Array.isArray(d?.online), unmatchedApex: apex.filter(a => !usedA.has(String(a.no))).map(a => shape(a)) };
  }

  // ---- alerts: accepted and still not on Apex after 10 minutes (online group); cancelled (branches group) ----
  async function alerts(now) {
    const day = businessDay(now), m = await matchDay(day, { teach: true });
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
    const clock = t => new Date(t).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    const out = [], det = app.apexDetails ? await app.apexDetails(day) : { extra: () => '' };
    for (const o of m.rows) {
      const store = o.store ? '\nالفرع: ' + storeName(o.store) : '', ref = o.id; // the short #code staff use; the long id only when there is no code
      if (m.hasApex && o.accepted_at && !m.matches.get(o.id) && o.status !== 'CANCELLED' && now - o.accepted_at > NOT_ENTERED_MIN * 60000 && now - o.accepted_at < 3 * 3600000)
        out.push({ key: 'talabat:notEntered:' + o.id, kind: 'talabatNotEntered', target: 'online', text: '🛵 طلبات | ⚠️ أوردر اتقبل على طلبات ولسه ماتضربش على Apex\n' + talabatReference(o) + store + '\nاتقبل الساعة ' + clock(o.accepted_at) + '، وبقاله ' + Math.round((now - o.accepted_at) / 60000) + ' دقيقة' + (o.subtotal ? '\nقيمة الأوردر: ' + Math.round(o.subtotal) + ' ج' : '') });
      if (cancelReady(o) && now - o.cancelled_at < 3 * 3600000)
        out.push({ key: 'talabat:cancel:' + o.id, kind: 'talabatCancel', target: 'branches', branch: m.matches.get(o.id)?.branch || o.store || null, text: '🛵 طلبات | ❌ أوردر اتلغى على طلبات\n' + talabatReference(o) + store + '\nاتلغى الساعة ' + clock(o.cancelled_at) + (o.cancel_owner ? '\nالإلغاء على: ' + o.cancel_owner : '') + (o.cancel_reason ? '\nالسبب: ' + o.cancel_reason : '') + (o.subtotal ? '\nقيمة الأوردر: ' + Math.round(o.subtotal) + ' ج' : '') +
          (m.matches.get(o.id) ? det.extra(m.matches.get(o.id).no) : '') });
    }
    // «Accepted and not on Apex»: answered when it is entered on Apex, or cancelled on Talabat first.
    const open = new Set((await db.prepare("SELECT l.key FROM telegram_log l WHERE l.key LIKE 'talabat:notEntered:%' AND l.created_at >= ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key)").all(now - 12 * 3600000)).map(x => x.key));
    for (const o of m.rows) {
      const key = 'talabat:notEntered:' + o.id; if (!open.has(key)) continue;
      const a = m.matches.get(o.id), ref = o.id;
      let text = null;
      if (a) text = '🛵 طلبات | ✅ أوردر طلبات ' + ref + ' اتأكدت مطابقته على Apex' + ' · ' + (a.branch || '') + '\nالساعة ' + clock(Date.parse(a.at)) +
        (o.accepted_at ? ' (بعد ' + Math.round((Date.parse(a.at) - o.accepted_at) / 60000) + ' دقيقة من القبول)' : '') + (a.user ? ' · ضربه ' + a.user : '');
      else if (o.status === 'CANCELLED' || o.status === 'REJECTED') text = '🛵 طلبات | 🔄 أوردر طلبات ' + ref + ' اتلغى على طلبات قبل ما يتضرب على Apex' + (o.cancelled_at ? ' — الساعة ' + clock(o.cancelled_at) : '') + (o.cancel_reason ? '\nالسبب: ' + o.cancel_reason : '');
      if (text && !text.includes('هاشتاج طلبات:')) text += '\n' + talabatReference(o);
      if (text) out.push({ key: 'resolved:' + key, kind: 'talabatNotEntered', target: 'online', replyTo: key, text });
    }
    // A dish on Talabat that is not what was entered on Apex (only for orders tied by the #code or by hand: sure links).
    const sent = new Set((await db.prepare("SELECT key FROM telegram_log WHERE (key LIKE 'talabat:items:%' OR key LIKE 'resolved:talabat:items:%') AND created_at >= ?").all(now - 6 * 3600000)).map(x => x.key));
    for (const o of m.rows) {
      const a = m.matches.get(o.id), c = a?.items, key = 'talabat:items:' + o.id;
      if (!c || (a.how !== 'code' && a.how !== 'evidence')) continue;
      if (!c.ok && !c.uncertain && !c.reviewedOk && !sent.has(key) && now - (o.accepted_at || o.placed_at || now) < 3 * 3600000)
        out.push({ key, kind: 'talabatItems', target: 'online', text: '🛵 طلبات | 🍽️ صنف ممكن يكون متضرب غلط على Apex\n' + talabatReference(o) + ' · ' + (a.branch || '') + (a.user ? '\nاللي ضرب الأوردر: ' + a.user : '') +
          (c.missingOnApex.length ? '\nعلى طلبات ومش على Apex: ' + c.missingOnApex.join('، ') : '') + (c.extraOnApex.length ? '\nعلى Apex ومش على طلبات: ' + c.extraOnApex.join('، ') : '') });
      else if ((c.ok || c.reviewedOk) && sent.has(key) && !sent.has('resolved:' + key))
        out.push({ key: 'resolved:' + key, kind: 'talabatItems', target: 'online', replyTo: key, text: '🛵 طلبات | ✅ أوردر طلبات ' + (o.code ? '#' + o.code : o.id) + ': الأصناف بقت مطابقة على Apex' + (c.reviewedOk && !c.ok ? ' (اتراجع: مش غلط)' : '') });
    }
    if (out.length) await db.batch(out.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, reply_to, branch) VALUES (?,?,?,?,?,?,?,?,?)').bind(a.key, a.kind, null, a.text, now, r[a.kind] === false && !a.replyTo ? now : null, a.target, a.replyTo || null, a.branch || null)));
  }

  // Order pushes arrive in bursts while the monitor reads details. Alert matching is expensive,
  // and the rules only change meaningfully every few seconds, so share one in-flight pass and cap it.
  let alertsAt = 0, alertsFlight = null;
  async function maybeAlerts(now, force = false) {
    if (alertsFlight) { await alertsFlight; if (!force) return; }
    if (!force && now - alertsAt < 30000) return;
    alertsFlight = alerts(now).then(value => { alertsAt = now; return value; }).finally(() => { alertsFlight = null; });
    return alertsFlight;
  }

  // ---- the admin page ----
  app.talabat = { matchDay, invalidate: day => { matchRevision++; matchCache.delete(day); } };
  app.route('GET', '/api/talabat/day', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const m = await matchDay(day), last = Number(await setting('talabat_last_push')) || null;
    const ingestion = new Map((await db.prepare("SELECT ref, detail_attempts, detail_retry_at FROM order_ingest WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map(r => [r.ref,r]));
    let parse = x => { try { return JSON.parse(x); } catch { return null; } };
    return { day, linked: !!await setting('talabat_token_hash'), lastPush: iso(last), stale: !last || ctx.now - last > STALE_MS, apexLinked: m.hasApex, serverNow: iso(ctx.now),
      orders: m.rows.map(o => ({ id: o.id, cancellationReadiness: o.status !== 'CANCELLED' ? null : cancelReady(o) ? 'READY' : (ingestion.get(o.id)?.detail_attempts >= 5 ? 'FAILED' : 'PENDING'), detailAttempts: ingestion.get(o.id)?.detail_attempts || 0, store: storeName(o.store), status: o.status, billable: o.billable, placedAt: iso(o.placed_at), total: o.total, receivedAt: iso(o.received_at), acceptSeconds: o.accept_seconds,
        acceptedAt: iso(o.accepted_at), pickedUpAt: iso(o.picked_up_at), deliveredAt: iso(o.delivered_at), cancelledAt: iso(o.cancelled_at), cancelOwner: o.cancel_owner, cancelReason: o.cancel_reason,
        code: o.code, steps: parse(o.milestones) || null, items: parse(o.items) || [], subtotal: o.subtotal, deliveryType: o.delivery_type, detailRead: !!o.detail_at, final: FINAL.has(o.status), apex: m.matches.get(o.id) || null, matching: m.states.get(o.id) || null })),
      unmatchedApex: m.unmatchedApex };
  });
  app.route('POST', '/api/talabat/link', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const id = String(ctx.body.talabatId || ''), no = ctx.body.apexNo == null || ctx.body.apexNo === '' ? null : String(ctx.body.apexNo);
    const o = await db.prepare('SELECT day FROM talabat_orders WHERE id = ?').get(id);
    if (!o) fail(404, 'الأوردر مش موجود');
    if (no != null && no !== 'none') {
      const snap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(o.day))?.data, {});
      if (![...(snap.online || []), ...(snap.cancels || [])].some(a => String(a.no) === no && a.kind === 'طلبات')) fail(400, 'أوردر Apex غير موجود في نفس اليوم والمصدر');
      if (await db.prepare('SELECT talabat_id FROM talabat_links WHERE day = ? AND apex_no = ? AND talabat_id != ?').get(o.day, no, id)) fail(409, 'أوردر Apex مربوط يدويًا بأوردر آخر');
    }
    const before = await db.prepare('SELECT apex_no, set_by, set_at FROM talabat_links WHERE talabat_id = ?').get(id);
    // null clears a manual link; 'none' marks it as having no Apex order.
    if (no === null) await db.prepare('DELETE FROM talabat_links WHERE talabat_id = ?').run(id);
    else await db.prepare('INSERT INTO talabat_links (talabat_id, day, apex_no, set_by, set_at) VALUES (?,?,?,?,?) ON CONFLICT(talabat_id) DO UPDATE SET apex_no = excluded.apex_no, set_by = excluded.set_by, set_at = excluded.set_at')
      .run(id, o.day, no === 'none' ? null : no, who.name, ctx.now);
    await app.audit('talabat_link', null, { actor: who.name, talabatId: id, apexNo: no, before: before || null, after: no, reason: String(ctx.body.reason || '').slice(0,500) || null });
    await matchDay(o.day, { teach: true });
    return { ok: true };
  });
}

export { setup, sameBranch };
