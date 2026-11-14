// التحويل الآلي الكامل (Karim 11-11: «عايز اعمل تحويل طلبات تلقائي» — طلبات والموقع، كل الفروع).
// Every few seconds the open orders of the transfer page are checked. An order is sent to Apex by itself (the same job as
// the page's button, as «المرصد آلي») only when everything is certain:
//  - every dish and paid add-on has one Apex item (one candidate, or the one staff chose for it before), all add-ons seen;
//  - the branch is known, and the area: a branch pickup, the Apex area staff chose for this Talabat area before (2+ times),
//    or the area of this customer's last automatic order to the same address; the area belongs to that branch;
//  - cash or paid is clear, and who pays every discount (a paid order needs nothing more);
//  - the customer's card on Apex was read in the last 10 minutes; a cash order with one clear discount on it is discounted
//    by itself — a paid order's discount (the customer's gift or keeping it) and free items on the card wait for a person;
//  - every item has an Apex price; item price differences do not block transfer and remain visible in the admin
//    price-difference review; Talabat's delivery still has to match the area's delivery on Apex;
//  - nobody has the order and it is not on Apex already.
// Otherwise the order stays for the employee with the reason shown on the transfer page; when the mode is «on» and it is
// still waiting after 2 minutes, the call center group is told on Telegram (once per order).
// Modes (admin): off · trial (only records what would have been sent) · on.
import { businessDay, iso } from './time.js';
import { parseJson } from './order-match.js';
import { deliveryComment } from './delivery-fields.js';
import { normArabic } from './apex-customer-notes.js';
import { areaGroups, areaForBranch } from './apex-areas.js';
import { APEX_PRICES } from './menu-seed.js';

export const MODES = ['off', 'trial', 'on'];
const QUIET = new Set(['لسه واصل', 'أوردر مجدول', 'تفاصيل الأوردر لسه ماوصلتش', 'لسه ما اتقبلش على طلبات', 'أوردر قديم — غالباً اتسجل بإيد', 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد']);
const TICK_MS = 60000, SETTLE_MS = 60000, MAX_AGE_MS = 20 * 60000, ALERT_MS = 2 * 60000;
const r2 = v => Math.round(v * 100) / 100, T = v => r2(v * 1.14);
const TALABAT_FEE_NO = '0114006', BRANCH_NAME = { 1: 'التجمع', 2: 'مدينة نصر', 3: 'مدينتي' };
const amountIn = t => { const m = String(t || '').split(' | ').slice(1).join(' ').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
const billAmount = (o, re) => { const b = (o.bill || []).find(x => re.test(x.k || '')); return b ? amountIn(b.text) : null; };
export const freeDelivery = o => /توصيل\s*مجان|free\s*delivery|talabat\s*pro|طلبات\s*برو/i.test((o.bill || []).map(x => (x.k || '') + ' ' + (x.text || '')).join(' ') + ' ' + (o.note || ''));
const normAddress = t => normArabic(String(t || '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 200);

// The Apex item for one line: one candidate, or the one staff chose for it before (the page's own first pick).
const pickOf = i => (i.apex || []).length === 1 ? i.apex[0].no : i.apexPick && (i.apex || []).some(a => a.no === i.apexPick) ? i.apexPick : '';

// Whether an order can be sent by itself, and the body for /api/transfer/job (the same the page sends).
// `x`: { now, locations, customerArea(o) → locationNo|null }. Returns null for an order that is not waiting (done, on
// Apex, with somebody), else { ok, why[], quiet, body }.
// The reasons of the orders left to staff, counted. A reason that names a dish or an area («صنف مش معروف على Apex: X»,
// «منطقة «X» لسه ما اتعلمتش») is counted once under its kind, with the names it gave. Reasons that only say the order was
// handled by a person first («لسه واصل», «أوردر قديم», «اتحوّل للفرع») count only when nothing else stopped it.
const BEFORE = new Set(['لسه واصل', 'أوردر قديم — غالباً اتسجل بإيد', 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد']);
export function reasonKind(r) {
  const s = String(r || '').trim();
  let m = /^(صنف (?:مش معروف على Apex|ليه أكتر من اختيار على Apex)):\s*(.+?)(?:\s*\(\+\d+\))?$/.exec(s); if (m) return [m[1], m[2]];
  if ((m = /^منطقة «(.+)» لسه ما اتعلمتش على Apex$/.exec(s))) return ['منطقة لسه ما اتعلمتش على Apex', m[1]];
  if (/^هاشتاج طلبات لسه ماظهرش/.test(s)) return ['هاشتاج طلبات لسه ماظهرش', null];
  return [s.length > 120 ? s.slice(0, 120) + '…' : s, null];
}
export function autoReport(rows) {
  const by = { talabat: { all: 0, auto: 0, would: 0, staff: 0 }, site: { all: 0, auto: 0, would: 0, staff: 0 } }, reasons = new Map();
  for (const r of rows) {
    const t = by[r.source] || (by[r.source] = { all: 0, auto: 0, would: 0, staff: 0 });
    t.all++;
    if (r.decision === 'sent') { t.auto++; continue; }
    if (r.decision === 'would') { t.would++; continue; }
    t.staff++;
    const all = String(r.reasons || '').split(' · ').map(x => x.trim()).filter(Boolean);
    const real = all.filter(x => !BEFORE.has(x)), use = real.length ? real : all.length ? [all.find(x => x !== 'لسه واصل') || all[0]] : ['غير معروف'];
    for (const x of new Set(use)) {
      const [kind, detail] = reasonKind(x), e = reasons.get(kind) || { reason: kind, orders: 0, talabat: 0, site: 0, details: new Map(), codes: [] };
      e.orders++; e[r.source] = (e[r.source] || 0) + 1;
      if (detail) e.details.set(detail, (e.details.get(detail) || 0) + 1);
      if (e.codes.length < 8) e.codes.push((r.source === 'talabat' ? 'طلبات #' : 'الموقع #') + (r.code || r.ref));
      reasons.set(kind, e);
    }
  }
  const staff = Object.values(by).reduce((n, t) => n + t.staff, 0);
  return { totals: by, staff, reasons: [...reasons.values()].sort((a, b) => b.orders - a.orders).map(e => ({ ...e, share: staff ? Math.round(e.orders / staff * 100) : 0,
    details: [...e.details].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, n]) => ({ name, n })) })) };
}

export function decide(o, x) {
  if (!o || o.done || o.apex || o.out) return null;
  if (o.job) return null;
  const why = [], warnings = [];
  const age = x.now - Date.parse(o.at || 0);
  if (!(age >= SETTLE_MS)) why.push('لسه واصل');
  // 11-11: an old order is one staff already handled (entered on Apex by hand, matching did not find it) — 9 website
  // orders of the day were written twice. Only orders of the last 20 minutes; a website order staff already sent to a
  // branch on the panel is handled.
  if (age > MAX_AGE_MS) why.push('أوردر قديم — غالباً اتسجل بإيد');
  if (o.source === 'site' && o.sentToBranch) why.push('اتحوّل للفرع على الموقع — غالباً اتسجل بإيد');
  if (o.scheduled) why.push('أوردر مجدول');
  if (o.source === 'talabat' && /^(?:NEW|PENDING|WAITING|RECEIVED|PLACED|UNACCEPTED)/i.test(String(o.status || ''))) why.push('لسه ما اتقبلش على طلبات');
  if (o.source === 'talabat' && /pick|استلام/i.test(String(o.deliveryType || ''))) why.push('استلام من الفرع على طلبات');
  if (o.source === 'talabat' && !String(o.code || '').replace(/\D/g, '')) why.push('هاشتاج طلبات لسه ماظهرش');   // Karim 11-14: never written without it
  if (!o.items?.length) { why.push(o.detailRead ? 'مفيش أصناف' : 'تفاصيل الأوردر لسه ماوصلتش'); return { ok: false, why, quiet: why.every(w => QUIET.has(w)) }; }
  if (o.source === 'talabat' && o.items.some(i => !i.modifiersComplete)) why.push('الإضافات مش ظاهرة كاملة');
  if (o.items.some(i => (i.addons || []).some(a => a.qty == null))) why.push('عدد إضافة مش واضح');
  // Lines: every dish and paid add-on.
  const lines = [];
  for (const i of o.items) {
    lines.push({ name: i.name, qty: Number(i.qty), no: pickOf(i), apex: i.apex || [] });
    for (const a of i.addons || []) lines.push({ name: a.name, qty: Number(a.qty), no: pickOf(a), apex: a.apex || [] });
  }
  const unknown = lines.filter(l => !/^\d{1,10}$/.test(String(l.no || '')));
  if (unknown.length) why.push((unknown[0].apex.length > 1 ? 'صنف ليه أكتر من اختيار على Apex: ' : 'صنف مش معروف على Apex: ') + unknown[0].name + (unknown.length > 1 ? ' (+' + (unknown.length - 1) + ')' : ''));
  if (lines.some(l => !(l.qty > 0 && l.qty <= 50))) why.push('عدد صنف مش مظبوط');
  // Payment.
  const pay = o.payment === 'cash' || o.payment === 'paid' ? o.payment : null;
  if (!pay) why.push(o.source === 'site' ? 'طريقة الدفع على الموقع مش واضحة أو جزء منها كاش' : 'كاش ولا مدفوع مش واضح');
  // Branch and area.
  const branch = Number(o.apexBranch) || null;
  if (!branch) why.push('الفرع مش واضح');
  const pickup = o.source === 'site' && o.fulfillment === 'pickup';
  let loc = null, locHow = null;
  if (pickup) { loc = o.areaGuess?.how === 'pickup' ? Number(o.areaGuess.no) : null; locHow = 'pickup'; }
  // Learned: chosen 2+ times and at least 80% of the times (one area name staff put on two Apex areas is not certain).
  else if (o.areaGuess && Number(o.areaGuess.seen) >= 2 && !(o.areaGuess.share < 0.8)) { loc = Number(o.areaGuess.no); locHow = 'learned'; }
  else if (o.areaGuess?.how === 'name') { loc = Number(o.areaGuess.no); locHow = 'name'; }
  else { const c = x.customerArea?.(o); if (c) { loc = Number(c); locHow = 'customer'; } }
  let service = null;
  if (!loc) why.push(o.areaGuess && Number(o.areaGuess.seen) >= 2 ? 'المنطقة دي الموظفين اختاروا لها أكتر من منطقة على Apex'
    : (o.customer?.talabatArea || o.customer?.siteArea) ? 'منطقة «' + (o.customer.talabatArea || o.customer.siteArea) + '» لسه ما اتعلمتش على Apex' : 'منطقة العميل مش ظاهرة في الأوردر');
  else if (!pickup) {
    // Karim 11-14: an area Apex has twice — the one this branch serves («مدينتي» 361 is listed for another branch, «مدنتى» 370 for Madinaty).
    if (x.groups && branch) loc = areaForBranch(loc, branch, x.locations, x.groups);
    const rows = (x.locations || []).filter(l => Number(l.no) === loc);
    const owners = [...new Set(rows.map(l => l.branch).filter(v => v != null).map(Number))];
    if (!rows.length) why.push('المنطقة مش في قائمة Apex');
    else if (branch && owners.length && !owners.includes(branch)) why.push('المنطقة تبع فرع تاني على Apex');
    const area = rows.find(l => Number(l.branch) === branch) || rows.find(l => l.branch == null) || rows[0];
    service = area && area.service != null && Number.isFinite(Number(area.service)) ? Number(area.service) : null;
    if (rows.length && service == null) why.push('المنطقة ملهاش سعر توصيل على Apex');
  } else service = 0;
  // Discounts: who pays each one (a paid order: all of it comes off on Apex anyway).
  if (pay !== 'paid' && (o.discounts || []).some(d => !d.who || d.unclear)) why.push('خصم مش واضح مين بيدفعه');
  // The customer's card on Apex.
  const card = o.apexCustomerNote;
  const fresh = card && card.checkedAt && x.now - Date.parse(card.checkedAt) <= 10 * 60000;
  if (!card || !fresh || (card.status !== 'none' && card.status !== 'found')) why.push('مستني قراءة بطاقة العميل من Apex');
  // Karim 11-11: a cash order with one clear discount on the card is discounted on Apex by itself. Only the customer's
  // choice needs a person: a paid order's gift instead of the discount (or keeping it for the next order), free items.
  else if (card.status === 'found') {
    const dirs = card.directives || [], money = dirs.filter(d => d.kind === 'percent' || d.kind === 'amount');
    if (card.unrecognized || money.length > 1) why.push('ملاحظة بطاقة العميل مش واضحة');
    else if (dirs.some(d => d.kind === 'item')) why.push('بطاقة العميل فيها أصناف هدية — الموظف يختارها');
    else if (money.length && pay === 'paid') why.push('مدفوع وعلى الكارت خصم — العميل يختار هدية أو يتأجل للأوردر الجاي');
  }
  // Prices: Apex's items (+14%) against the order's, and Talabat's delivery against the area's.
  if (!unknown.length) {
    const apexItems = lines.reduce((s, l) => s + (Number(APEX_PRICES[l.no]) || 0) * (l.qty || 0), 0);
    if (lines.some(l => !(Number(APEX_PRICES[l.no]) > 0))) why.push('صنف ملوش سعر على Apex');
    else if (o.source === 'talabat') {
      const tItems = o.subtotal ?? billAmount(o, /^(?:المجموع الفرعي|subtotal)$/i);
      if (tItems == null) why.push('مجموع الأصناف على طلبات مش ظاهر');
      // Free delivery from Talabat (Pro, offers: the delivery line 0 or missing) is not a price difference (Karim 11-11).
      const delFee = billAmount(o, /توصيل|delivery/i), tDel = (delFee || 0) + (billAmount(o, /رسوم الخدمة|service/i) || 0);
      if (service != null && delFee > 0 && !freeDelivery(o) && Math.abs(T(service) + T(Number(APEX_PRICES[TALABAT_FEE_NO]) || 7.02) - tDel) > 10) warnings.push('فرق سعر التوصيل بين Apex وطلبات');
    } else {
      const sItems = o.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
      if (!(sItems > 0)) why.push('أسعار الموقع مش ظاهرة');
    }
  }
  if (why.length) return { ok: false, why, warnings, quiet: why.every(w => QUIET.has(w)) };
  // The customer as the page shows it, without the English (the page's «what staff wrote over the Arabic» is not learned from this).
  const { nameEn, addressEn, original, talabatArea, siteArea, ...customer } = o.customer || {};
  const body = { source: o.source, ref: String(o.ref), action: 'auto', payment: pay, branchNo: branch, locationNo: loc, code: o.code,
    items: lines.map(l => ({ itemNo: String(l.no), qty: l.qty, note: '' })),
    apexNote: card.status === 'found' ? { approved: true, note: card.text, custNo: card.custNo, items: [], resolution: null, gifts: null } : null,
    note: deliveryComment(o), customer, discountSplit: (o.discounts || []).map(() => null) };
  return { ok: true, why: [], warnings, body, locHow };
}

function setup(app) {
  const { db, fail } = app;
  const mode = async () => { const v = (await db.prepare("SELECT value FROM settings WHERE key = 'auto_transfer'").get())?.value; return MODES.includes(v) ? v : 'off'; };

  // The area of this customer's last confirmed Apex orders to the same address (including manual entries).
  // Read again at most every 10 minutes (11-11: D1 «overloaded»).
  let areasAt = 0, areasDay = null, areasCache = new Map();
  async function customerAreas(day) {
    if (areasDay === day && Date.now() - areasAt < 10 * 60000) return areasCache;
    areasDay = day; areasAt = Date.now(); areasCache = await readAreas(day); return areasCache;
  }
  async function readAreas(day) {
    const rows = await db.prepare("SELECT payload FROM transfer_jobs WHERE payload IS NOT NULL AND state IN ('auto_done', 'entered') AND day >= date(?, '-120 days') ORDER BY at DESC LIMIT 2000").all(day).catch(() => []);
    const m = new Map();
    for (const r of rows) {
      const p = parseJson(r.payload, {}); if (p.pickup || !p.customer?.phone || !p.locationNo) continue;
      const k = p.customer.phone + '|' + normAddress(p.customer.address); if (!k.endsWith('|') && !m.has(k)) m.set(k, Number(p.locationNo));
    }
    return m;
  }

  let last = 0, running = false;
  async function tick(now, { force = false } = {}) {
    if (running || (!force && now - last < TICK_MS)) return null;
    last = now; running = true;
    try {
      const m = await mode(); if (m === 'off') return { mode: m };
      const day = businessDay(now);
      const q = await app.transferQueue(day, { now, cachedOnly: true });
      if (!q) return { mode: m, skipped: 'no recent build' };
      const areas = await customerAreas(day);
      const { deliveryPhone } = await import('./delivery-fields.js');
      const x = { now, locations: q.locations || [], groups: areaGroups(q.locations || [], (await app.apexAreaRules?.()) || {}), customerArea: o => areas.get(deliveryPhone(o.customer?.phone) + '|' + normAddress(o.customer?.address)) || null };
      const seen = new Map((await db.prepare('SELECT source, ref, decision, reasons, alerted, first_at FROM auto_transfer_log WHERE day = ?').all(day)).map(r => [r.source + ':' + r.ref, r]));
      const jobs = new Map((await db.prepare("SELECT source, ref, state, employee_name, result FROM transfer_jobs WHERE day = ?").all(day))
        .map(j => [j.source + ':' + j.ref, j]));
      const out = [];
      for (const o of q.orders || []) {
        const k = o.source + ':' + o.ref, prev = seen.get(k);
        // A queue snapshot can be older than another Worker isolate's job insert. Reconcile the durable job first;
        // never leave a stale «won't transfer» decision beside a job that is already queued or written.
        const currentJob = jobs.get(k);
        if (currentJob?.employee_name === 'المرصد آلي' && ['auto_pending', 'auto_sending', 'auto_done'].includes(currentJob.state)) {
          const decision = 'sent', reasons = '';
          if (!prev || prev.decision !== decision || prev.reasons !== reasons)
            await db.prepare(`INSERT INTO auto_transfer_log (source, ref, day, code, decision, reasons, at, first_at, alerted) VALUES (?,?,?,?,?,?,?,?,0)
              ON CONFLICT(source, ref) DO UPDATE SET decision = excluded.decision, reasons = excluded.reasons, at = excluded.at, code = excluded.code`)
              .run(o.source, String(o.ref), day, o.code || null, decision, reasons, now, prev?.first_at || now);
          out.push({ key: k, decision, reasons });
          continue;
        }
        const d = decide(o, x); if (!d) continue;
        let decision = d.ok ? (m === 'on' ? 'sent' : 'would') : 'wait', reasons = (d.ok ? d.warnings : d.why).join(' · ');
        if (d.ok && m === 'on') {
          try { await app.transferAutoJob(d.body, now); }
          catch (e) {
            const committed = await db.prepare('SELECT state, employee_name FROM transfer_jobs WHERE source = ? AND ref = ?').get(o.source, String(o.ref)).catch(() => null);
            if (committed?.employee_name === 'المرصد آلي' && ['auto_pending', 'auto_sending', 'auto_done'].includes(committed.state)) {
              decision = 'sent'; reasons = '';
            } else { decision = 'wait'; reasons = String(e?.message || e).slice(0, 200); }
          }
        }
        if (!prev || prev.decision !== decision || prev.reasons !== reasons)
          await db.prepare(`INSERT INTO auto_transfer_log (source, ref, day, code, decision, reasons, at, first_at, alerted) VALUES (?,?,?,?,?,?,?,?,0)
            ON CONFLICT(source, ref) DO UPDATE SET decision = excluded.decision, reasons = excluded.reasons, at = excluded.at, code = excluded.code`)
            .run(o.source, String(o.ref), day, o.code || null, decision, reasons, now, now);
        // Still with nobody after 2 minutes (mode on): the call center group, once per order.
        if (m === 'on' && decision === 'wait' && !d.quiet && !(prev?.alerted) && now - Date.parse(o.at || now) > ALERT_MS) {
          const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get().catch(() => null);
          if (parseJson(c?.rules, {}).autoWaiting !== false) {
            const text = '🟠 مستني تحويل بإيد موظف | ' + (o.source === 'talabat' ? 'طلبات' : 'الموقع') + ' #' + (o.code || o.ref) + (BRANCH_NAME[o.apexBranch] ? ' — فرع ' + BRANCH_NAME[o.apexBranch] : '') +
              '\nالمرصد ماحوّلوش لوحده: ' + reasons + '\nحد يفتح صفحة التحويل ويسجله';
            await db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target) VALUES (?, 'autoWaiting', NULL, ?, ?, NULL, 'online')").run('autoWait:' + k, text, now);
          }
          await db.prepare('UPDATE auto_transfer_log SET alerted = 1 WHERE source = ? AND ref = ?').run(o.source, String(o.ref));
        }
        out.push({ key: k, decision, reasons });
      }
      return { mode: m, checked: out.length, out };
    } finally { running = false; }
  }
  app.afterRequest(now => tick(now).catch(() => {}));
  app.autoTransfer = { tick, decide, mode };

  // What the transfer page shows under an order: «هيتحوّل آلي» or why not.
  app.autoTransferNotes = async day => new Map((await db.prepare('SELECT source, ref, decision, reasons FROM auto_transfer_log WHERE day = ?').all(day).catch(() => []))
    .map(r => [r.source + ':' + r.ref, { decision: r.decision, why: r.reasons }]));

  app.route('GET', '/api/auto-transfer', async ctx => {
    await app.requireAdmin(ctx);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare('SELECT source, ref, code, decision, reasons, at, first_at FROM auto_transfer_log WHERE day = ? ORDER BY first_at DESC').all(day);
    const jobs = new Map((await db.prepare("SELECT source, ref, state, result FROM transfer_jobs WHERE day = ? AND employee_name = 'المرصد آلي'").all(day)).map(j => [j.source + ':' + j.ref, j]));
    const list = rows.map(r => { const j = jobs.get(r.source + ':' + r.ref), res = parseJson(j?.result, null);
      return { source: r.source, ref: r.ref, code: r.code, decision: r.decision, reasons: r.reasons, at: iso(r.at), firstAt: iso(r.first_at), job: j ? { state: j.state, orderNo: res?.orderNo || null, error: res?.error || null } : null }; });
    const n = k => list.filter(r => r.decision === k).length;
    return { mode: await mode(), day, totals: { sent: n('sent'), would: n('would'), wait: n('wait') }, list };
  });
  // Karim 11-14 «اعمل التقرير اليومي»: why orders were left to staff, per reason, for a day or a period — the list of what
  // still stops the automatic transfer (unknown items and areas named, so each can be taught once).
  app.route('GET', '/api/auto-transfer/report', async ctx => {
    await app.requireAdmin(ctx);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.to || '')) ? ctx.query.to : businessDay(ctx.now);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.from || '')) ? ctx.query.from : to;
    const rows = await db.prepare('SELECT source, ref, day, code, decision, reasons FROM auto_transfer_log WHERE day BETWEEN ? AND ? LIMIT 20000').all(from, to);
    return { from, to, ...autoReport(rows) };
  });
  app.route('POST', '/api/auto-transfer', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin'), b = ctx.body;
    if (!MODES.includes(b.mode)) fail(400, 'invalid_mode');
    if (b.mode === 'on' && String(b.confirm || '') !== 'ON') fail(400, 'التشغيل محتاج تأكيد');
    await db.prepare("INSERT INTO settings (key, value) VALUES ('auto_transfer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(b.mode);
    await app.audit('auto_transfer_mode', null, { actor: who.name, mode: b.mode });
    return { ok: true, mode: b.mode };
  });
}

export { setup };
