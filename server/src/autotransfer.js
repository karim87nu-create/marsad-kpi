// التحويل الآلي الكامل (Karim 11-11: «عايز اعمل تحويل طلبات تلقائي» — طلبات والموقع، كل الفروع).
// Every few seconds the open orders of the transfer page are checked. An order is sent to Apex by itself (the same job as
// the page's button, as «المرصد آلي») only when everything is certain:
//  - every dish and paid add-on has one Apex item (one candidate, or the one staff chose for it before), all add-ons seen;
//  - the branch is known, and the area: a branch pickup, the Apex area staff chose for this Talabat area before (2+ times),
//    or the area of this customer's last automatic order to the same address; the area belongs to that branch;
//  - cash or paid is clear, and who pays every discount (a paid order needs nothing more);
//  - the customer's card on Apex was read in the last 10 minutes; a cash order with one clear discount on it is discounted
//    by itself — a paid order's discount (the customer's gift or keeping it) and free items on the card wait for a person;
//  - every item has an Apex price; item and delivery price differences remain visible without blocking transfer;
//  - nobody has the order and it is not on Apex already.
// Otherwise the order stays for the employee with the reason shown on the transfer page; when the mode is «on» and it is
// still waiting after 2 minutes, the call center group is told on Telegram (once per order).
// Modes (admin): off · trial (only records what would have been sent) · on.
import { TUNE } from './tune.js';
import { businessDay, iso } from './time.js';
import { parseJson } from './order-match.js';
import { deliveryComment, formatDeliveryAddress, withDeliveryPlaces } from './delivery-fields.js';
import { normArabic } from './apex-customer-notes.js';
import { areaGroups, areaForBranch, PICKUP_AREAS } from './apex-areas.js';
import { compoundArea } from './transfer-rules.js';
import { APEX_PRICES } from './menu-seed.js';

export const MODES = ['off', 'trial', 'on'];
const QUIET = new Set(['أوردر مجدول', 'تفاصيل الأوردر لسه ماوصلتش', 'لسه ما اتقبلش على طلبات', 'أوردر قديم — غالباً اتسجل بإيد', 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد']);
// A branch's own place in the customer's words (the website's area and address).
const SITE_PLACES = [{ no: 3, re: /مدين?ت[يى]|مدنت[يى]|madinaty/i }, { no: 2, re: /مدين[هة] ?نصر|nasr ?city/i }, { no: 1, re: /التجمع|تجمع خامس|tagamo|new cairo|القاهر[هة] الجديد[هة]/i }];
const TICK_MS = 60000, ALERT_MS = 2 * 60000, LATE_MAX_MS = 60 * 60000;
// Waits on the system, not on a person: staff are not asked to enter the order for these in its first 10 minutes.
const CARD_WAIT = 'مستني قراءة بطاقة العميل من Apex';
const LEGACY_NEW_ORDER_HOLD = 'لسه واصل';
const SYSTEM_WAIT = new Set([CARD_WAIT, 'تفاصيل الأوردر لسه ماوصلتش', 'هاشتاج طلبات لسه ماظهرش', 'لسه ما اتقبلش على طلبات']);
const LEGACY_LANGUAGE_HOLD = 'فيه كلمات إنجليزي في العنوان — راجع التعريب قبل التسجيل';
const POSSIBLE_APEX_MATCH = new Set(['tentative', 'ambiguous']);
const CARD_QUIET_MS = 10 * 60000;
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
const BEFORE = new Set([LEGACY_NEW_ORDER_HOLD, 'أوردر قديم — غالباً اتسجل بإيد', 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد']);
const readReasons = text => String(text || '').split(' · ').map(reason => reason.trim()).filter(Boolean);
const activeReasons = text => readReasons(text).filter(reason => reason !== LEGACY_NEW_ORDER_HOLD);
export function reasonKind(r) {
  const s = String(r || '').trim();
  let m = /^(صنف (?:مش معروف على Apex|ليه أكتر من اختيار على Apex)):\s*(.+?)(?:\s*\(\+\d+\))?$/.exec(s); if (m) return [m[1], m[2]];
  if ((m = /^منطقة «(.+)» لسه ما اتعلمتش على Apex$/.exec(s))) return ['منطقة لسه ما اتعلمتش على Apex', m[1]];
  if (/^هاشتاج طلبات لسه ماظهرش/.test(s)) return ['هاشتاج طلبات لسه ماظهرش', null];
  if ((m = /^خصم مش واضح مين بيدفعه(?::\s*(.+))?$/.exec(s))) return ['خصم مش واضح مين بيدفعه', m[1] || null];
  return [s.length > 120 ? s.slice(0, 120) + '…' : s, null];
}
export function autoReport(rows) {
  const by = { talabat: { all: 0, auto: 0, would: 0, staff: 0 }, site: { all: 0, auto: 0, would: 0, staff: 0 } }, reasons = new Map();
  for (const r of rows) {
    const t = by[r.source] || (by[r.source] = { all: 0, auto: 0, would: 0, staff: 0 });
    t.all++;
    if (r.decision === 'sent') { t.auto++; continue; }
    if (r.decision === 'would') { t.would++; continue; }
    const all = activeReasons(r.reasons);
    if (!all.length && readReasons(r.reasons).includes(LEGACY_NEW_ORDER_HOLD)) continue;
    t.staff++;
    const real = all.filter(x => !BEFORE.has(x)), use = real.length ? real : [all[0] || 'غير معروف'];
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
  if (o.job && o.job.state !== 'released') return null;
  const why = [], warnings = [];
  const age = x.now - Date.parse(o.at || '');
  // Older orders can already have been handled outside Marsad. A recent order sent to a website
  // branch can still need Apex; do not write when reconciliation finds a possible existing order.
  if (age > TUNE.autoMaxAgeMin * 60000 && !(age <= LATE_MAX_MS && x.waitedOnSystem?.(o))) why.push('أوردر قديم — غالباً اتسجل بإيد');
  if ((o.sentToBranch || !Number.isFinite(age) || age > TUNE.autoMaxAgeMin * 60000) && POSSIBLE_APEX_MATCH.has(o.matching?.state))
    why.push('فيه أوردر محتمل يكون هو على Apex — راجع الربط');
  // Karim 11-19 «ميبقاش محتاج تحويل من الموظف غير العميل الي ليه ملاحظه»: a booked order goes by itself an hour before
  // its time (the booking time is written next to the name, as staff do); one with no time stays with staff.
  if (o.scheduled && !(Date.parse(o.scheduledAt || '') - x.now <= TUNE.scheduledLeadMin * 60000)) why.push('أوردر مجدول');
  if (o.source === 'talabat' && /^(?:NEW|PENDING|WAITING|RECEIVED|PLACED|UNACCEPTED)/i.test(String(o.status || ''))) why.push('لسه ما اتقبلش على طلبات');
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
  let branch = Number(o.apexBranch) || null;
  const pickup = o.fulfillment === 'pickup';   // website or Talabat (11-15)
  const sourceArea = o.customer?.talabatArea || o.customer?.siteArea;
  const forcedCompound = !pickup && compoundArea(o.customer?.address, sourceArea, o.source);
  let loc = null, locHow = null;
  if (pickup) { loc = PICKUP_AREAS[branch]?.no ?? null; locHow = 'pickup'; }
  else if (forcedCompound) { loc = forcedCompound.no; locHow = 'rule'; }
  // Learned: chosen 2+ times and at least 80% of the times (one area name staff put on two Apex areas is not certain).
  else if (o.areaGuess && Number(o.areaGuess.seen) >= 2 && !(o.areaGuess.share < 0.8)) { loc = Number(o.areaGuess.no); locHow = 'learned'; }
  else if (o.areaGuess?.how === 'name') { loc = Number(o.areaGuess.no); locHow = 'name'; }
  else if (o.areaGuess?.how === 'address') { loc = Number(o.areaGuess.no); locHow = 'address'; }
  else if (o.areaGuess?.how === 'areaName') { loc = Number(o.areaGuess.no); locHow = 'areaName'; }
  else if (o.areaGuess?.how === 'rule') { loc = Number(o.areaGuess.no); locHow = 'rule'; }   // confirmed by Karim (transfer-rules.js)
  else { const c = x.customerArea?.(o); if (c) { loc = Number(c); locHow = 'customer'; } }
  // Karim 11-15 (Apex 703813 «ازاي استلام وفيه عنوان توصيل»): a delivery order never goes to a branch's «استلام» area,
  // whether it came from the customer's card on Apex or from what was chosen before — the employee picks.
  if (!pickup && loc && (x.locations || []).some(l => Number(l.no) === loc && /استلام/.test(String(l.name || '')))) { loc = null; locHow = null; why.push('المنطقة اللي على كارت العميل «استلام» والأوردر توصيل — اختار منطقة التوصيل'); }
  // Karim 11-15 «تقريبا مفيش ولا اوردر موقع اتحول تلقائي»: a website order has no branch until someone sends it to one on
  // the website (and then it is left to staff) — 144 of 154 waited for «الفرع مش واضح». The Apex area found for it belongs
  // to one branch on Apex: that is its branch (never when the area is listed for two branches).
  if (!branch && o.source === 'site' && loc && !pickup) {
    const owners = [...new Set((x.locations || []).filter(l => Number(l.no) === loc).map(l => l.branch).filter(v => v != null).map(Number))];
    // Karim 11-19 (receipt «مدينتي / B12 عمارة 59 مجموعة 124» went to مدينة نصر): Apex lists «مدينتي» for another branch
    // too. The customer's own words naming one branch's place decide the branch, then that branch's copy of the area
    // (none for it → the area check below stops it for staff).
    // Only when the area's own name is that place and the customer's words don't name another one.
    const said = String(normArabic([o.customer?.siteArea, o.customer?.talabatArea, o.customer?.address].filter(Boolean).join(' ')) || '');
    const areaName = String(normArabic((x.locations || []).find(l => Number(l.no) === loc)?.name || ''));
    const ofArea = SITE_PLACES.filter(p => p.re.test(areaName)).map(p => p.no), named = SITE_PLACES.filter(p => p.re.test(said)).map(p => p.no);
    if (ofArea.length === 1 && named.every(n => n === ofArea[0]) && owners.length !== 1 || (ofArea.length === 1 && owners.length === 1 && owners[0] !== ofArea[0] && named.every(n => n === ofArea[0]))) {
      branch = ofArea[0]; loc = x.groups ? areaForBranch(loc, branch, x.locations, x.groups) : loc;
    } else if (owners.length === 1) branch = owners[0];
  }
  if (!branch) why.push('الفرع مش واضح');
  let service = null;
  if (pickup && !loc && branch) why.push('استلام الفرع مش متعرّف على Apex');
  if (!loc && !pickup) why.push(o.areaGuess && Number(o.areaGuess.seen) >= 2 ? 'المنطقة دي الموظفين اختاروا لها أكتر من منطقة على Apex'
    : (o.customer?.talabatArea || o.customer?.siteArea) ? 'منطقة «' + (o.customer.talabatArea || o.customer.siteArea) + '» لسه ما اتعلمتش على Apex' : 'منطقة العميل مش ظاهرة في الأوردر');
  else if (!pickup) {
    // Karim 11-14: an area Apex has twice — the one this branch serves («مدينتي» 361 is listed for another branch, «مدنتى» 370 for Madinaty).
    if (x.groups && branch && !forcedCompound) loc = areaForBranch(loc, branch, x.locations, x.groups);
    const rows = (x.locations || []).filter(l => Number(l.no) === loc);
    const owners = [...new Set(rows.map(l => l.branch).filter(v => v != null).map(Number))];
    if (!rows.length) why.push('المنطقة مش في قائمة Apex');
    else if (branch && owners.length && !owners.includes(branch)) why.push('المنطقة تبع فرع تاني على Apex');
    const area = rows.find(l => Number(l.branch) === branch) || rows.find(l => l.branch == null) || rows[0];
    service = area && area.service != null && Number.isFinite(Number(area.service)) ? Number(area.service) : null;
    if (rows.length && service == null) why.push('المنطقة ملهاش سعر توصيل على Apex');
    // Karim 11-20 (receipt #31675: address, floor and flat all 0 on a delivery): a delivery whose address says nothing but the area
    // is not written — the customer is asked for the address (the street, building or a landmark).
    const adr = formatDeliveryAddress(o.customer?.address, { apexArea: area?.name, sourceArea: forcedCompound?.addAddress || sourceArea });
    if (adr.issue) why.push(adr.issue);
    else if (adr.warning) warnings.push(adr.warning);
  } else service = 0;
  // Discounts: who pays each one (a paid order: all of it comes off on Apex anyway).
  if (pay !== 'paid' && (o.discounts || []).some(d => !d.who || d.unclear)) {
    // Karim 11-14 «راجع السجلات»: the line as Talabat sent it is kept, so the report shows which words were not understood.
    const d = (o.discounts || []).find(d => !d.who || d.unclear);
    why.push('خصم مش واضح مين بيدفعه: ' + String(d.text || 'خصم').replace(/\s*\|.*$/, '').replace(/\s+/g, ' ').slice(0, 60));
  }
  // The customer's card on Apex.
  const card = o.apexCustomerNote;
  const fresh = card && card.checkedAt && x.now - Date.parse(card.checkedAt) <= 10 * 60000;
  if (!card || !fresh || (card.status !== 'none' && card.status !== 'found')) why.push(CARD_WAIT);
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
      // Karim 11-19 (#4251: Apex got 1 ممبار and 1 ورق عنب for 3 of each): Apex's lines far under what the customer paid
      // is flagged for review; the writer still registers all known lines. The limit is in «إعدادات التشغيل».
      else if (TUNE.itemsGapPct > 0 && tItems > 0 && T(apexItems) < tItems * (1 - TUNE.itemsGapPct / 100) && tItems - T(apexItems) > 50)
        warnings.push('مجموع الأصناف على Apex (' + Math.round(T(apexItems)) + ') أقل من طلبات (' + Math.round(tItems) + ')');
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
  // «المستقبل اربطها بالشروق بس لازم يكون مكتوب المستقبل في العنوان الي هيتسجل».
  const addArea = o.areaGuess?.how === 'rule' && locHow === 'rule' ? o.areaGuess.addAddress : null;
  if (forcedCompound) customer.address = withDeliveryPlaces(customer.address, { compound: forcedCompound.addAddress });
  else if (addArea && !String(customer.address || '').includes(addArea)) customer.address = (customer.address ? customer.address + ' - ' : '') + addArea;
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
  async function tick(now, { force = false, cardsReady = null } = {}) {
    if (!cardsReady) {
      if (running || (!force && now - last < TICK_MS)) return null;
      last = now; running = true;
    }
    try {
      const m = await mode(); if (m === 'off') return { mode: m };
      const day = businessDay(now);
      const cached = await app.transferQueue(day, { now, cachedOnly: true });
      const q = cached || (cardsReady && await app.transferQueue(day, { now }));
      if (!q || q.stale) return { mode: m, skipped: 'no recent build' };
      const areas = await customerAreas(day);
      const { deliveryPhone } = await import('./delivery-fields.js');
      const seen = new Map((await db.prepare('SELECT source, ref, decision, reasons, alerted, first_at FROM auto_transfer_log WHERE day = ?').all(day)).map(r => [r.source + ':' + r.ref, r]));
      // Seen within 5 minutes of coming, never put to staff (no «سجّله بإيد» message), only system waits so far.
      const waitedOnSystem = o => {
        if (cardsReady?.has(o.source + ':' + o.ref) && o.job?.state === 'released' && o.job.result?.cardRefresh) return true;
        const r = seen.get(o.source + ':' + o.ref);
        if (!r) return false;
        const reasons = readReasons(r.reasons);
        // Recover orders from the previous language gate even if it already alerted staff.
        // The age window, latest Apex match, and durable job checks still apply.
        const removedHold = w => w === LEGACY_NEW_ORDER_HOLD || w === LEGACY_LANGUAGE_HOLD || w === 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد'
          || /^(?:كاتب Apex مش بيسجل|مجموع الأصناف على Apex .*اتأكد من العدد)/.test(w);
        if (reasons.some(removedHold) && reasons.every(w => removedHold(w) || SYSTEM_WAIT.has(w) || BEFORE.has(w))) return true;
        // A notification about a slow card read is not a claim, and the newly read card can unblock the order.
        if (reasons.includes(CARD_WAIT) && reasons.every(w => SYSTEM_WAIT.has(w) || BEFORE.has(w))) return true;
        if (r.alerted || !(Number(r.first_at) - Date.parse(o.at || 0) <= 5 * 60000)) return false;
        return reasons.every(w => SYSTEM_WAIT.has(w) || w === 'أوردر قديم — غالباً اتسجل بإيد' || /^(?:كاتب Apex مش بيسجل|D1_|.*server|.*timeout|.*fetch)/i.test(w));
      };
      const x = { now, waitedOnSystem, locations: q.locations || [], groups: areaGroups(q.locations || [], (await app.apexAreaRules?.()) || {}), customerArea: o => areas.get(deliveryPhone(o.customer?.phone) + '|' + normAddress(o.customer?.address)) || null };
      const jobRows = await db.prepare("SELECT source, ref, state, employee_name, result, at FROM transfer_jobs WHERE day = ?").all(day);
      const jobs = new Map(jobRows.map(j => [j.source + ':' + j.ref, j]));
      // Karim 11-14 (11-12 ليلاً the writer could not log in to Apex for two hours): while orders already handed to the
      // writer wait too long, keep accepting jobs so the cashier can finish them when it reconnects.
      const writerStuck = jobRows.some(j => ['auto_pending', 'auto_sending'].includes(j.state) && now - j.at >= TUNE.writerStuckMin * 60000);
      const out = [];
      for (const o of q.orders || []) {
        const k = o.source + ':' + o.ref, prev = seen.get(k);
        if (cardsReady && !cardsReady.has(k)) continue;
        // A queue snapshot can be older than another Worker isolate's job insert. Reconcile the durable job first;
        // never leave a stale «won't transfer» decision beside a job that is already queued or written.
        const currentJob = jobs.get(k);
        if (currentJob?.employee_name === 'المرصد آلي' && ['auto_pending', 'auto_sending', 'auto_retry_pending', 'auto_done'].includes(currentJob.state)) {
          const decision = 'sent', reasons = prev?.decision === 'sent' ? prev.reasons || '' : '';
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
          if (writerStuck) reasons = [...d.warnings, 'الأوردر في طابور جهاز الكاشير'].join(' · ');
          try { await app.transferAutoJob(d.body, now); }
          catch (e) {
            const committed = await db.prepare('SELECT state, employee_name FROM transfer_jobs WHERE source = ? AND ref = ?').get(o.source, String(o.ref)).catch(() => null);
            if (committed?.employee_name === 'المرصد آلي' && ['auto_pending', 'auto_sending', 'auto_retry_pending', 'auto_done'].includes(committed.state)) {
              decision = 'sent'; reasons = '';
            } else { decision = 'wait'; reasons = String(e?.message || e).slice(0, 200); }
          }
        }
        if (!prev || prev.decision !== decision || prev.reasons !== reasons)
          await db.prepare(`INSERT INTO auto_transfer_log (source, ref, day, code, decision, reasons, at, first_at, alerted) VALUES (?,?,?,?,?,?,?,?,0)
            ON CONFLICT(source, ref) DO UPDATE SET decision = excluded.decision, reasons = excluded.reasons, at = excluded.at, code = excluded.code
            WHERE excluded.decision <> 'wait' OR NOT EXISTS (
              SELECT 1 FROM transfer_jobs j WHERE j.source = excluded.source AND j.ref = excluded.ref
                AND j.state IN ('auto_pending', 'auto_sending', 'auto_retry_pending', 'auto_done', 'entered')
            )`)
            .run(o.source, String(o.ref), day, o.code || null, decision, reasons, now, prev?.first_at || now);
        // Still with nobody after 2 minutes (mode on): the call center group, once per order.
        // Waiting only on the system (the card on Apex): staff are told after 10 minutes, not 2.
        const systemOnly = d.why?.length && d.why.every(w => SYSTEM_WAIT.has(w));
        if (m === 'on' && decision === 'wait' && !d.quiet && !(prev?.alerted) && now - Date.parse(o.at || now) > (systemOnly ? CARD_QUIET_MS : ALERT_MS)) {
          const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get().catch(() => null);
          if (parseJson(c?.rules, {}).autoWaiting !== false) {
            const waitingForCard = systemOnly && d.why.includes(CARD_WAIT);
            const title = waitingForCard ? '🟠 قراءة بطاقة العميل اتأخرت | ' : '🟠 مستني تحويل بإيد موظف | ';
            const order = (o.source === 'talabat' ? 'طلبات' : 'الموقع') + ' #' + (o.code || o.ref) + (BRANCH_NAME[o.apexBranch] ? ' — فرع ' + BRANCH_NAME[o.apexBranch] : '');
            const detail = waitingForCard ? '\nمرصد هيعيد فحص التحويل بعد القراءة. راجع اتصال جهاز الكاشير.' : '\nالمرصد ماحوّلوش لوحده: ' + reasons + '\nحد يفتح صفحة التحويل ويسجله';
            const text = title + order + detail;
            await db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target) VALUES (?, 'autoWaiting', NULL, ?, ?, NULL, 'online')").run('autoWait:' + k, text, now);
          }
          await db.prepare('UPDATE auto_transfer_log SET alerted = 1 WHERE source = ? AND ref = ?').run(o.source, String(o.ref));
        }
        out.push({ key: k, decision, reasons });
      }
      return { mode: m, checked: out.length, out };
    } finally { if (!cardsReady) running = false; }
  }
  app.afterRequest((now, method, path) => {
    if (method === 'POST' && path === '/api/apex-writer/customer-notes/result') return;
    return tick(now).catch(() => {});
  });
  app.autoTransfer = { tick, decide, mode };

  // What the transfer page shows under an order: «هيتحوّل آلي» or why not.
  app.autoTransferNotes = async day => new Map((await db.prepare('SELECT source, ref, decision, reasons FROM auto_transfer_log WHERE day = ?').all(day).catch(() => []))
    .map(r => [r.source + ':' + r.ref, { decision: r.decision, why: activeReasons(r.reasons).join(' · ') }]));

  app.route('GET', '/api/auto-transfer', async ctx => {
    await app.requireAdmin(ctx);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare('SELECT source, ref, code, decision, reasons, at, first_at FROM auto_transfer_log WHERE day = ? ORDER BY first_at DESC').all(day);
    const jobs = new Map((await db.prepare("SELECT source, ref, state, result FROM transfer_jobs WHERE day = ? AND employee_name = 'المرصد آلي'").all(day)).map(j => [j.source + ':' + j.ref, j]));
    const list = rows.map(r => { const j = jobs.get(r.source + ':' + r.ref), res = parseJson(j?.result, null);
      return { source: r.source, ref: r.ref, code: r.code, decision: r.decision, reasons: activeReasons(r.reasons).join(' · '), at: iso(r.at), firstAt: iso(r.first_at), job: j ? { state: j.state, orderNo: res?.orderNo || null, error: res?.error || null } : null }; });
    const n = k => list.filter(r => r.decision === k).length;
    return { mode: await mode(), day, totals: { sent: n('sent'), would: n('would'), wait: n('wait') }, list };
  });
  // Karim 11-14 «اعمل التقرير اليومي»: why orders were left to staff, per reason, for a day or a period — the list of what
  // still stops the automatic transfer (unknown items and areas named, so each can be taught once).
  // Karim 11-14 «عايز لايف في الادمن للتحويلات زي المكالمات»: every order of the day where it is now — waiting (and why),
  // with an employee, being written, on Apex (by whom, how long it took), failed — and the parts it depends on.
  let snapAt = 0, snapDay = '', entered = new Map();
  async function apexEntries(day, now) {
    if (snapDay === day && now - snapAt < 15000) return entered;
    const row = await db.prepare('SELECT data, received_at FROM orders_days WHERE day = ?').get(day).catch(() => null);
    const d = parseJson(row?.data, {}) || {};
    entered = new Map((d.online || []).filter(a => a?.no).map(a => [String(a.no), { at: a.at || null, user: a.user || null }]));
    entered.pushedAt = Math.max(row?.received_at || 0, (app.ordersSeen ? await app.ordersSeen() : 0) || 0) || null; snapAt = now; snapDay = day;
    return entered;
  }
  app.route('GET', '/api/transfer/live', async ctx => {
    await app.requireAdmin(ctx);
    return app.transferLive(ctx.now, ctx.waitUntil);
  });
  // Also the home page's and the manager group's source (Karim 11-14).
  app.transferLive = async (now, waitUntil) => {
    const day = businessDay(now);
    const q = await app.transferQueue(day, { now, me: { id: null, name: 'admin', staff: false }, waitUntil });
    const notes = new Map((await db.prepare('SELECT source, ref, decision, reasons, first_at FROM auto_transfer_log WHERE day = ?').all(day)).map(r => [r.source + ':' + r.ref, r]));
    const jobs = new Map((await db.prepare('SELECT source, ref, state, employee_name, at, result FROM transfer_jobs WHERE day = ?').all(day)).map(j => [j.source + ':' + j.ref, j]));
    const apex = await apexEntries(day, now);
    const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
    const list = [];
    for (const o of q?.orders || []) {
      const k = o.source + ':' + o.ref, j = jobs.get(k), n = notes.get(k), res = parseJson(j?.result, null) || {};
      const x = { source: o.source, ref: String(o.ref), code: o.code || null, branch: o.branch || BRANCH_NAME[o.apexBranch] || null, at: o.at || null,
        name: o.customer?.name ? String(o.customer.name).slice(0, 40) : null, total: o.total ?? o.target ?? null, payment: o.payment || null, scheduled: !!o.scheduled };
      if (o.apex?.no) {
        const e = apex.get(String(o.apex.no)) || {}, auto = j?.employee_name === 'المرصد آلي' && j.state === 'auto_done';
        Object.assign(x, { state: 'apex', apexNo: o.apex.no, sn: o.apex.sn ?? null, by: auto ? 'آلي' : j?.state === 'auto_done' ? j.employee_name : (o.apex.user || e.user || 'بإيد على Apex'),
          how: auto ? 'auto' : j?.state === 'auto_done' ? 'page' : 'hand', enteredAt: e.at || (j?.state === 'auto_done' ? iso(j.at) : null), out: !!o.out });
      } else if (o.out) Object.assign(x, { state: 'out' });
      else if (j?.state === 'auto_failed') Object.assign(x, { state: 'failed', by: j.employee_name, why: res.error || 'ماتسجلش' });
      else if (j && ['auto_pending', 'auto_sending'].includes(j.state)) Object.assign(x, { state: 'writing', by: j.employee_name === 'المرصد آلي' ? 'آلي' : j.employee_name, since: iso(j.at) });
      else if (j?.state === 'claimed' && now - j.at < 15 * 60000) Object.assign(x, { state: 'claimed', by: j.employee_name, since: iso(j.at), why: n?.decision === 'wait' ? n.reasons : null });
      else Object.assign(x, { state: 'waiting', why: n ? (n.decision === 'wait' ? activeReasons(n.reasons).join(' · ') : n.decision === 'would' ? 'كان هيتحوّل (تجربة)' : '') : 'لسه ما اتراجعش' });
      list.push(x);
    }
    const writerSeen = Number(await setting('apex_writer_seen')) || null;
    return { serverNow: iso(now), day, stale: q?.stale === true, autoMode: await mode(), writerMode: await setting('apex_bridge_mode') || 'shadow',
      parts: { writerSeen: iso(writerSeen), apexPush: iso(apex.pushedAt), talabatScreen: q?.liveScreen === true }, list };
  };
  // One day's transfer to Apex (Karim 11-14, the KPIs): orders, on Apex, automatic, the minutes from arrival to Apex
  // (from Apex's own entry time), how many waited 5+ minutes, and the writes that failed.
  app.transferDayStats = async (day, now) => {
    const q = await app.transferQueue(day, { now, me: { id: null, name: 'admin', staff: false } }).catch(() => null);
    if (!q?.orders) return null;
    const row = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
    const online = new Map(((parseJson(row?.data, {}) || {}).online || []).filter(a => a?.no).map(a => [String(a.no), a.at]));
    const jobs = await db.prepare('SELECT source, ref, state, employee_name FROM transfer_jobs WHERE day = ?').all(day);
    const jobOf = new Map(jobs.map(j => [j.source + ':' + j.ref, j]));
    const out = { all: 0, onApex: 0, auto: 0, minutes: [], waited5: 0, failed: jobs.filter(j => j.state === 'auto_failed').length, talabat: { all: 0, auto: 0 }, site: { all: 0, auto: 0 } };
    for (const o of q.orders) {
      if (o.scheduled) continue;
      out.all++; out[o.source] && out[o.source].all++;
      const j = jobOf.get(o.source + ':' + o.ref), auto = j?.state === 'auto_done' && j.employee_name === 'المرصد آلي';
      if (auto) { out.auto++; out[o.source] && out[o.source].auto++; }
      if (!o.apex?.no) continue;
      out.onApex++;
      const m = (Date.parse(online.get(String(o.apex.no)) || '') - Date.parse(o.at || '')) / 60000;
      if (Number.isFinite(m) && m >= 0 && m < 180) { out.minutes.push(m); if (m >= 5) out.waited5++; }
    }
    const n = out.minutes.length;
    return { all: out.all, onApex: out.onApex, auto: out.auto, talabat: out.talabat, site: out.site, failed: out.failed,
      toApexMin: n ? Math.round(out.minutes.reduce((a, b) => a + b, 0) / n * 10) / 10 : null,
      autoPct: out.all ? Math.round(out.auto / out.all * 1000) / 10 : null, waited5Pct: n ? Math.round(out.waited5 / n * 1000) / 10 : null, waited5: out.waited5 };
  };
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
