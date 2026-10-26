// طلبات: one monitor screen (Firefox on a PC that stays on, signed in with the call center's Talabat account that sees
// every branch) reads Order History and each order's details, and pushes them here. Per order we keep the times
// (received, accepted and how fast, picked up, delivered, cancelled), the cancellation owner and reason, the items and
// the subtotal. No customer data. Each order is then tied to its Apex order (who entered it and when).
import { businessDay, iso, validDate } from './time.js';
import { sha256, randomToken } from './security.js';
import { compareItems, itemKey, SEED } from './items.js';

const NOT_ENTERED_MIN = 10, STALE_MS = 5 * 60000, WINDOW_MIN = 45;
const FINAL = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERED']);
const KNOWN_STATUS = new Set([...FINAL, 'NEW', 'ACCEPTED', 'READY', 'READY FOR PICKUP', 'PICKED UP', 'IN DELIVERY', 'PREORDER ACCEPTED']);
const KNOWN_STEP = new Set(['DISPLAYED_AT_VENDOR', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED']);
const KNOWN_OWNER = new Set(['Customer', 'Vendor', 'Platform', 'Transport', 'Rider']);
const norm = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^\s*(فرع|الدهان)[\s,،]*/g, '').trim();
// "الدهان، التجمع الخامس - البنفسج" ~ "التجمع"; "الدهان سيتي ستار مول" ~ "سيتي ستار".
function sameBranch(a, b) {
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
      const st = String(o.status || '').toUpperCase();
      if (st && !KNOWN_STATUS.has(st)) unknown.push(['talabat', 'حالة: ' + st, o.id]);
      for (const k of Object.keys(o.detail?.milestones || {})) if (!KNOWN_STEP.has(k)) unknown.push(['talabat', 'خطوة: ' + k, o.id]);
      if (o.detail?.cancelOwner && !KNOWN_OWNER.has(o.detail.cancelOwner)) unknown.push(['talabat', 'الإلغاء على: ' + o.detail.cancelOwner, o.id]);
    }
    for (const u of unknown.slice(0, 20)) await app.learn?.unknown(...u, now);
    for (const o of list) {
      const id = String(o.id || '').replace(/\D/g, '').slice(0, 20);
      if (id.length < 6) continue;
      // The exact time comes with the details; until then the time shown on the list row (to the minute).
      const placed = ms(o.placedAt) || ms(o.receivedAt) || ms(o.listAt), d = o.detail || null;
      const items = d && Array.isArray(d.items) ? JSON.stringify(d.items.slice(0, 60).map(x => ({ qty: Number(x.qty) || 1, name: String(x.name || '').slice(0, 120), price: Number(x.price) || null }))) : null;
      writes.push(db.prepare(`INSERT INTO talabat_orders (id, day, vendor_id, store, status, billable, placed_at, total, received_at, accept_seconds, accepted_at, picked_up_at, delivered_at,
          cancelled_at, cancel_owner, cancel_reason, items, subtotal, delivery_type, milestones, detail_at, first_seen, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET day = CASE WHEN excluded.placed_at IS NOT NULL THEN excluded.day ELSE talabat_orders.day END, vendor_id = COALESCE(excluded.vendor_id, talabat_orders.vendor_id), store = COALESCE(excluded.store, talabat_orders.store),
          status = excluded.status, billable = COALESCE(excluded.billable, talabat_orders.billable), placed_at = CASE WHEN excluded.placed_at IS NOT NULL AND (talabat_orders.placed_at IS NULL OR talabat_orders.placed_at % 60000 = 0) THEN excluded.placed_at ELSE talabat_orders.placed_at END,
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
          items, Number(d?.subtotal) || null, d?.deliveryType ? String(d.deliveryType).slice(0, 60) : null, d?.milestones ? JSON.stringify(d.milestones).slice(0, 2000) : null, d ? now : null, now, now));
    }
    if (writes.length) await db.batch(writes);
    await put('talabat_last_push', now);
    // What the monitor should open next: orders never read in detail or whose status changed since, and orders still
    // waiting at the branch (new / accepted / ready) read over a minute ago.
    const want = await db.prepare(`SELECT id FROM talabat_orders WHERE updated_at >= ? AND (detail_at IS NULL OR (status NOT IN ('COMPLETED','CANCELLED','REJECTED','DELIVERED','PICKED UP') AND detail_at < ?)) ORDER BY detail_at IS NOT NULL, placed_at DESC LIMIT 20`)
      .all(now - 12 * 3600000, now - 60000);
    await alerts(now);
    // WhatsApp (when on): the customers' numbers for the welcome and the survey; «phones» tells the screen to read them.
    await app.whatsapp?.take(list, now);
    return { ok: true, want: want.map(r => r.id), phones: !!await app.whatsapp?.wantPhones(), serverNow: iso(now) };
  }, { limit: 1024 * 1024 });

  // ---- Talabat order ↔ Apex order ----
  // 1) Sure: the #code written on Apex next to the customer (the short code, or the full number) — always wins.
  // 2) A supervisor's manual link.
  // 3) Otherwise by branch and time: entered on Apex from 2 minutes before acceptance until the window this branch
  //    usually needs (learned; 45 minutes until there is enough evidence), closest in time, the items' subtotal as
  //    tie-breaker (the platform total has discounts and fees).
  // Every sure or manual link teaches which Apex branch name each Talabat store is, and how long the branch takes.
  async function matchDay(day, { teach = false } = {}) {
    const rows = await db.prepare('SELECT * FROM talabat_orders WHERE day = ? AND (placed_at IS NOT NULL OR received_at IS NOT NULL) ORDER BY placed_at').all(day);
    const r = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
    let d = null; try { d = r ? JSON.parse(r.data) : null; } catch {}
    // Apex orders of طلبات, and the ones deleted after the pilot took them (a Talabat order cancelled late is one of them).
    const apex = [...(d?.online || []).filter(a => a.kind === 'طلبات' && a.at), ...(d?.cancels || []).filter(a => a.kind === 'طلبات' && a.entry).map(a => ({ ...a, at: a.entry, cancelled: true }))]
      .map(a => ({ ...a, t: Date.parse(a.at), tag: a.tag ? String(a.tag).replace(/\D/g, '') : null }));
    const manual = new Map((await db.prepare('SELECT talabat_id, apex_no FROM talabat_links WHERE day = ?').all(day)).map(x => [x.talabat_id, x.apex_no]));
    const names = app.apexNameMap ? await app.apexNameMap() : {};
    const aliases = app.learn ? await app.learn.pairs('branch:talabat') : new Map();
    const branchOk = (store, apexBranch) => {
      const known = aliases.get(store);
      if (known && [...known.values()].reduce((a, b) => a + b, 0) >= 3) return known.has(apexBranch);
      return sameBranch(store, apexBranch);
    };
    const windowFor = async store => {
      const v = app.learn ? await app.learn.values('delay:talabat', store) : [];
      if (v.length < 10) return WINDOW_MIN * 60000;
      const s = [...v].sort((a, b) => a - b), p95 = s[Math.floor(s.length * 0.95)];
      return Math.min(90, Math.max(15, p95 / 60 * 1.5)) * 60000;
    };
    const byNo = new Map(apex.map(a => [String(a.no), a])), usedA = new Set(), matches = new Map(), how = new Map();
    // 1) the #code
    for (const o of rows) {
      const a = apex.find(x => x.tag && !usedA.has(String(x.no)) && (x.tag === o.code || x.tag === o.id || (o.id.endsWith(x.tag) && x.tag.length >= 6)));
      if (a) { matches.set(o.id, a); usedA.add(String(a.no)); how.set(o.id, 'code'); }
    }
    // 2) manual
    for (const [tid, no] of manual) if (!matches.has(tid) && no != null && byNo.has(String(no)) && !usedA.has(String(no))) { matches.set(tid, byNo.get(String(no))); usedA.add(String(no)); how.set(tid, 'manual'); }
    // 3) branch and time
    const pairs = [];
    for (const o of rows) {
      if (matches.has(o.id) || manual.has(o.id) || o.status === 'REJECTED') continue;
      const anchor = o.accepted_at || o.received_at || o.placed_at;
      if (!anchor) continue;
      const win = await windowFor(o.store);
      for (const a of apex) {
        if (usedA.has(String(a.no)) || (a.tag && a.tag !== o.code) || a.t < anchor - 2 * 60000 || a.t > anchor + win) continue;
        if (branchOk(o.store, a.branch) === false) continue;
        const money = o.subtotal && a.amount ? Math.min(1, Math.abs(o.subtotal - a.amount) / Math.max(o.subtotal, 1)) : 0.3;
        pairs.push({ o: o.id, a, score: Math.abs(a.t - anchor) / 60000 + money * 15 });
      }
    }
    pairs.sort((x, y) => x.score - y.score);
    for (const p of pairs) { if (matches.has(p.o) || usedA.has(String(p.a.no))) continue; matches.set(p.o, p.a); usedA.add(String(p.a.no)); how.set(p.o, 'time'); }
    // Learning from the sure links.
    if (teach && app.learn) for (const o of rows) {
      const a = matches.get(o.id), h = how.get(o.id);
      if (!a || (h !== 'code' && h !== 'manual')) continue;
      if (o.store && a.branch) await app.learn.record('branch:talabat', o.store, a.branch, o.id);
      const anchor = o.accepted_at || o.received_at;
      if (o.store && anchor) await app.learn.record('delay:talabat', o.store, '-', o.id, Math.max(0, (a.t - anchor) / 1000));
    }
    // The items: what Talabat received against what was entered on Apex (translated, same quantity, a fitting price).
    const learnedItems = new Map(), itemPairs = app.learn ? await app.learn.pairs('item:talabat') : new Map();
    for (const [n, m] of itemPairs) { const ok = new Map([...m].filter(([, c]) => c >= 2)); if (ok.size) learnedItems.set(n, ok); }
    const ratios = app.learn ? await app.learn.values('ratio:talabat', '-') : [], ratio = ratios.length >= 5 ? [...ratios].sort((x, y) => x - y)[Math.floor(ratios.length / 2)] : 1.13;
    const okReviews = new Set((await db.prepare("SELECT ref FROM exception_reviews WHERE source = 'talabatItems' AND day = ? AND verdict = 'ok'").all(day)).map(r => r.ref));
    const itemsOf = new Map();
    for (const o of rows) {
      const a = matches.get(o.id); let ti = null; try { ti = JSON.parse(o.items || 'null'); } catch {}
      if (!a || !Array.isArray(ti) || !ti.length || !Array.isArray(a.items) || !a.items.length) continue;
      const c = compareItems(ti, a.items, { learned: learnedItems, ratio });
      c.reviewedOk = okReviews.has(o.id);
      itemsOf.set(o.id, c);
      const sure = how.get(o.id) === 'code' || how.get(o.id) === 'manual';
      if (!teach || !app.learn || !(sure || c.ok || how.get(o.id) === 'time')) continue;
      // Sure pairs teach the dish name and the price ratio. One left on each side with the same quantity and a fitting
      // price is the same dish under another name — also when the name is known with another Apex item (Talabat orders
      // are entered with Apex's own «طلبات» items); a wrong weight or dish has a price that does not fit, so it is never
      // learned. It counts once two orders showed it.
      if (sure || c.ok) for (const p of c.pairs) {
        await app.learn.record('item:talabat', itemKey(p.talabat), String(p.apexNo).trim(), o.id);
        if (p.ratio && p.how === 'known') await app.learn.record('ratio:talabat', '-', itemKey(p.talabat), o.id, p.ratio);
      }
      if (c.missingOnApex.length === 1 && c.extraOnApex.length === 1 && c.unmatched) {
        const [t] = c.unmatched.talabat, [x] = c.unmatched.apex;
        if (Math.abs((t.qty || 1) - (x.qty || 1)) < 0.01 && (c.reviewedOk || (t.price && x.price && Math.abs(t.price / (t.qty || 1) / x.price - ratio) / ratio < 0.08)))
          await app.learn.record('item:talabat', itemKey(t.name), String(x.no).trim(), o.id);
      }
    }
    const shape = (a, h, id) => a && { no: a.no, sn: a.sn ?? null, at: iso(a.t), user: names[a.user] || a.user || null, branch: a.branch, amount: a.amount ?? null, manual: h === 'manual', how: h || null, cancelled: !!a.cancelled,
      items: id && itemsOf.get(id) || null };
    return { rows, matches: new Map([...matches].map(([k, a]) => [k, shape(a, how.get(k), k)])), hasApex: Array.isArray(d?.online), unmatchedApex: apex.filter(a => !usedA.has(String(a.no))).map(a => shape(a)) };
  }

  // ---- alerts: accepted and still not on Apex after 10 minutes (online group); cancelled (branches group) ----
  async function alerts(now) {
    const day = businessDay(now), m = await matchDay(day, { teach: true });
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
    const clock = t => new Date(t).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    const out = [], det = app.apexDetails ? await app.apexDetails(day) : { extra: () => '', status: () => '' };
    for (const o of m.rows) {
      const store = o.store ? '\n' + o.store : '', ref = o.code ? '#' + o.code : o.id; // the short #code staff use; the long id only when there is no code
      if (m.hasApex && o.accepted_at && !m.matches.get(o.id) && o.status !== 'CANCELLED' && now - o.accepted_at > NOT_ENTERED_MIN * 60000 && now - o.accepted_at < 3 * 3600000)
        out.push({ key: 'talabat:notEntered:' + o.id, kind: 'talabatNotEntered', target: 'online', text: '🛵 طلبات | ⚠️ أوردر اتقبل على طلبات ولسه ماتضربش على Apex\nرقم أوردر طلبات: ' + ref + store + '\nاتقبل الساعة ' + clock(o.accepted_at) + '، وبقاله ' + Math.round((now - o.accepted_at) / 60000) + ' دقيقة' + (o.subtotal ? '\nقيمة الأوردر: ' + Math.round(o.subtotal) + ' ج' : '') });
      if (o.status === 'CANCELLED' && o.cancelled_at && now - o.cancelled_at < 3 * 3600000)
        out.push({ key: 'talabat:cancel:' + o.id, kind: 'talabatCancel', target: 'branches', branch: m.matches.get(o.id)?.branch || o.store || null, text: '🛵 طلبات | ❌ أوردر اتلغى على طلبات\nرقم أوردر طلبات: ' + ref + store + '\nاتلغى الساعة ' + clock(o.cancelled_at) + (o.cancel_owner ? '\nالإلغاء على: ' + o.cancel_owner : '') + (o.cancel_reason ? '\nالسبب: ' + o.cancel_reason : '') + (o.subtotal ? '\nقيمة الأوردر: ' + Math.round(o.subtotal) + ' ج' : '') +
          (m.matches.get(o.id) ? '\nرقمه على Apex: ' + (m.matches.get(o.id).sn ?? m.matches.get(o.id).no) + det.extra(m.matches.get(o.id).no) : '') + det.status(m.matches.get(o.id)?.branch || o.store) });
    }
    // «Accepted and not on Apex»: answered when it is entered on Apex, or cancelled on Talabat first.
    const open = new Set((await db.prepare("SELECT l.key FROM telegram_log l WHERE l.key LIKE 'talabat:notEntered:%' AND l.created_at >= ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key)").all(now - 12 * 3600000)).map(x => x.key));
    for (const o of m.rows) {
      const key = 'talabat:notEntered:' + o.id; if (!open.has(key)) continue;
      const a = m.matches.get(o.id), ref = o.code ? '#' + o.code : o.id;
      let text = null;
      if (a) text = '🛵 طلبات | ✅ أوردر طلبات ' + ref + ' اتضرب على Apex — أوردر ' + (a.sn ?? a.no) + ' · ' + (a.branch || '') + '\nالساعة ' + clock(Date.parse(a.at)) +
        (o.accepted_at ? ' (بعد ' + Math.round((Date.parse(a.at) - o.accepted_at) / 60000) + ' دقيقة من القبول)' : '') + (a.user ? ' · ضربه ' + a.user : '');
      else if (o.status === 'CANCELLED' || o.status === 'REJECTED') text = '🛵 طلبات | 🔄 أوردر طلبات ' + ref + ' اتلغى على طلبات قبل ما يتضرب على Apex' + (o.cancelled_at ? ' — الساعة ' + clock(o.cancelled_at) : '') + (o.cancel_reason ? '\nالسبب: ' + o.cancel_reason : '');
      if (text) out.push({ key: 'resolved:' + key, kind: 'talabatNotEntered', target: 'online', replyTo: key, text });
    }
    // A dish on Talabat that is not what was entered on Apex (only for orders tied by the #code or by hand: sure links).
    const sent = new Set((await db.prepare("SELECT key FROM telegram_log WHERE (key LIKE 'talabat:items:%' OR key LIKE 'resolved:talabat:items:%') AND created_at >= ?").all(now - 6 * 3600000)).map(x => x.key));
    for (const o of m.rows) {
      const a = m.matches.get(o.id), c = a?.items, key = 'talabat:items:' + o.id;
      if (!c || (a.how !== 'code' && a.how !== 'manual')) continue;
      if (!c.ok && !c.reviewedOk && !sent.has(key) && now - (o.accepted_at || o.placed_at || now) < 3 * 3600000)
        out.push({ key, kind: 'talabatItems', target: 'online', text: '🛵 طلبات | 🍽️ صنف ممكن يكون متضرب غلط على Apex\nرقم أوردر طلبات: ' + (o.code ? '#' + o.code : o.id) + '\nرقمه على Apex: ' + (a.sn ?? a.no) + ' · ' + (a.branch || '') + (a.user ? '\nاللي ضرب الأوردر: ' + a.user : '') +
          (c.missingOnApex.length ? '\nعلى طلبات ومش على Apex: ' + c.missingOnApex.join('، ') : '') + (c.extraOnApex.length ? '\nعلى Apex ومش على طلبات: ' + c.extraOnApex.join('، ') : '') });
      else if ((c.ok || c.reviewedOk) && sent.has(key) && !sent.has('resolved:' + key))
        out.push({ key: 'resolved:' + key, kind: 'talabatItems', target: 'online', replyTo: key, text: '🛵 طلبات | ✅ أوردر طلبات ' + (o.code ? '#' + o.code : o.id) + ': الأصناف بقت مطابقة على Apex' + (c.reviewedOk && !c.ok ? ' (اتراجع: مش غلط)' : '') });
    }
    if (out.length) await db.batch(out.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, reply_to, branch) VALUES (?,?,?,?,?,?,?,?,?)').bind(a.key, a.kind, null, a.text, now, r[a.kind] === false && !a.replyTo ? now : null, a.target, a.replyTo || null, a.branch || null)));
  }

  // ---- the admin page ----
  app.talabat = { matchDay };
  app.route('GET', '/api/talabat/day', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const m = await matchDay(day), last = Number(await setting('talabat_last_push')) || null;
    let parse = x => { try { return JSON.parse(x); } catch { return null; } };
    return { day, linked: !!await setting('talabat_token_hash'), lastPush: iso(last), stale: !last || ctx.now - last > STALE_MS, apexLinked: m.hasApex, serverNow: iso(ctx.now),
      orders: m.rows.map(o => ({ id: o.id, store: o.store, status: o.status, billable: o.billable, placedAt: iso(o.placed_at), total: o.total, receivedAt: iso(o.received_at), acceptSeconds: o.accept_seconds,
        acceptedAt: iso(o.accepted_at), pickedUpAt: iso(o.picked_up_at), deliveredAt: iso(o.delivered_at), cancelledAt: iso(o.cancelled_at), cancelOwner: o.cancel_owner, cancelReason: o.cancel_reason,
        code: o.code, steps: parse(o.milestones) || null, items: parse(o.items) || [], subtotal: o.subtotal, deliveryType: o.delivery_type, detailRead: !!o.detail_at, final: FINAL.has(o.status), apex: m.matches.get(o.id) || null })),
      unmatchedApex: m.unmatchedApex };
  });
  app.route('POST', '/api/talabat/link', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const id = String(ctx.body.talabatId || ''), no = ctx.body.apexNo == null || ctx.body.apexNo === '' ? null : String(ctx.body.apexNo);
    const o = await db.prepare('SELECT day FROM talabat_orders WHERE id = ?').get(id);
    if (!o) fail(404, 'الأوردر مش موجود');
    // null clears a manual link; 'none' marks it as having no Apex order.
    if (no === null) await db.prepare('DELETE FROM talabat_links WHERE talabat_id = ?').run(id);
    else await db.prepare('INSERT INTO talabat_links (talabat_id, day, apex_no, set_by, set_at) VALUES (?,?,?,?,?) ON CONFLICT(talabat_id) DO UPDATE SET apex_no = excluded.apex_no, set_by = excluded.set_by, set_at = excluded.set_at')
      .run(id, o.day, no === 'none' ? null : no, who.name, ctx.now);
    await app.audit('talabat_link', null, { actor: who.name, talabatId: id, apexNo: no });
    await matchDay(o.day, { teach: true });
    return { ok: true };
  });
}

export { setup, sameBranch };
