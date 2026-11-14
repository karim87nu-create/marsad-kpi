// صفحة التحويل للفروع — a page for the call-center employees, separate from the admin page.
// It lists today's Talabat and website orders that still have to be entered on Apex, with what the employee
// writes there: the label next to the customer name («اطلب/كاش» or «مدفوع» + the hashtag), the items and
// add-ons with their known Apex items, the branch, address, phone, and the discounts split into the
// restaurant's (deducted) and the platform's (written in the special mark). Nothing is guessed: what the
// source does not say is shown as «مش واضح من المصدر» for the employee to check.
// The employee claims an order (so two people do not enter it twice) and marks it entered; the order then
// turns «في Apex» only when the monitor actually sees it on Apex. Automatic transfer to Apex stays off until
// the bridge is proven (numbering under live work and the branch delivery); this page never writes to Apex.
import { businessDay, dayWindow, iso, validDate, addDays } from './time.js';
import { takeTransferBuildLease, waitForTransferBuild } from './transfer-build-lease.js';
import { CANCELLED_SQL, isCancelled, sourceCanTransfer, handoffPending } from './transfer-cancellation.js';
import { parseJson } from './order-match.js';
import { deliveryPhone, deliveryLabel, deliveryAddress, splitDeliveryAddress, deliveryMark, compactDeliveryComment, deliveryNotes, apexText } from './delivery-fields.js';
import { parseApexCustomerNote, normArabic, guessApexItem } from './apex-customer-notes.js';
import { knownNos, itemKey } from './items.js';
import { APEX_NAMES, APEX_PRICES } from './menu-seed.js';
import { APEX_SECTIONS } from './apex-sections.js';
import { siteApexItems } from './site-items.js';
import { canonicalStore } from './store-names.js';
import { sitePaymentChoice } from './site-payment-choice.js';
const APEX_ITEM_LIST = Object.entries(APEX_NAMES).map(([no, name]) => ({ no, name, price: APEX_PRICES[no] ?? null }));
import { sha256, randomToken } from './security.js';

const orderDay = row => row?.scheduled_at ? businessDay(Number(row.scheduled_at)) : row?.day;

const TOKEN_MS = 12 * 3600000;
const CLAIM_MS = 10 * 60000;               // a claim left untouched for 10 minutes is free again
const TALABAT_DONE = new Set(['CANCELLED', 'REJECTED']);
const SITE_DONE = new Set(['cancelled', 'failed', 'wallet-failed', 'refunded']);
// Already left the branch: it was entered on Apex long ago (by hand or otherwise), so it is not waiting for transfer.
const TALABAT_OUT = new Set(['PICKED_UP', 'PICKED UP', 'IN_DELIVERY', 'IN DELIVERY', 'DELIVERED', 'COMPLETED']);

// Payment, from the source's own words only.
// Talabat shows «Payment method | Online» (or Cash) once its billing data is ready; the live card may show a
// payment badge earlier. Only those exact places count; anything else stays unknown for the employee to check.
function payWord(v) {
  const t = String(v || '').trim();
  const cash = /\bcash\b|كاش|نقد[اًي]?|الدفع عند الاستلام/i.test(t), paid = /\bonline\b|\bpaid\b|card|wallet|apple pay|مدفوع|بطاقة|محفظة|أونلاين/i.test(t);
  return cash && !paid ? 'cash' : paid && !cash ? 'paid' : null;
}
const amountOf = t => { const m = String(t || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
function talabatPayment(bill, liveBadge) {
  const rows = bill || [];
  // Live order screen (Karim 31-10): the payment line at the bottom says it — «ONLINE» / «تم الدفع بواسطة CREDIT_CARD» = paid,
  // a cash line = cash. «التحصيل من العميل» is not used: it can read 0.00 on a cash order.
  const text = rows.map(x => String(x.text || '')).join('\n');
  const online = /\bONLINE\b|تم الدفع بواسطة|paid by|CREDIT_CARD|DEBIT_CARD|WALLET/i.test(text);
  const cash = /\bCASH|cash on delivery|الدفع عند الاستلام|نقد(?:ي|ا)?\b|كاش/i.test(text.replace(/cash to collect|التحصيل من العميل[^\n]*/gi, ''));
  if (online && !cash) return 'paid';
  if (cash && !online) return 'cash';
  if (cash && online) return 'mixed';
  const line = rows.find(x => /^(?:payment method|payment|طريقة الدفع)$/i.test(String(x.k || '').trim()));
  const fromBill = line ? payWord(String(line.text).split(' | ').slice(1).join(' | ')) : null;
  return fromBill || payWord(liveBadge) || null;
}
function sitePayment(p) {
  if (!p?.method) return null;
  if (p.method === 'cod') return 'cash';
  if (p.method === 'unknown') return null;
  if (p.method === 'mixed') return 'mixed';
  return p.paid ? 'paid' : 'unpaid';
}
// Discounts: whose money it is, only when the source says it.
const AMOUNT = /(-?\s*(?:E£|EGP|£E|ج\.م)?\s*-?\d[\d,]*(?:\.\d+)?)/;
const DISC_WORDS = /discount|voucher|promo|coupon|خصم|قسيمة|كوبون|ممول|funded/i;
const discountWho = t => /(talabat|platform|طلبات)[\s-]*(funded|ممول)|funded by talabat|(?:خصم|discount)\s*(?:من\s*)?(?:طلبات|talabat)|talabat\s*(?:discount|voucher)|(?:ممول|مدعوم|على حساب)\s*(?:من\s*)?(?:قبل\s*)?(?:طلبات|talabat)/i.test(t) ? 'platform'
  : /(vendor|restaurant|المطعم)[\s-]*(funded|ممول)|funded by (?:the )?(?:vendor|restaurant)|(?:ممول|مدعوم|على حساب)\s*(?:من\s*)?(?:المطعم|الشريك)|ممول\s*من\s*قبلك|funded by you/i.test(t) ? 'restaurant' : null;
function talabatDiscounts(bill) {
  const out = [];
  for (const x of bill || []) {
    const t = x.k + ' ' + x.text;
    if (!/discount|voucher|promo|coupon|خصم|قسيمة|كوبون/i.test(t)) continue;
    // The money is after «|» («خصم 30% على بعض المنتجات | -90.00» is 90, not the 30 of «30%»); a «%» is never money.
    const val = String(x.text).includes('|') ? String(x.text).split('|').slice(1).join('|') : String(x.text).replace(/\d+(?:\.\d+)?\s*[%٪]/g, '');
    const m = val.match(AMOUNT), amount = m ? Math.abs(Number(m[1].replace(/[^\d.]/g, ''))) || null : null;
    // Karim 31-10 took a bill-summary discount as Talabat's; Karim 10-11 (#655, 30% = 15% ours + 15% Talabat's, all of it
    // taken as Talabat's): a line that does not say who pays is asked (the employee reads «ممول من قبلك» on Talabat).
    out.push({ text: x.text, amount, who: discountWho(t) });
  }
  // The total line next to its funded parts («خصم 90.27» with «ممول من قبلك 45.14» + «ممول من قبل Talabat 45.13») is the same money.
  const funded = out.filter(d => d.who && d.amount), sum = funded.reduce((a, d) => a + d.amount, 0);
  return funded.length ? out.filter(d => d.who || d.amount == null || Math.abs(d.amount - sum) >= 0.05) : out;
}

// Phones are kept as their last 10 digits for matching; shown as the employee dials them.
const phoneOut = p => p ? (/^1\d{9}$/.test(String(p)) ? '0' + p : String(p)) : null;

// Talabat option words for a weight → how Apex item names write it → how the page says it.
// Talabat's own letters (Persian ی/ک, direction marks, Arabic digits) read like ours before the weight is looked for.
const wName = t => String(t || '').replace(/[\u200e\u200f\u061c\u202a-\u202e]/g, '').replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const WEIGHTS = [
  // Karim 10-11: «نص سوى» (how it is cooked) is not «نص كيلو»: a part of a kilo is a weight only next to «كيلو», or alone.
  [/quarter\s*(?:kilo|kg)|(?:1\/4|ربع)\s*(?:kilo|kg|كيلو|ك(?=$|\s)|كجم)|^\s*(?:quarter|1\/4|ربع)\s*$/i, /1\/4|ربع/, 'ربع كيلو'],
  [/third\s*(?:kilo|kg)|(?:1\/3|ثلث|تلت)\s*(?:kilo|kg|كيلو|ك(?=$|\s)|كجم)|^\s*(?:third|1\/3|ثلث|تلت)\s*$/i, /1\/3|ثلث|تلت/, 'تلت كيلو'],
  [/half\s*(?:kilo|kg)|(?:1\/2|نص|نصف)\s*(?:kilo|kg|كيلو|ك(?=$|\s)|كجم)|^\s*(?:half|1\/2|نص|نصف)\s*$/i, /1\/2|نص/, 'نص كيلو'],
  // Karim 10-11: «1 كيلو» (1,509) under «Veal Ribs» came out as a paid add-on; the kilo is the size however it is written
  // («1 كيلو», «١ كيلو», «+ 1 كيلو», «كيلو واحد», «1 كجم», «1kg», «1 Kilo»).
  [/(?:^|[\s+(\-])(?:[1١]\s*|واحد\s*)?(?:kilo(?:gram)?s?|kgs?|كيلو(?:\s*جرام|جرام)?|كجم|ك\.?\s?ج)(?:\s*واحد)?(?=$|[\s)\-.,،])/i, /^\s*(?:ك|كيلو)\s/, 'كيلو'],
];

// Apex branches (Branches table, read 2026-10-31): number → name, for the employee's branch choice.
const APEX_BRANCHES = [{ no: 1, name: 'التجمع' }, { no: 2, name: 'مدينة نصر' }, { no: 3, name: 'مدينتى' }];
// Pickup at the branch («استلام فرع …»): the Apex area of each branch (LocationServices, read 11-11), delivery 0.
const PICKUP_AREAS = { 1: { no: 353, name: 'استلام فرع التجمع' }, 2: { no: 268, name: 'استلام مدينة نصر' }, 3: { no: 372, name: 'استلام فرع مدينتي' } };

// The Apex branch a Talabat store / website branch name points to (null when unclear: the employee picks).
function apexBranchOf(name) {
  const t = String(canonicalStore(name) || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
  const hits = [/التجمع/.test(t) && 1, /(مدينة نصر|سيتي ستار|مكرم)/.test(t) && 2, /مدينتي/.test(t) && 3].filter(Boolean);
  return hits.length === 1 ? hits[0] : null;
}

function setup(app) {
  const { db, fail } = app;
  const queueCache = new Map(), QUEUE_CACHE_MS = 4000;
  // Anything that changes the orders (a push from a screen or the monitor, a link, a claim, the writer's answer) rebuilds it.
  // The Talabat screens and the cashier PC push every few seconds: clearing on each push meant every employee's refresh
  // rebuilt the whole day (Karim 01-11: «الصفحة تقيلة»). Completed builds are reused for 4 seconds; only the page's own actions
  // (claim, entered, auto) and the writer's answers are shown at once (claims are read fresh on every request anyway).
  // ---- alerts for the automatic transfer (call center group) ----
  // Apex's English errors in the words the employee needs (same as the transfer page).
  function plainError(e) {
    const t = String(e || '').replace(/^Exception calling "\w+" with "\d+" argument\(s\): /, '').replace(/^"|"$/g, '');
    const M = [[/no delivery charge known/i, 'المنطقة ملهاش سعر توصيل على Apex'], [/not in Apex/i, 'فيه صنف مش موجود على Apex'], [/stopped on Apex/i, 'فيه صنف موقوف على Apex'],
      [/no price on Apex/i, 'فيه صنف ملوش سعر أونلاين على Apex'], [/business day is not open|no open day/i, 'يوم Apex لسه ما اتفتحش'], [/later day is open|stale/i, 'Apex فاتح يوم تاني'],
      [/timed out|Unable to connect|remote name|connection/i, 'Apex مش بيرد'], [/truncated/i, 'كلام أطول من خانة على Apex'], [/overflow/i, 'رقم مش مظبوط في الأوردر']];
    for (const [re, msg] of M) if (re.test(t)) return msg;
    return /[\u0600-\u06ff]/.test(t) ? t.slice(0, 120) : 'مشكلة على Apex';
  }
  async function transferAlert(key, payload, source, ref, why, now) {
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    const rules = parseJson(c?.rules, {}); if (rules.transferFailed === false) return;
    const branch = APEX_BRANCHES.find(b => b.no === Number(payload.branchNo))?.name;
    const text = '🔴 التحويل الآلي | ' + (source === 'talabat' ? 'طلبات' : 'الموقع') + ' ' + (payload.code ? '#' + payload.code : ref) + (branch ? ' — ' + branch : '') +
      '\n' + why + (payload.by ? '\nبعته: ' + payload.by : '') + '\nسجّله على Apex بإيدك دلوقتي (بالكود في خانة الاسم)';
    await db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target) VALUES (?, 'transferFailed', NULL, ?, ?, NULL, 'online')").run(key, text, now);
  }
  // Sent to the writer and not answered in 3 minutes: the writer on the cashier PC is not working.
  let lastStuck = 0;
  app.afterRequest(async now => {
    if (now - lastStuck < 60000) return; lastStuck = now;
    const rows = await db.prepare("SELECT source, ref, at, payload FROM transfer_jobs WHERE state IN ('auto_pending', 'auto_sending', 'auto_retry_pending') AND at < ? AND at > ?").all(now - 3 * 60000, now - 6 * 3600000);
    for (const j of rows) {
      const p = parseJson(j.payload, {}); if (p.db !== 'live') continue;
      await transferAlert('transfer:stuck:' + j.source + ':' + j.ref, p, j.source, j.ref, 'مستني من ' + Math.round((now - j.at) / 60000) + ' دقيقة وكاتب Apex على جهاز الكاشير مارد', now);
    }
  });

  // ---- sign-in with the employee's own PIN (the same one used for work), separate from the admin password ----
  app.route('POST', '/api/transfer/login', async ctx => {
    const pin = typeof ctx.body.pin === 'string' ? ctx.body.pin.trim().replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0) : ctx.body.pin, key = 'transfer|' + ctx.ip;
    if (typeof pin !== 'string' || !/^\d{1,32}$/.test(pin)) fail(400, 'اكتب الرقم السري');
    if (app.limiters.employeeLogin.blocked(key, ctx.now)) fail(429, 'محاولات كثيرة؛ انتظر 15 دقيقة');
    const e = await app.employeeByPin(pin);
    if (!e || !e.active) { app.limiters.employeeLogin.fail(key, ctx.now); fail(401, 'الرقم السري غير صحيح'); }
    app.limiters.employeeLogin.reset(key);
    return { token: app.signer.sign({ k: 'transfer', eid: e.id, exp: ctx.now + TOKEN_MS }), employee: { id: e.id, name: e.name } };
  });
  async function who(ctx) {
    const c = app.signer.verify(ctx.header('x-transfer-session'));
    if (c && c.k === 'transfer' && Number.isInteger(c.eid) && c.exp > ctx.now) {
      const e = await db.prepare('SELECT id, name, active, deleted_at FROM employees WHERE id = ?').get(c.eid);
      if (e && e.active && !e.deleted_at) return { id: e.id, name: e.name, staff: true };
    }
    // Supervisors can open the same page with their admin sign-in.
    if (ctx.header('x-admin-password')) { const a = await app.requireAdmin(ctx, 'write'); return { id: null, name: a.name, staff: false }; }
    fail(401, 'سجل دخول تاني');
  }

  app.transferWho = who;
  // The branch bot (11-11): today's (or yesterday's) order by the number the branch has — Talabat's short code, the
  // website's order number, the order id or the Apex order number.
  app.transferLookup = async (digits, now) => {
    const want = String(digits || '').replace(/\D/g, '');
    if (want.length < 2) return null;
    const today = businessDay(now);
    for (const day of [today, addDays(today, -1)]) {
      let base; try { base = await baseFor(day, now, { allowStale: true }); } catch { continue; }
      const hit = base.list.find(o => String(o.code || '') === want || String(o.ref || '') === want || (String(o.ref || '').length > 6 && String(o.ref).endsWith(want) && want.length >= 4) || String(o.apex?.no ?? '') === want);
      if (hit) {
        const job = await db.prepare('SELECT state, payload, result FROM transfer_jobs WHERE source = ? AND ref = ?').get(hit.source, String(hit.ref));
        return { ...hit, day, job: job ? { state: job.state, payload: parseJson(job.payload, {}), result: parseJson(job.result, {}) } : null };
      }
    }
    return null;
  };

  // ---- the queue ----
  app.route('GET', '/api/transfer/queue', async ctx => {
    const me = await who(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    return queueFor(day, { now: ctx.now, me, have: ctx.query.have, waitUntil: ctx.waitUntil });
  });
  // A staff-triggered refresh syncs the website once, then rebuilds the transfer list from the latest server snapshots.
  // Talabat remains sourced from its signed-in monitor; this route never clicks or changes orders on either platform.
  const refreshes = new Map();
  app.route('POST', '/api/transfer/refresh', async ctx => {
    const me = await who(ctx), day = businessDay(ctx.now), refreshKey = String(me.id ?? 'admin');
    const last = refreshes.get(refreshKey) || 0;
    if (ctx.now - last < 10000) fail(429, 'استنى 10 ثواني قبل التحديث مرة تانية');
    refreshes.set(refreshKey, ctx.now);
    for (const [key, at] of refreshes) if (ctx.now - at > 60000) refreshes.delete(key);

    let site = null;
    if (app.siteSyncNow) {
      try { site = await app.siteSyncNow(ctx.now); }
      catch { site = { error: true }; }
    }
    const x = S(day); x.dirty = true; queueCache.delete(day);
    const base = await rebuild(day), now = app.now();
    const fresh = await queueFor(day, { now, me, waitUntil: ctx.waitUntil });
    return { ...fresh, manualRefresh: { at: iso(now), siteOk: !!site && !site.error && !site.skipped, queueAt: iso(base.at) } };
  });
  // The page's list, also read by the automatic transfer (autotransfer.js) with no employee.
  async function queueFor(day, ctx) {
    const me = ctx.me || { id: null, name: 'المرصد آلي', staff: false };
    // The day's orders (heavy: Apex snapshot, matching) are built once every few seconds for everyone on the page;
    // only the claims (who has which order) are read fresh for each request.
    const base = await baseFor(day, ctx.now, ctx.cachedOnly ? { cachedOnly: true } : { allowStale: true });
    if (!base) return null;
    // Cancellation is authoritative even when a completed queue snapshot is reused.
    const window = dayWindow(day), cancelled = new Set();
    for (const r of await db.prepare(`SELECT id FROM talabat_orders WHERE day=? AND ${CANCELLED_SQL}`).all(day)) cancelled.add('talabat:' + r.id);
    for (const r of await db.prepare(`SELECT id FROM site_orders WHERE (day=? OR (scheduled_at>=? AND scheduled_at<?)) AND ${CANCELLED_SQL}`).all(day,window.start,window.end)) cancelled.add('site:' + r.id);
    const snap = { locations: base.locations };
    const jobs = new Map((await db.prepare('SELECT * FROM transfer_jobs WHERE day = ?').all(day)).map(j => [j.source + ':' + j.ref, j]));
    const customerNotes = new Map((await db.prepare('SELECT source, ref, cust_no, note, status, checked_at, phone_hash FROM apex_customer_notes WHERE day = ?').all(day)).map(n => [
      n.source + ':' + n.ref, { custNo: n.cust_no, status: n.status, checkedAt: iso(n.checked_at), phone_hash: n.phone_hash, ...parseApexCustomerNote(n.note) }
    ]));
    const jobOf = (source, ref) => {
      const j = jobs.get(source + ':' + ref);
      if (!j) return null;
      const stale = j.state === 'claimed' && ctx.now - j.at > CLAIM_MS;
      return stale ? null : { state: j.state, by: j.employee_name, mine: me.staff && j.employee_id === me.id, payment: j.payment, note: j.note, at: iso(j.at), result: parseJson(j.result, null) };
    };
    // Orders already on Apex or out with the rider: their bill lines are not needed (lighter page).
    // On a Talabat live screen now (sent by a screen in the last 3 minutes).
    const liveNow = parseJson((await db.prepare("SELECT value FROM settings WHERE key = 'talabat_live_now'").get())?.value, {});
    const onLive = id => ctx.now - (liveNow[id] || 0) < 3 * 60000;
    // Orders already on Apex or out with the rider: a short line only (no items, bill or customer) — most of the day's orders.
    const slim = o => ({ source: o.source, ref: o.ref, code: o.code, at: o.at, status: o.status, out: o.out, branch: o.branch, apexBranch: o.apexBranch, total: o.total, apex: o.apex, done: true });
    // The automatic transfer's word on each waiting order (autotransfer.js): sent by itself, would be (trial), or why not.
    const autoNotes = app.autoTransferNotes && ctx.me ? await app.autoTransferNotes(day) : new Map();
    const list = base.list.filter(o => !cancelled.has(o.source + ':' + o.ref)).map(o0 => {
      // An order the Apex writer wrote is on Apex, with its number, even before matching finds it (11-11).
      const j0 = jobOf(o0.source, String(o0.ref)), o = !o0.apex && j0?.state === 'auto_done' && j0.result?.orderNo ? { ...o0, apex: { no: j0.result.orderNo, sn: j0.result.shiftSerial ?? null, user: null, how: 'job' } } : o0;
      const note = customerNotes.get(o.source + ':' + o.ref);
      const linked = note && note.phone_hash === sha256(deliveryPhone(o.customer?.phone) || '');
      return { ...(o.apex || o.out ? slim(o) : o), ...(o.source === 'talabat' ? { onLive: onLive(o.ref) } : {}),
        job: jobOf(o.source, o.source === 'site' ? String(o.ref) : o.ref),
        ...(!o.apex && !o.out && autoNotes.get(o.source + ':' + o.ref) ? { auto: autoNotes.get(o.source + ':' + o.ref) } : {}),
        apexCustomerNote: linked ? { custNo: note.custNo, status: note.status, checkedAt: note.checkedAt, text: note.text, directives: note.directives, other: note.other, oneTime: note.oneTime, permanent: note.permanent, requiresReview: note.requiresReview, unrecognized: note.unrecognized, next: note.next || null } : { status: 'pending' } };
    });
    // Karim 10-11: «طلبات بيكون فيها المنطقة ومع ذلك بيطلب تحديد المنطقة». Talabat names areas its own way
    // («الرحاب 1», «دار مصر الاندلس»); the Apex area the staff chose for the same Talabat area before is picked.
    // Website orders too (Karim 11-11 «المناطق معروفه»): the area the customer chose on the website, by the same learning
    // (the same words mean the same Apex area whichever platform wrote them), else an Apex area of exactly that name.
    const areaPairs = app.learn ? await areaLearned() : new Map();
    const byName = new Map();
    for (const l of base.locations || []) { const k = normArabic(String(l?.name || '')).slice(0, 120); if (k && Number.isInteger(l.no)) byName.set(k, (byName.get(k) || new Set()).add(l.no)); }
    for (let i = 0; i < list.length; i++) {
      const o = list[i], words = !o.done && !o.areaGuess && (o.customer?.talabatArea || o.customer?.siteArea), k = words && normArabic(words).slice(0, 120);
      if (!k) continue;
      const seen = areaPairs.get(k);
      if (seen?.size) {
        const top = [...seen].sort((x, y) => y[1] - x[1]), all = top.reduce((t, c) => t + c[1], 0);
        list[i] = { ...o, areaGuess: { no: Number(top[0][0]), seen: top[0][1], share: Math.round(top[0][1] / all * 100) / 100 } };
      } else if (byName.get(k)?.size === 1) list[i] = { ...o, areaGuess: { no: [...byName.get(k)][0], seen: 0, how: 'name' } };
    }
    // English typed by the customer (address, name, comments) shown and sent in Arabic (Karim 01-11); the original is kept.
    if (app.toArabic) {
      const open = list.filter(o => !o.done), texts = [];
      for (const o of open) texts.push(o.customer?.name, o.customer?.area, o.note, ...(o.items || []).flatMap(i => [i.note, ...(i.freeOptions || [])]));
      const ar = await app.toArabic(texts.filter(Boolean), { waitUntil: ctx.waitUntil }).catch(() => new Map());
      for (const [original,address] of app.toArabicAddress?.(open.map(o => o.customer?.address)) || []) ar.set(original,address);
      const tr = v => (v && ar.get(v)) || v, changed = v => v && ar.get(v) && ar.get(v) !== v;
      for (let i = 0; i < list.length; i++) {
        const o = list[i]; if (o.done) continue;
        const c = o.customer;
        list[i] = { ...o,
          ...(c ? { customer: { ...c, name: tr(c.name), address: tr(c.address), area: tr(c.area), ...(changed(c.address) || changed(c.name) ? { original: [c.name, c.address].filter(Boolean).join(' — ') } : {}),
            ...(changed(c.name) ? { nameEn: c.name } : {}), ...(changed(c.address) ? { addressEn: c.address } : {}) } } : {}),
          ...(changed(o.note) ? { note: tr(o.note), noteOriginal: o.note } : {}),
          ...(o.items ? { items: o.items.map(x => ({ ...x, note: tr(x.note), freeOptions: (x.freeOptions || []).map(tr) })) } : {}) };
      }
    }
    // Until an admin chooses, the automatic transfer only previews (shadow): it never writes to Apex.
    const mode = (await db.prepare("SELECT value FROM settings WHERE key = 'apex_bridge_mode'").get())?.value || 'shadow';
    const locations = (Array.isArray(snap.locations) ? snap.locations : []).filter(l => Number.isInteger(l?.no)).map(l => ({ no: l.no, name: String(l.name || ''), branch: l.branch ?? null, service: l.service ?? null }));
    // The Apex items list and the areas change rarely: sent only when the page does not have this version yet.
    const items = mode && mode !== 'off' ? APEX_ITEM_LIST : [];
    const sections = items.length ? APEX_SECTIONS.map(x => ({ name: x.name, items: x.items.filter(no => APEX_NAMES[no]) })).filter(x => x.items.length) : [];
    const staticKey = 's' + sections.length + ':' + items.length + ':' + locations.length + ':' + locations.reduce((a, l) => a + l.no * (l.branch || 1) + (Number(l.service) || 0), 0).toFixed(2);
    const fresh = String(ctx.have || '') !== staticKey;
    return { day, me: { name: me.name, staff: me.staff }, serverNow: iso(ctx.now), stale: base.stale === true, liveScreen: ctx.now - (liveNow._screen || 0) < 3 * 60000, autoTransfer: mode, branches: APEX_BRANCHES, staticKey,
      ...(fresh ? { locations, apexItems: items, sections } : {}), orders: list };
  }
  app.transferQueue = queueFor;

  // The day's orders (heavy: Apex snapshot, matching): built in the background after every push and kept in the
  // database too (Karim 01-11: the page was slow on first opening — a cold server rebuilt the whole day while the
  // employee waited). The page reads the last build; only one older than a minute is rebuilt while it waits.
  // Per day: the last build, whether something changed since (a push), and the build running now.
  const st = new Map(), S = day => st.get(day) || (st.set(day, { dirty: false, run: null }), st.get(day));
  // Karim 11-14 «الاوردرات بتاخد وقت عقبال ما تظهر في صفحه التحويلات»: how long a build takes and how long after it
  // arrived an order first appears in one (this instance), in /api/health/errors → transferBuilds.
  const buildStats = { n: 0, totalMs: 0, maxMs: 0, lastMs: 0, lastAt: null, shown: 0, lagTotal: 0, lagMax: 0, lagLast: [] }, firstShown = new Map();
  function noteBuild(base, ms) {
    Object.assign(buildStats, { n: buildStats.n + 1, totalMs: buildStats.totalMs + ms, maxMs: Math.max(buildStats.maxMs, ms), lastMs: ms, lastAt: iso(app.now()) });
    for (const o of base.list || []) {
      const k = o.source + ':' + o.ref; if (firstShown.has(k)) continue;
      firstShown.set(k, base.at);
      const lag = base.at - Date.parse(o.at || 0);
      if (o.apex || o.out || !(lag >= 0 && lag < 3600000)) continue;
      buildStats.shown++; buildStats.lagTotal += lag; buildStats.lagMax = Math.max(buildStats.lagMax, lag);
      buildStats.lagLast = [{ order: k, seconds: Math.round(lag / 1000) }, ...buildStats.lagLast].slice(0, 10);
    }
    if (firstShown.size > 5000) firstShown.clear();
  }
  app.transferBuildStats = () => ({ builds: buildStats.n, avgMs: buildStats.n ? Math.round(buildStats.totalMs / buildStats.n) : null, maxMs: buildStats.maxMs, lastMs: buildStats.lastMs, lastAt: buildStats.lastAt,
    newOrders: buildStats.shown, avgShowSeconds: buildStats.shown ? Math.round(buildStats.lagTotal / buildStats.shown / 1000) : null, maxShowSeconds: Math.round(buildStats.lagMax / 1000), last: buildStats.lagLast });
  function rebuild(day) {
    const x = S(day);
    if (db.kind !== 'd1' && x.run) return x.run;
    const run = (async () => {
      const release = db.kind === 'd1' ? await takeTransferBuildLease(db, day, app.now()) : null;
      if (db.kind === 'd1' && !release) fail(503, 'قائمة التحويل بتتحدّث؛ حاول بعد ثواني');
      try {
        // Another request may have completed between the cache read and the lease.
        const latest = await db.prepare('SELECT at, data FROM transfer_cache WHERE day = ?').get(day);
        if (!x.dirty && latest && app.now() - latest.at < QUEUE_CACHE_MS) {
          const saved = parseJson(latest.data, null);
          if (saved) { queueCache.set(day, saved); return saved; }
        }
        let base, passes = 0;
        const t0 = Date.now();
        do {
          x.dirty = false;
          base = await buildBase(day, app.now());
          queueCache.set(day, base);
        } while (x.dirty && ++passes < 2);
        noteBuild(base, Date.now() - t0);
        const keep = { at: base.at, locations: base.locations, list: base.list.map(o => o.apex || o.out ? { source: o.source, ref: o.ref, code: o.code, at: o.at, status: o.status, out: o.out, branch: o.branch, apexBranch: o.apexBranch, total: o.total, apex: o.apex } : o) };
        await db.prepare('INSERT INTO transfer_cache (day, at, data) VALUES (?,?,?) ON CONFLICT(day) DO UPDATE SET at = excluded.at, data = excluded.data WHERE excluded.at >= transfer_cache.at').run(day, base.at, JSON.stringify(keep)).catch(() => {});
        return base;
      } finally { if (release) await release().catch(() => {}); }
    })().finally(() => { if (x.run === run) x.run = null; });
    // Worker I/O belongs to its initiating request: never await another request's
    // in-flight promise. Only completed data can be shared between requests.
    if (db.kind !== 'd1') x.run = run;
    return run;
  }
  async function baseFor(day, now, { allowStale = false, cachedOnly = false } = {}) {
    const x = S(day);
    // The automatic transfer (11-11) never builds the day itself: it reads the last completed build (a minute at most),
    // so it adds no load next to the employees' page and the pushes.
    if (cachedOnly) {
      const b = queueCache.get(day); if (b && now - b.at < 60000) return b;
      const r = await db.prepare('SELECT at, data FROM transfer_cache WHERE day = ?').get(day);
      const d = r && now - r.at < 60000 ? parseJson(r.data, null) : null; if (d) return d;
      return null;
    }
    if (db.kind !== 'd1' && x.run) return x.run;                                    // a build is running here: its result is the freshest
    const b = queueCache.get(day);
    if (b && !x.dirty && now - b.at < QUEUE_CACHE_MS) return b;
    // Pushes may reach another server: the last build any server saved (Karim 01-11: a fresh server rebuilt the whole
    // day on the first opening while the employee waited).
    const r = await db.prepare('SELECT at, data FROM transfer_cache WHERE day = ?').get(day);
    if (!x.dirty && r && r.at > (b?.at || 0) && now - r.at < QUEUE_CACHE_MS) { const d = parseJson(r.data, null); if (d) { queueCache.set(day, d); x.dirty = false; return d; } }
    try { return await rebuild(day); }
    catch (error) {
      if (error.status === 503 && !allowStale) {
        const completed = await waitForTransferBuild(db, day, Math.max(r?.at || 0,b?.at || 0));
        if (completed) { queueCache.set(day,completed); return completed; }
      }
      // Only the read-only queue may show a recent completed snapshot when matching or D1 is slow.
      // Actions still require a successful fresh build, so a stale order cannot be claimed or entered.
      if (allowStale) {
        const persisted = r && parseJson(r.data, null);
        const saved = persisted?.at > (b?.at || 0) ? persisted : (b || persisted);
        // A busy builder is not a failed sync. Keep a very recent completed view
        // without tearing down the employee's editor; write actions still fail closed.
        if (error.status === 503 && saved && Array.isArray(saved.list) && now - saved.at <= 9000) return saved;
        if (saved && Array.isArray(saved.list) && Number.isFinite(saved.at) && now - saved.at <= 15 * 60000)
          return { ...saved, stale: true };
      }
      throw error;
    }
  }
  // Reconcile against the current Apex snapshot again at the moment an employee submits an action.
  // The queue can be open in a stale browser tab after Apex has already received the order.
  async function assertNotAlreadyOnApex(source, ref, day, now) {
    if (!await sourceCanTransfer(db, source, ref)) fail(409, 'الأوردر اتلغى أو مش موجود — مش هيتحوّل');
    const base = await baseFor(day, now);
    if (!await sourceCanTransfer(db, source, ref)) fail(409, 'الأوردر اتلغى أثناء التحديث — مش هيتحوّل');
    const found = base?.list?.find(o => o.source === source && String(o.ref) === String(ref));
    if (found?.apex) fail(409, 'الأوردر موجود على Apex بالفعل — مش هيتسجل مرة تانية');
  }
  // Every push from the Talabat screens, the cashier PC or the website (and the page's own actions): the next read
  // is built in the background, so the page usually finds it ready.
  app.afterRequest((now, method, path) => {
    if (method !== 'POST') return;
    const day = businessDay(now), x = S(day);
    // The page's own actions (claim, entered, auto) and the writer's answers: shown at once.
    if (/^\/api\/(?:apex-writer\/result|transfer\/(?:job|selection))$/.test(path || '')) { x.dirty = true; return rebuild(day).catch(() => {}); }
    // High-frequency source pushes must NOT rebuild the full day's matching on every request.
    // A completed build is reusable for four seconds, including across Cloudflare isolates via D1.
    // The next queue read refreshes it after the window; explicit staff actions still rebuild immediately.
    if (/^\/api\/(?:talabat|orders|site)\/push$/.test(path || '')) {
      const b = queueCache.get(day);
      if (b && now - b.at >= 0 && now - b.at < QUEUE_CACHE_MS) return;
      if (db.kind !== 'd1' && x.run) { x.dirty = true; return; }
      // The D1 cache is authoritative across requests; when another isolate just rebuilt it,
      // skip this worker's redundant work rather than refreshing the entire day again.
      return db.prepare('SELECT at FROM transfer_cache WHERE day = ?').get(day)
        .then(r => {
          if (r && now - r.at >= 0 && now - r.at < QUEUE_CACHE_MS) return;
          x.dirty = true;
          return rebuild(day);
        }).catch(() => {});
    }
  });
  async function buildBase(day, now) {
    {
      const snap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day))?.data, {});
      const apexName = new Map(Object.entries(APEX_NAMES));
      for (const a of [...(snap.online || []), ...(snap.orders || [])]) for (const i of a.items || []) if (i?.no && i?.name) apexName.set(String(i.no).trim(), i.name);
      const learned = new Map();
      if (app.learn) for (const [n, m] of await app.learn.pairs('match-v2:item:talabat')) { const ok = new Map([...m].filter(([, c]) => c >= 2)); if (ok.size) learned.set(n, ok); }
      const itemHistory = app.learn ? await itemsLearned() : new Map();
      const siteItemHistory = app.learn ? await app.learn.pairs('transfer:item:site') : new Map();
      // Apex items for a Talabat name: the item map first; else (live orders name add-ons in Arabic, «ممبار») the Apex item
      // with exactly that name, or the only one whose name holds it.
      const arKey = v => String(v || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').replace(/\s+/g, ' ').trim();
      const suggest = (...names) => {
        for (const n of names.filter(Boolean)) { const k = knownNos(n, learned); if (k.length) return k; }
        for (const n of names.filter(n => /[\u0600-\u06ff]/.test(n || ''))) {
          const want = arKey(n), exact = [...apexName].filter(([, nm]) => arKey(nm) === want).map(([no]) => no);
          if (exact.length) return exact;
          const part = [...apexName].filter(([, nm]) => arKey(nm).includes(want)).map(([no]) => no);
          if (part.length === 1) return part;
        }
        return [];
      };
      const itemOut = (x, withApex) => {
        let apex = (withApex ? suggest(x.name, x.nameShown) : []).map(no => ({ no, name: apexName.get(no) || null }));
        // A size/weight chosen on Talabat («Quarter Kilo») narrows the Apex choices to that size, when their names say it.
        // The size: the priced weight option first (it carries the dish's price), else any weight written.
        const wOf = t => WEIGHTS.find(w => w[0].test(wName(t)));
        const wOpt = (x.options || []).find(o => wOf(o.name) && Number(o.price) > 0) || (x.options || []).find(o => wOf(o.name));
        const size = wOpt ? wOf(wOpt.name) : (x.modifiers || []).map(wOf).find(Boolean);
        const sized = size ? apex.filter(a => a.name && size[1].test(a.name)) : [];
        if (sized.length) apex = sized;
        // Karim 10-11 «والأصناف برضو بتطلب اختيار»: with several candidates (sizes, offers), the one the staff chose
        // for this same Talabat dish and options before is picked (2+ times, 70%+ of the time; checked on 509 past lines:
        // every pick was what staff chose); with none, an Arabic name is matched to Apex's menu when the match is clear.
        let apexPick = null;
        const isSite = withApex === 'site';
        if (withApex && !isSite && apex.length > 1) {
          const seen = itemHistory.get(lineKey(x)), top = seen && [...seen].filter(([no]) => apex.some(a => a.no === no)).sort((u, v) => v[1] - u[1]);
          const all = top ? top.reduce((t, c) => t + c[1], 0) : 0;
          if (top?.length && top[0][1] >= 2 && top[0][1] >= all * 0.7) apexPick = top[0][0];
        }
        // Website dishes (11-11): the website's menu → Apex table (site-items.js), the weight and the order's words pick one.
        let inTable = false;
        if (isSite) {
          const nameSize = size || WEIGHTS.find(w => w[0].test(wName(x.name))) || null;
          const unit = Number(x.price) > 0 && Number(x.qty) > 0 ? Number(x.price) / Number(x.qty) : null;
          const m = siteApexItems(x.name, { size: nameSize, text: (x.modifiers || []).filter(t => !/سلط|ضمن الوجبة/.test(t)).join(' '), apexName });
          if (m) {
            inTable = true;
            let nos = m.nos;
            // Still several (a weight dish with no weight shown): the one whose price is the website's (Apex + 14%, 3%).
            // (Apex is kept up to 5% above the website: Karim 11-11.)
            if (m.weighed && nos.length > 1 && unit) { const p = nos.filter(no => { const g = Number(APEX_PRICES[no]) * 1.14; return g > 0 && unit >= g / 1.05 * 0.97 && unit <= g * 1.03; }); if (p.length === 1) nos = p; }
            // A price far from the website's (over 20%) means the table may be wrong for this dish: nothing is filled in.
            if (unit && nos.length === 1 && Number(APEX_PRICES[nos[0]]) > 0 && Math.abs(APEX_PRICES[nos[0]] * 1.14 - unit) > unit * 0.2) nos = [];
            apex = nos.map(no => ({ no, name: apexName.get(no) || null }));
            apexPick = nos.length === 1 ? nos[0] : null;
            if (!apexPick && apex.length > 1) {
              const seen = siteItemHistory.get(lineKey(x));
              const ranked = seen && [...seen].filter(([no]) => apex.some(a => a.no === no)).sort((a, b) => b[1] - a[1]);
              const total = ranked?.reduce((sum, [, count]) => sum + count, 0) || 0;
              if (ranked?.[0] && ranked[0][1] >= 2 && ranked[0][1] >= total * 0.7) apexPick = ranked[0][0];
            }
          }
        }
        if (withApex && !apex.length && !inTable) {
          const g = guessApexItem([x.nameShown, x.name].find(n => /[\u0600-\u06ff]/.test(n || '')) || '', 2);
          // A guessed item must be the dish's size when a size was chosen (11-11: «الكفته / نص كيلو» never guessed as a quarter).
          if (g[0] && g[0].score >= 0.85 && !(g[1] && g[1].score >= g[0].score - 0.05) && (!size || size[1].test(g[0].name || ''))) { apex = [{ no: g[0].itemNo, name: g[0].name }]; apexPick = g[0].itemNo; }
        }
        // Options: the size (weight) choice, add-ons that cost money (their own Apex line), and free choices (a note).
        // A discount under the dish (minus price, or discount words) is neither an add-on nor a comment: it goes to the discounts.
        const isDisc = o => Number(o.price) < 0 || DISC_WORDS.test(o.name);
        // Under a dish Talabat shows the discount, its description, and who funds which part («ممول من قبلك» = the restaurant,
        // «ممول من قبل Talabat» = Talabat). With the funded parts, those are the discounts; without them the dish's discount
        // (the largest line, so «خصم» and «خصم 30%…» are not counted twice) is the restaurant's.
        const amountOf = t => { const m = String(t).match(AMOUNT); return m ? Math.abs(Number(m[1].replace(/[^\d.]/g, ''))) || null : null; };
        const found = [...(Array.isArray(x.options) ? x.options : []).filter(isDisc).map(o => ({ label: o.name, amount: o.price != null ? Math.abs(Number(o.price)) : null })),
          ...(x.discountLines || []).map(t => ({ label: String(t).split('|')[0].trim(), amount: String(t).includes('|') ? amountOf(String(t).split('|').slice(1).join('|')) : null }))];
        const funded = found.filter(d => discountWho(d.label) && d.amount);
        const top = found.filter(d => d.amount).sort((a, b) => b.amount - a.amount)[0];
        // The funded parts must add up to the dish's discount; if they don't, who pays what is not clear (entered by hand).
        const fundedOk = funded.length && (!top || Math.abs(funded.reduce((a, d) => a + d.amount, 0) - top.amount) < 0.05 || funded.some(d => d.amount === top.amount));
        if (funded.length && !fundedOk) funded.forEach(d => { d.unclear = true; });
        const itemDiscounts = funded.length && !fundedOk ? [{ text: (top?.label || 'خصم') + ' — ' + x.name + ' (التقسيم مش واضح)', amount: top?.amount ?? null, who: null }] : funded.length ? [...new Map(funded.map(d => [discountWho(d.label) + d.amount, { text: d.label + ' — ' + x.name, amount: d.amount, who: discountWho(d.label) }])).values()]
          : top ? [{ text: top.label + ' — ' + x.name, amount: top.amount, who: 'restaurant' }] : found.length ? [{ text: found[0].label + ' — ' + x.name, amount: null, who: 'restaurant' }] : [];
        const opts = (Array.isArray(x.options) ? x.options : []).filter(o => !isDisc(o));
        // The weight is the size, never an add-on, even when it carries the dish's price («1 كيلو» 1,509).
        const isWeight = o => WEIGHTS.some(w => w[0].test(wName(o.name)));
        const sizeOpt = opts.find(o => isWeight(o) && Number(o.price) > 0) || opts.find(isWeight) || null;
        // Karim 11-14 (#2946: «حمام محشو ×2» with «ممبار ×2» 212 ج and «محشي مشكل ×2» 274 ج went to Apex as 1 each): for
        // a dish ordered more than once, Talabat's count of an add-on is sometimes per dish and sometimes for the line. Its
        // price is for the line, so with one Apex item for it the count is the price over Apex's price; when the price
        // cannot tell, the count is left to a person.
        const addons = opts.filter(o => o !== sizeOpt && !isWeight(o) && Number(o.price) > 0).map(o => {
          const apex = (withApex ? suggest(o.name) : []).map(no => ({ no, name: apexName.get(no) || null }));
          return { name: o.name, qty: addonCount(o, Number(x.qty) || 1, apex), price: Number(o.price), apex };
        });
        const free = opts.filter(o => o !== sizeOpt && !(Number(o.price) > 0)).map(o => (Number(o.qty) > 1 ? o.qty + '× ' : '') + o.name);
        return { qty: x.qty, name: x.name, price: x.price ?? null, ...(x.note ? { note: x.note } : {}), modifiers: x.modifiers || [], modifiersComplete: x.modifierComplete === true || !withApex || isSite, size: size ? size[2] : null, apex, ...(apexPick ? { apexPick } : {}),
          // The size picks the Apex item itself (ربع كيلو نيفة): it is neither an add-on nor a comment.
          addons, sizeOption: sizeOpt ? sizeOpt.name : null, freeOptions: opts.length ? free : (x.modifiers || []).filter(m => !WEIGHTS.some(w => w[0].test(wName(m))) && !DISC_WORDS.test(m)), itemDiscounts };
      };
      const list = [];

      // Talabat
      const tm = app.talabat ? await app.talabat.matchDay(day, { fresh: true }) : { rows: [], matches: new Map(), states: new Map() };
      const tProfiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map(x => [x.ref, parseJson(x.data, {})]));
      for (const o of tm.rows) {
        if (isCancelled(o.status)) continue;
        const p = tProfiles.get(o.id) || {}, a = tm.matches.get(o.id), bill = p.bill || [];
        const items = parseJson(o.items, []).map(x => itemOut(x, true));
        // The bill's discount lines are the order's total; the lines under the dishes count only when the bill shows none (never both).
        // Under the dishes = the restaurant's discount (deducted); in the bill summary = Talabat's (special mark).
        // A bill line that only repeats the dishes' discount total is the same money, not a second discount.
        const dishDiscounts = items.flatMap(i => i.itemDiscounts || []), dishTotal = dishDiscounts.reduce((a, d) => a + (Number(d.amount) || 0), 0);
        const billDiscounts = talabatDiscounts(bill).filter(d => !(dishTotal > 0 && d.amount != null && Math.abs(d.amount - dishTotal) < 0.05 && !/(talabat|طلبات)/i.test(d.text)));
        const discounts = [...dishDiscounts, ...billDiscounts];
        list.push({ source: 'talabat', ref: o.id, code: o.code || null, at: iso(o.accepted_at || o.received_at || o.placed_at), status: o.status, out: TALABAT_OUT.has(String(o.status || '').toUpperCase()) || !!o.picked_up_at || !!o.delivered_at, branch: o.store, apexBranch: apexBranchOf(o.store), deliveryType: o.delivery_type || null,
          customer: { name: /^(?:information|details|customer|العميل)$/i.test(p.name || '') ? null : p.name || null, phone: phoneOut(p.phoneDisplay || p.phone || p.mobileDisplay || p.mobile), address: p.address || null, ...(p.area ? { talabatArea: p.area } : {}) },
          // What Apex must total (Karim 31-10): the bill's «مجموع» (what the customer pays) plus Talabat's share of the discounts
          // (not deducted on Apex). The writer discounts any amount Apex comes out above it.
          target: (() => { const t = bill.find(x => /^(?:مجموع|المجموع|الإجمالي|total|order total)$/i.test(String(x.k || '').trim())), v = t ? amountOf(String(t.text).split(' | ').slice(1).join(' ')) : o.total ?? null;
            return v == null ? null : Math.round((v + discounts.filter(d => d.who === 'platform').reduce((a, d) => a + (Number(d.amount) || 0), 0)) * 100) / 100; })(),
          note: (bill.find(x => x.k === 'ملاحظة العميل')?.text || '').split(' | ').slice(1).join(' | ') || null, payment: talabatPayment(bill, p.livePay), bill, discounts, subtotal: o.subtotal ?? null, total: o.total ?? null,
          items, detailRead: !!o.detail_at,
          apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null, matching: tm.states.get(o.id) || null, job: null });
      }

      // Website
      const siteWindow = dayWindow(day);
      const sRows = await db.prepare('SELECT * FROM site_orders WHERE (scheduled_at IS NULL AND day = ?) OR (scheduled_at >= ? AND scheduled_at < ?)').all(day, siteWindow.start, siteWindow.end);
      const sm = app.site && sRows.length ? await app.site.apexMatch(day, sRows) : { matches: new Map(), states: new Map() };
      const sProfiles = new Map();
      for (let i = 0; i < sRows.length; i += 90) {
        const part = sRows.slice(i, i + 90), qs = part.map(() => '?').join(',');
        for (const x of await db.prepare(`SELECT ref, data FROM match_profiles WHERE source = 'site' AND ref IN (${qs})`).all(...part.map(o => String(o.id)))) sProfiles.set(x.ref, parseJson(x.data, {}));
      }
      for (const o of sRows) {
        if (isCancelled(o.status)) continue;
        const p = sProfiles.get(String(o.id)) || {}, pay = p.payment || null, a = sm.matches.get(o.id);
        const discounts = pay ? [...(pay.coupons || []).map(c => ({ text: 'كوبون ' + c.code, amount: c.amount, who: 'restaurant' })),
          ...(!pay.coupons?.length && pay.discount ? [{ text: 'خصم الموقع', amount: pay.discount, who: 'restaurant' }] : [])] : [];
        list.push({ source: 'site', ref: String(o.id), code: String(p.panel?.number || o.id).replace(/\D/g, '') || String(o.id), at: iso(o.scheduled_at || o.created_at), status: o.status, out: !!o.out_at || !!o.delivered_at || o.status === 'completed', sentToBranch: !!o.transfer_at, branch: o.branch || null, apexBranch: apexBranchOf(o.branch), scheduled: !!o.scheduled && (!o.scheduled_at || Number(o.scheduled_at) > now),
          customer: { name: p.customer?.name || null, phone: phoneOut(p.customer?.phoneDisplay || p.customer?.phone || p.customer?.mobileDisplay || p.customer?.mobile), address: p.customer?.address || null, ...(p.customer?.area ? { siteArea: p.customer.area } : {}) },
          target: o.total ?? null, payment: sitePayment(pay), paymentMethod: pay?.method || null, paymentTitle: pay?.title || null, note: pay?.note || null, scheduledAt: iso(o.scheduled_at), discounts, fees: pay?.fees || [], shipping: pay?.shipping ?? null, total: o.total ?? null,
          fulfillment: o.fulfillment || null, ...(o.fulfillment === 'pickup' && PICKUP_AREAS[apexBranchOf(o.branch)] ? { areaGuess: { ...PICKUP_AREAS[apexBranchOf(o.branch)], how: 'pickup' } } : {}), items: (p.items || []).map(x => itemOut(x, 'site')), detailRead: !!p.items?.length,
          apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null, matching: sm.states?.get(o.id) || null, job: null });
      }
      // Explicit staff choices are separate from inferred matches and scoped to source,
      // dish/add-on, parent dish and size. Conflicting choices stay visible for review.
      const manual = new Map();
      for (const r of await db.prepare("SELECT DISTINCT a,b FROM learned WHERE kind = 'transfer-item-choice'").all()) {
        if (!manual.has(r.a)) manual.set(r.a, new Map());
        manual.get(r.a).set(r.b, 1);
      }
      for (const order of list) for (const item of order.items) {
        const lines = [[item, 'item', ''], ...(item.addons || []).map(a => [a, 'addon', item.name])];
        for (const [line, kind, parent] of lines) {
          line.choiceKey = sha256(JSON.stringify([order.source, kind, parent, line.name, item.sizeOption || '']));
          const choices = [...(manual.get(line.choiceKey)?.keys() || [])].filter(no => apexName.has(no));
          if (choices.length) line.apex = choices.map(no => ({ no, name: apexName.get(no) }));
        }
      }
      list.sort((x, y) => (x.apex ? 1 : 0) - (y.apex ? 1 : 0) || String(x.at || '').localeCompare(String(y.at || '')));
      return { at: now, list, locations: (Array.isArray(snap.locations) ? snap.locations : []) };
    }
  }
  // ---- claim / entered / release ----
  // The Apex item staff chose for a Talabat dish (with its options), learned from every job (and once from the past ones).
  const lineKey = x => (itemKey(x.name) + '|' + (Array.isArray(x.options) ? x.options : []).map(v => itemKey(v?.name || '')).filter(Boolean).sort().join(',')).slice(0, 160);
  const talabatLearned = async () => {
    const m = new Map();
    for (const [n, c] of await app.learn.pairs('match-v2:item:talabat')) { const ok = new Map([...c].filter(([, k]) => k >= 2)); if (ok.size) m.set(n, ok); }
    return m;
  };
  const itemFacts = (lines, chosen, learned) => {
    const out = [];
    for (const x of lines) {
      const c = knownNos(x.name, learned);
      const hit = [...new Set(c)].filter(no => chosen.has(no));
      if (hit.length === 1) out.push([lineKey(x), hit[0]]);
    }
    return out;
  };
  let itemsFilled = false;
  async function itemsLearned() {
    let pairs = await app.learn.pairs('transfer:item');
    if (!pairs.size && !itemsFilled) {
      itemsFilled = true;
      const rows = await db.prepare(`SELECT j.ref, j.payload, t.items FROM transfer_jobs j JOIN talabat_orders t ON t.id = j.ref
        WHERE j.source = 'talabat' AND j.payload IS NOT NULL ORDER BY j.at DESC LIMIT 3000`).all();
      const facts = [], learned = await talabatLearned();
      for (const r of rows) {
        const chosen = new Set((parseJson(r.payload, {})?.items || []).filter(x => !x.free).map(x => String(x.itemNo)));
        for (const [k, no] of itemFacts(parseJson(r.items, []), chosen, learned)) facts.push([k, no, r.ref + ':' + facts.length]);
      }
      for (let i = 0; i < facts.length; i += 100)
        await db.batch(facts.slice(i, i + 100).map(([k, no, ref]) => db.prepare("INSERT INTO learned (kind, a, b, ref, value, at) VALUES ('transfer:item', ?, ?, ?, NULL, ?) ON CONFLICT(kind, a, b, ref) DO NOTHING").bind(k, no, ref, app.now()))).catch(() => {});
      if (facts.length) { app.learn.forget?.(); pairs = await app.learn.pairs('transfer:item'); }
    }
    return pairs;
  }
  // What staff chose before: from the jobs already done, once, then from every new job.
  let areaFilled = false;
  async function areaLearned() {
    let pairs = await app.learn.pairs('transfer:area');
    const confirmed = await app.learn.pairs('transfer:area-confirmed');
    for (const [area, locations] of confirmed) pairs.set(area, locations);
    if (!pairs.size && !areaFilled) {
      areaFilled = true;
      const rows = await db.prepare(`SELECT j.ref, j.payload, p.data FROM transfer_jobs j JOIN match_profiles p ON p.source = 'talabat' AND p.ref = j.ref
        WHERE j.source = 'talabat' AND j.payload IS NOT NULL ORDER BY j.at DESC LIMIT 3000`).all();
      const facts = rows.map(r => [parseJson(r.payload, {})?.locationNo, normArabic(parseJson(r.data, {})?.area).slice(0, 120), r.ref]).filter(([loc, area]) => loc && area);
      for (let i = 0; i < facts.length; i += 100)
        await db.batch(facts.slice(i, i + 100).map(([loc, area, ref]) => db.prepare("INSERT INTO learned (kind, a, b, ref, value, at) VALUES ('transfer:area', ?, ?, ?, NULL, ?) ON CONFLICT(kind, a, b, ref) DO NOTHING").bind(area, String(loc), String(ref), app.now()))).catch(() => {});
      if (facts.length) { app.learn.forget?.(); pairs = await app.learn.pairs('transfer:area'); }
    }
    return pairs;
  }
  async function learnTransferArea(source, ref, locationNo, confirmed = false) {
    if (!app.learn || !locationNo) return;
    const d = parseJson((await db.prepare('SELECT data FROM match_profiles WHERE source = ? AND ref = ?').get(source, ref))?.data, {});
    const area = source === 'talabat' ? d?.area : d?.customer?.area;
    if (area && normArabic(area)) {
      const evidence = source === 'talabat' ? String(ref) : 'site:' + ref;
      await app.learn.record('transfer:area', normArabic(area).slice(0, 120), String(locationNo), evidence).catch(() => {});
      if (confirmed) await app.learn.record('transfer:area-confirmed', normArabic(area).slice(0, 120), String(locationNo), evidence).catch(() => {});
    }
  }
  // Learn only from a transfer Apex actually accepted. A queued job or a failed write
  // is not evidence that the selected item/area was correct.
  async function learnSuccessfulTransfer(source, ref, payload, now) {
    if (!app.learn || !payload || payload.source !== source || String(payload.ref) !== String(ref)) return;
    const chosen = new Set((payload.items || []).filter(x => !x.free).map(x => String(x.itemNo)));
    if (chosen.size) {
      const row = await db.prepare(source === 'talabat' ? 'SELECT day, items FROM talabat_orders WHERE id = ?' : 'SELECT day, scheduled_at FROM site_orders WHERE id = ?').get(ref);
      if (row) {
        const order = (await baseFor(orderDay(row), now)).list.find(o => o.source === source && String(o.ref) === String(ref));
        if (order) {
          const raw = source === 'talabat' ? parseJson(row.items, [])
            : parseJson((await db.prepare("SELECT data FROM match_profiles WHERE source = 'site' AND ref = ?").get(ref))?.data, {}).items || [];
          const facts = [];
          for (let i = 0; i < Math.min(raw.length, order.items.length); i++) {
            const line = order.items[i], candidates = new Set((line.apex || []).map(a => String(a.no)));
            const hit = [...candidates].filter(no => chosen.has(no));
            if (hit.length === 1) facts.push([lineKey(raw[i]), hit[0]]);
          }
          const kind = source === 'talabat' ? 'transfer:item' : 'transfer:item:site';
          for (let i = 0; i < facts.length; i++) await app.learn.record(kind, facts[i][0], facts[i][1], source + ':' + ref + ':' + i, null, now).catch(() => {});
        }
      }
    }
    if (!payload.pickup) await learnTransferArea(source, ref, payload.locationNo, true);
  }
  function addonCount(o, dishes, apex) {
    const n = Number(o.qty) > 0 ? Number(o.qty) : null, price = Number(o.price);
    // Every suggested Apex item whose price fits a whole count; taken when they all say the same count.
    const fits = new Set();
    for (const c of apex.slice(0, 6)) {
      const unit = Number(APEX_PRICES[c.no]) * 1.14; if (!(unit > 0 && price > 0)) continue;
      const k = Math.round(price / unit);
      if (k >= 1 && k <= 50 && Math.abs(k * unit - price) <= Math.max(0.12 * price, 10)) fits.add(k);
    }
    if (fits.size === 1) return [...fits][0];
    if (n == null) return null;
    // Two dishes or more and the price cannot tell: the screens disagree (a count per dish or for the line), so a person
    // picks it (the page asks «عدد إضافة مش واضح»; the automatic transfer leaves it).
    return dishes > 1 ? null : n;
  }
  app.route('POST', '/api/transfer/selection', async ctx => {
    const me = await who(ctx), b = ctx.body;
    const source = ['talabat', 'site'].includes(b.source) ? b.source : null, ref = String(b.ref || '');
    if (!source || !/^\d{1,20}$/.test(ref)) fail(400, 'أوردر غير صحيح');
    const row = await db.prepare(source === 'talabat' ? 'SELECT day FROM talabat_orders WHERE id = ?' : 'SELECT day, scheduled_at FROM site_orders WHERE id = ?').get(ref);
    if (!row) fail(404, 'الأوردر مش موجود');
    const job = await db.prepare('SELECT * FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
    if (job && !['released', 'auto_failed', 'auto_preview'].includes(job.state) && !(job.state === 'claimed' && ctx.now - job.at > CLAIM_MS) && (job.employee_id !== me.id || job.state !== 'claimed')) fail(409, 'الأوردر محجوز أو اتبعت بالفعل');
    const dueDay = orderDay(row), order = (await baseFor(dueDay, ctx.now)).list.find(o => o.source === source && String(o.ref) === ref);
    if (!order || order.apex || order.out) fail(409, 'الأوردر مش متاح للاختيار');
    const lines = order.items.flatMap(i => [i, ...(i.addons || [])]);
    const line = Number.isInteger(b.line) ? lines[b.line] : null, itemNo = String(b.itemNo || '');
    if (!line || line.choiceKey !== b.choiceKey) fail(409, 'تفاصيل الأوردر اتغيرت — حدّث الصفحة');
    if (!APEX_NAMES[itemNo]) fail(400, 'اختار صنف موجود على Apex');
    const evidence = source + ':' + ref + ':' + b.line;
    await db.batch([
      db.prepare("DELETE FROM learned WHERE kind = 'transfer-item-choice' AND a = ? AND ref = ?").bind(line.choiceKey, evidence),
      db.prepare("INSERT INTO learned (kind,a,b,ref,value,at) VALUES ('transfer-item-choice',?,?,?,?,?)").bind(line.choiceKey,itemNo,evidence,me.name,ctx.now)
    ]);
    await app.audit('transfer_item_selected', me.staff ? me.id : null, { actor: me.name, source, ref, line: b.line + 1, sourceItem: line.name, itemNo, itemName: APEX_NAMES[itemNo] });
    S(dueDay).dirty = true;
    return { ok: true };
  });

  // Automatic transfer: the employee (or the automatic transfer, autotransfer.js) confirms the Apex items, branch and payment;
  // the order is frozen and handed to the Apex writer on the restaurant PC.
  async function autoJob({ me, b, source, ref, row, cur, othersClaim, payment, note, now, manual = false }) {
      if (!await sourceCanTransfer(db, source, ref)) fail(409, 'الأوردر اتلغى أو مش موجود — مش هيتحوّل');
      // Automatic transfer: the employee confirms the Apex items, branch and payment; the order is frozen
      // and handed to the Apex writer on the restaurant PC. Off until an admin turns it on (test first).
      const mode = await setting('apex_bridge_mode') || 'shadow';
      const dueDay = orderDay(row);
      if (!['shadow', 'test', 'live'].includes(mode)) fail(409, 'التحويل الآلي مقفول — سجّل على Apex بإيدك');
      if (othersClaim) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد تاني'));
      if (cur && /^auto_(?:pending|sending|retry_pending|done|preview)$/.test(cur.state)) fail(409, 'الأوردر اتبعت للتحويل الآلي بالفعل');
      // Cash, or prepaid (Apex: Ledge with the amount on the customer's ledger, like every prepaid Talabat order there).
      if (payment !== 'cash' && payment !== 'paid') fail(400, 'حدد: كاش ولا مدفوع');
      const branchNo = Number(b.branchNo);
      if (!Number.isInteger(branchNo) || branchNo < 1 || branchNo > 99) fail(400, 'اختار فرع Apex');
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length || items.length > 40) fail(400, 'اختار أصناف Apex');
      const clean = items.map(x => ({ itemNo: String(x?.itemNo || '').trim(), qty: Number(x?.qty), note: x?.note ? String(x.note).slice(0, 60) : '' }));
      if (clean.some(x => !/^\d{1,10}$/.test(x.itemNo) || !(x.qty > 0 && x.qty <= 50))) fail(400, 'فيه صنف لسه مااتختارش أو عدده مش مظبوط');   // Apex offers have short numbers (111, 218, 315)
      // Unattended transfers follow the source. Staff may explicitly confirm a correction.
      let paymentOverride = null;
      if (source === 'site') {
        const sp = parseJson((await db.prepare("SELECT data FROM match_profiles WHERE source = 'site' AND ref = ?").get(ref))?.data, {}), m = sp.payment?.method, so = await db.prepare('SELECT fulfillment, branch FROM site_orders WHERE id = ?').get(Number(ref));
        const decision = sitePaymentChoice(m, payment, b.paymentOverride, manual);
        if (decision.error) fail(409, decision.error);
        if (decision.override) paymentOverride = { ...decision.override, by: me.name, employeeId: me.id, at: now };
        const siteBranch = apexBranchOf(so?.branch);
        if (so?.branch && siteBranch && siteBranch !== Number(b.branchNo)) fail(409, 'الأوردر على الموقع متحوّل لفرع ' + so.branch + ' — غيّر الفرع هنا أو على الموقع الأول');
      }
      // Trust the on-premises APEX note snapshot, never client-submitted discount numbers.
      const noteRecord = await db.prepare('SELECT cust_no, note, status, phone_hash, checked_at FROM apex_customer_notes WHERE source = ? AND ref = ?').get(source, ref);
      const noteProfile = await db.prepare('SELECT data FROM match_profiles WHERE source = ? AND ref = ?').get(source, ref);
      const currentPhone = profilePhone(source, parseJson(noteProfile?.data, {}));
      if (!noteRecord || !currentPhone || noteRecord.phone_hash !== sha256(currentPhone)
        || noteRecord.status === 'error' || now - noteRecord.checked_at > 10 * 60000) {
        fail(409, 'ملاحظات بطاقة العميل على APEX لسه ما اتراجعتش — استنى القراءة من جهاز الكاشير');
      }
      const verifiedCardNote = parseApexCustomerNote(noteRecord.note);
      const clientCard = b.apexNote && typeof b.apexNote === 'object' ? b.apexNote : {};
      // Karim 09-11: a card-note discount never stops the transfer, and never passes unhandled. Staff answer it:
      // cash → the discount is taken on Apex; paid (the customer already paid Talabat) → a gift item worth about the
      // discount, or «تواصلت مع العميل»; unclear or more than one discount → «تواصلت مع العميل».
      const resolution = clientCard.resolution === 'gift' || clientCard.resolution === 'contacted' ? clientCard.resolution : null;
      const sameCard = String(clientCard.note || '') === verifiedCardNote.text && String(clientCard.custNo || '') === String(noteRecord.cust_no || '');
      const isAcknowledged = sameCard && (clientCard.approved === true || resolution === 'contacted');
      const money = verifiedCardNote.directives.filter(x => x.kind === 'percent' || x.kind === 'amount');
      const unclear = verifiedCardNote.unrecognized || money.length > 1;
      if (unclear && !(sameCard && resolution === 'contacted')) fail(409, 'ملاحظة بطاقة العميل مش واضحة — اقراها وعلّم على «قريتها»');
      if (verifiedCardNote.requiresReview && !isAcknowledged) fail(409, 'لازم تأكيد خصم وأصناف بطاقة العميل قبل تنفيذ الأوردر');
      const itemsBase = clean.reduce((sum, x) => sum + (Number(APEX_PRICES[x.itemNo]) || 0) * x.qty, 0);
      const discountWorth = money.length === 1 ? Math.round((money[0].kind === 'percent' ? itemsBase * money[0].value / 100 : money[0].value) * 100) / 100 : 0;
      const paidDiscount = payment === 'paid' && money.length > 0;
      if (paidDiscount && !unclear && !resolution) fail(409, 'الأوردر مدفوع: علّم على الهدية اللي العميل اختارها، أو «مفيش هدية المرة دي»');
      // The discount is taken on Apex only for a cash order with one clear discount.
      const takeDiscount = !unclear && !paidDiscount && resolution !== 'contacted';
      const notePercent = takeDiscount ? money.find(x => x.kind === 'percent')?.value || 0 : 0;
      const noteAmount = takeDiscount ? money.find(x => x.kind === 'amount')?.value || 0 : 0;
      const benefitDirectives = verifiedCardNote.directives.filter(x => x.kind === 'item');
      const benefitItems = Array.isArray(clientCard.items) ? clientCard.items : [];
      if (resolution !== 'contacted' && benefitDirectives.length !== benefitItems.length) fail(409, 'اختار كل الأصناف المستحقة وكمياتها');
      const noteItems = (resolution === 'contacted' ? [] : benefitItems).map(x => ({ itemNo: String(x?.itemNo || '').trim(), qty: Number(x?.qty), note: 'مستحق من ملاحظة العميل', free: true }));
      if (paidDiscount && resolution === 'gift') {
        // One gift or several (Karim 10-11), each with its count, up to about the discount.
        const asked = Array.isArray(clientCard.gifts) ? clientCard.gifts : clientCard.gift ? [{ itemNo: clientCard.gift.itemNo, qty: 1 }] : [];
        const gifts = asked.slice(0, 10).map(x => ({ itemNo: String(x?.itemNo || '').trim(), qty: Math.round(Number(x?.qty) || 0) }));
        if (!gifts.length || gifts.some(x => !APEX_NAMES[x.itemNo] || !(Number(APEX_PRICES[x.itemNo]) > 0) || x.qty < 1 || x.qty > 9)) fail(409, 'اختار أصناف الهدية من القائمة');
        const total = Math.round(gifts.reduce((sum, x) => sum + Number(APEX_PRICES[x.itemNo]) * x.qty, 0) * 100) / 100;
        if (total > discountWorth * 1.25 + 5) fail(409, 'مجموع الهدايا (' + total + ' ج) أكبر من قيمة الخصم (' + discountWorth + ' ج)');
        for (const x of gifts) noteItems.push({ itemNo: x.itemNo, qty: x.qty, note: 'هدية بدل خصم بطاقة العميل', free: true });
      }
      if (noteItems.some(x => !APEX_NAMES[x.itemNo] || !Number.isInteger(x.qty) || x.qty <= 0 || x.qty > 50))
        fail(409, 'كود الصنف المستحق أو كميته غير صحيح');
      if (clean.length + noteItems.length > 40) fail(409, 'إجمالي أصناف الأوردر أكبر من الحد');
      // Exact note snapshot + customer ID will be checked AGAIN inside the Apex transaction before clearing.
      const noteBenefit = verifiedCardNote.text ? {
        custNo: String(noteRecord.cust_no || ''), original: String(noteRecord.note || ''),
        oneTime: verifiedCardNote.oneTime && isAcknowledged && resolution !== 'contacted', percent: notePercent, resolution, worth: discountWorth,
        // A discount split over orders (Karim 09-11): after this one, the card says what is left for the next order.
        next: verifiedCardNote.next && resolution !== 'contacted' ? (() => {
          // Apex keeps the card note in char(250) (checked on the PC 10-11): a longer text would stop the writer, so it is
          // cut there — the discount sentence comes first when the card is rewritten for a split.
          const full = String(verifiedCardNote.next.note ?? verifiedCardNote.next.sentence ?? '').trim();
          if (full.length <= 250) return full;
          const first = verifiedCardNote.next.sentence || '';
          return (first + ' ' + full.replace(first, '')).replace(/\s+/g, ' ').trim().slice(0, 250);
        })() : null,
        amount: noteAmount, items: noteItems
      } : null;
      // Karim 10-11: the customer-card note is the call center's, not the kitchen's — it is not written in the order's
      // comment (which prints in the branch). What it gave shows on Apex by itself: the discount field, or the gift
      // lines named «هدية بدل خصم بطاقة العميل» / «مستحق من ملاحظة العميل».
      // Kitchen comments are compacted for both Talabat and website orders; a long comment
      // must never block an otherwise valid transfer.
      const sourceNote = source === 'site' ? parseJson((await db.prepare("SELECT data FROM match_profiles WHERE source='site' AND ref=?").get(ref))?.data,{}).payment?.note : '';
      const sourceBooking = deliveryNotes(sourceNote,row.scheduled_at);
      const booking = sourceBooking.appointment ? sourceBooking : deliveryNotes(b.note,row.scheduled_at);
      const safeRemarks = compactDeliveryComment(deliveryNotes(b.note,row.scheduled_at).note, 200);
      // Karim 11-11: a website pickup goes to the branch's «استلام فرع» area, with no address, floor or flat.
      let pickup = false;
      if (source === 'site') { const so = await db.prepare('SELECT fulfillment FROM site_orders WHERE id = ?').get(Number(ref)); pickup = so?.fulfillment === 'pickup'; }
      if (pickup && !PICKUP_AREAS[Number(b.branchNo)]) fail(400, 'اختار فرع Apex');
      const locationNo = pickup ? PICKUP_AREAS[Number(b.branchNo)].no : Number(b.locationNo);
      if (!Number.isInteger(locationNo) || locationNo < 1) fail(400, 'اختار منطقة العميل على Apex');
      // The area's own delivery charge on Apex (as the read-only monitor sent it), for an area nobody ordered to today.
      const daySnap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(dueDay))?.data, {});
      const areas = (Array.isArray(daySnap.locations) ? daySnap.locations : []).filter(l => l?.no === locationNo);
      // The area decides the branch, as on Apex (Karim 01-11: a Nasr City area was sent to Tagamoa).
      const owners = [...new Set(areas.map(l => l.branch).filter(x => x != null).map(Number))];
      if (owners.length && !owners.includes(branchNo)) {
        const names = new Map(APEX_BRANCHES.map(x => [Number(x.no), x.name]));
        fail(400, 'المنطقة دي تبع ' + owners.map(n => names.get(n) || ('فرع ' + n)).join(' / ') + ' — غيّر الفرع');
      }
      const area = areas.find(l => l.branch === branchNo) || areas.find(l => l.branch == null) || areas[0];
      const areaService = pickup ? 0 : Number.isFinite(Number(area?.service)) && area?.service !== null ? Number(area.service) : null;
      // The source's platform discount is a separate fact from any Apex price adjustment.
      // A stale browser or an empty sign must never erase a known Talabat discount.
      const sourceOrder = (await baseFor(dueDay, now)).list.find(o => o.source === source && String(o.ref) === ref) || null;
      const sourceDiscounts = sourceOrder?.discounts || [];
      // A discount Talabat does not say who pays for: the employee's split (read on Talabat), never a guess. Paid: all of it
      // comes off on Apex either way, so it counts as Talabat's for the special mark.
      const split = Array.isArray(b.discountSplit) ? b.discountSplit : [];
      let splitRest = 0, splitPlat = 0;
      sourceDiscounts.forEach((d, i) => {
        if (d.who && !d.unclear) return;
        const a = Number(d.amount) || 0, x = split[i], r = x && String(x.text) === String(d.text) ? Number(x.restaurant) : NaN;
        if (Number.isFinite(r) && r >= 0 && r <= a + 0.001) { splitRest += r; splitPlat += a - r; }
        else if (payment === 'paid' && a > 0) splitPlat += a;
        else fail(400, 'حدد الخصم على مين: «' + String(d.text || 'خصم').split('|')[0].trim() + '» — بص على طلبات «ممول من قبلك»');
      });
      const platformDiscount = Math.round((sourceDiscounts.filter(d => d.who === 'platform' && !d.unclear).reduce((sum, d) => sum + (Number(d.amount) || 0), 0) + splitPlat) * 100) / 100;
      const sourceRestaurantDiscount = sourceDiscounts.filter(d => d.who === 'restaurant' && !d.unclear).reduce((sum, d) => sum + (Number(d.amount) || 0), 0) + splitRest;
      // A Talabat order: the discounts are Talabat's bill on the server, even when it has none (never the browser's numbers).
      const fromSource = !!sourceOrder;
      const signBase = platformDiscount > 0 ? 'خصم طلبات ' + platformDiscount.toFixed(2) : fromSource ? '' : String(b.sign || '').slice(0, 120);
      const restaurantDiscount = fromSource || sourceDiscounts.length ? Math.round((sourceRestaurantDiscount + (payment === 'paid' ? platformDiscount : 0)) * 100) / 100 : Math.max(0, Number(b.restaurantDiscount) || 0);
      // What Apex must total, from Talabat's own bill on the server (never the browser's sum): cash = what the customer pays
      // + Talabat's whole share (known + the employee's split); paid = what the customer paid.
      const knownPlat = sourceDiscounts.filter(d => d.who === 'platform' && !d.unclear).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const serverTarget = Number(sourceOrder?.target) > 0
        ? Math.round((payment === 'paid' ? sourceOrder.target - knownPlat : sourceOrder.target + splitPlat) * 100) / 100 : null;
      const expectedTotal = Number(b.expectedTotal) || null, targetTotal = serverTarget ?? (Number(b.targetTotal) > 0 ? Math.round(Number(b.targetTotal) * 100) / 100 : null);
      const texts = [b.customer?.name, safeRemarks].filter(Boolean);
      const arabic = app.toArabic ? await app.toArabic(texts, { wait: true }) : new Map();
      const translatedName = arabic.get(b.customer?.name) || b.customer?.name;
      // What the employee wrote over the automatic Arabic is learned for next time (Karim 11-11).
      if (app.learnArabic) for (const [en, ar] of [[b.customer?.nameEn, b.customer?.name]]) if (en && ar) await app.learnArabic(en, ar).catch(() => {});
      const rawAddress = b.customer?.addressEdited === true ? b.customer.address : sourceOrder?.customer?.address || b.customer?.addressEn || b.customer?.address;
      const translatedAddress = app.toArabicAddress?.([rawAddress]).get(rawAddress) || rawAddress;
      const translatedNote = apexText(compactDeliveryComment(arabic.get(safeRemarks) || safeRemarks, 200));   // no «?» on Apex (11-14)
      const address = pickup ? { street: '', floor: '', flat: '' } : deliveryAddress(translatedAddress, [area?.name, sourceOrder?.customer?.talabatArea, sourceOrder?.customer?.siteArea, b.customer?.area]);
      const addressLine = splitDeliveryAddress(address.street), sign = deliveryMark(apexText(signBase), addressLine.extra);
      if (sign == null) fail(409, 'تكملة العنوان أكبر من مساحة العلامة المميزة — اختصر العنوان قبل التسجيل');
      const deliveryFields = { address: addressLine.main, floor: address.floor, flat: address.flat };
      // Karim 11-14 «الهاشتاج سعات مش بيتكتب في طلبات»: the hashtag is the server's own (the order's code from the Talabat
      // screens), not only what the page sent; a Talabat order is never written without it (the branch looks for it).
      const code = (String(b.code || '').replace(/[^\d]/g, '') || (source === 'talabat' ? String(sourceOrder?.code || (await db.prepare('SELECT code FROM talabat_orders WHERE id = ?').get(ref))?.code || '').replace(/[^\d]/g, '') : '') || (source === 'site' ? String(ref) : '')).slice(0, 10) || null;
      if (source === 'talabat' && !code) fail(409, 'هاشتاج طلبات لسه ماظهرش للأوردر ده — افتح الأوردر على شاشة لايف طلبات وثواني ويظهر، بعدين سجّله');
      const payload = { v: 1, source, ref, code, db: mode, branchNo, locationNo, payment, ...(paymentOverride ? { paymentOverride } : {}),
        label: deliveryLabel(translatedName, source, payment, code, booking.appointment), customer: { name: String(translatedName || '').slice(0, 80), phone: deliveryPhone(b.customer?.phone), address: pickup ? '' : String(b.customer?.address || '').slice(0, 360), ...deliveryFields }, ...(pickup ? { pickup: true } : {}),
        sign, platformDiscount, note: translatedNote, items: [...clean, ...noteItems], apexCustomerBenefit: noteBenefit,
        restaurantDiscount, expectedTotal, targetTotal, areaService, by: me.name, at: now };
      const queued = await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at, payload, result) VALUES (?,?,?,'auto_pending',?,?,?,?,?,?,NULL)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'auto_pending', employee_id = excluded.employee_id, employee_name = excluded.employee_name, payment = excluded.payment, note = excluded.note, at = excluded.at, payload = excluded.payload, result = NULL
        WHERE transfer_jobs.state IN ('released', 'auto_failed') OR (transfer_jobs.state = 'claimed' AND (transfer_jobs.employee_id IS excluded.employee_id OR transfer_jobs.at < ?))`)
        .run(source, ref, dueDay, me.id, me.name, payment, note, now, JSON.stringify(payload), now - CLAIM_MS);
      if (!queued.changes) fail(409, 'الأوردر بيتسجل بالفعل');
  }
  // The automatic transfer (11-11): the same checks and job as the page's button, as «المرصد آلي». Never over a claim.
  app.transferAutoJob = async (b, now) => {
    const me = { id: null, name: 'المرصد آلي', staff: false };
    const source = b.source, ref = String(b.ref);
    const row = source === 'talabat' ? await db.prepare('SELECT day FROM talabat_orders WHERE id = ?').get(ref) : await db.prepare('SELECT day, scheduled_at FROM site_orders WHERE id = ?').get(Number(ref));
    if (!row) fail(404, 'الأوردر مش موجود');
    const dueDay = orderDay(row);
    await assertNotAlreadyOnApex(source, ref, dueDay, now);
    const cur = await db.prepare('SELECT * FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
    if (cur && !(cur.state === 'claimed' && now - cur.at > CLAIM_MS)) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد'));
    const payment = ['cash', 'paid'].includes(b.payment) ? b.payment : null, note = b.note ? String(b.note).slice(0, 300) : null;
    await autoJob({ me, b, source, ref, row, cur, othersClaim: false, payment, note, now });
    S(dueDay).dirty = true;
    await app.audit('transfer_auto', null, { actor: me.name, source, ref, payment, branch: b.branchNo, location: b.locationNo, items: b.items, automatic: true }).catch(() => {});
    return { ok: true };
  };

  app.route('POST', '/api/transfer/job', async ctx => {
    const me = await who(ctx);
    const b = ctx.body, source = b.source === 'talabat' || b.source === 'site' ? b.source : null, ref = String(b.ref || '').slice(0, 40);
    if (!source || !/^\d{1,20}$/.test(ref)) fail(400, 'أوردر غير صحيح');
    const row = source === 'talabat' ? await db.prepare('SELECT day FROM talabat_orders WHERE id = ?').get(ref) : await db.prepare('SELECT day, scheduled_at FROM site_orders WHERE id = ?').get(Number(ref));
    if (!row) fail(404, 'الأوردر مش موجود');
    const dueDay = orderDay(row);
    if (['claim', 'entered', 'auto'].includes(b.action)) await assertNotAlreadyOnApex(source, ref, dueDay, ctx.now);
    const payment = ['cash', 'paid'].includes(b.payment) ? b.payment : null, note = b.note ? String(b.note).slice(0, 300) : null;
    const cur = await db.prepare('SELECT * FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
    // Whose order it is: the one who claimed it (10 minutes), entered it, or sent it to the writer. A failed or preview-only
    // automatic transfer belongs to nobody (Karim 01-11: #53 failed under one name and nobody else could mark it entered).
    const free = !cur || ['released', 'auto_failed', 'auto_preview'].includes(cur.state) || (cur.state === 'claimed' && ctx.now - cur.at > CLAIM_MS);
    const othersClaim = !free && cur.employee_id !== me.id;
    // Already on Apex or on its way there: nobody (the same employee included) sends or claims it again.
    if (cur && (/^auto_(?:sending|done)$/.test(cur.state) || (['auto_pending', 'auto_retry_pending'].includes(cur.state) && b.action !== 'release'))) fail(409, cur.state === 'auto_done' ? 'الأوردر اتسجل على Apex بالفعل (آلي)' : 'الأوردر بيتسجل على Apex دلوقتي');
    if (cur?.state === 'entered') fail(409, 'الأوردر اتسجل بالفعل — مستني تأكيد ظهوره على Apex');
    if (b.action === 'claim') {
      if (othersClaim) fail(409, (cur.employee_name || 'حد تاني') + (cur.state === 'entered' ? ' سجله بالفعل' : ' شغال عليه دلوقتي'));
      // Atomic: only one claim wins even if two employees press at the same moment.
      const r = await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at) VALUES (?,?,?,'claimed',?,?,?,?,?)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'claimed', employee_id = excluded.employee_id, employee_name = excluded.employee_name, at = excluded.at
        WHERE transfer_jobs.state IN ('released', 'auto_failed', 'auto_preview') OR (transfer_jobs.employee_id IS excluded.employee_id AND transfer_jobs.state = 'claimed') OR (transfer_jobs.state = 'claimed' AND transfer_jobs.at < ?)`)
        .run(source, ref, dueDay, me.id, me.name, payment, note, ctx.now, ctx.now - CLAIM_MS);
      if (!r.changes) fail(409, 'حد تاني لسه ماسكه');
    } else if (b.action === 'entered') {
      if (othersClaim) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد تاني'));
      if (!payment) fail(400, 'حدد: كاش ولا مدفوع');
      const branchNo = Number(b.branchNo), selectedLocation = Number(b.locationNo);
      if (!Number.isInteger(branchNo) || branchNo < 1 || branchNo > 99) fail(400, 'اختار فرع Apex');
      if (!Number.isInteger(selectedLocation) || selectedLocation < 1) fail(400, 'اختار منطقة العميل على Apex');
      const siteOrder = source === 'site' ? await db.prepare('SELECT fulfillment, branch FROM site_orders WHERE id = ?').get(Number(ref)) : null;
      const assignedBranch = apexBranchOf(siteOrder?.branch);
      if (assignedBranch && assignedBranch !== branchNo) fail(409, 'الأوردر على الموقع متحوّل لفرع تاني — غيّر الفرع قبل التأكيد');
      const pickup = siteOrder?.fulfillment === 'pickup';
      const locationNo = pickup ? PICKUP_AREAS[branchNo]?.no : selectedLocation;
      if (!locationNo) fail(400, 'اختار منطقة Apex الخاصة بالفرع');
      const daySnap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(dueDay))?.data, {});
      const areas = (Array.isArray(daySnap.locations) ? daySnap.locations : []).filter(l => Number(l?.no) === locationNo);
      const owners = [...new Set(areas.map(l => l.branch).filter(x => x != null).map(Number))];
      if (owners.length && !owners.includes(branchNo)) fail(400, 'المنطقة دي تبع فرع تاني على Apex — غيّر الفرع');
      const area = areas.find(l => Number(l.branch) === branchNo) || areas.find(l => l.branch == null) || areas[0];
      const areaService = pickup ? 0 : Number.isFinite(Number(area?.service)) && area?.service !== null ? Number(area.service) : null;
      if (!pickup && (!area || areaService == null)) fail(400, 'المنطقة مش موجودة أو سعر توصيلها مش ظاهر على Apex');
      const profile = parseJson((await db.prepare('SELECT data FROM match_profiles WHERE source = ? AND ref = ?').get(source, ref))?.data, {});
      const phone = source === 'talabat' ? (profile.phoneDisplay || profile.phone || profile.mobileDisplay || profile.mobile) : (profile.customer?.phoneDisplay || profile.customer?.phone || profile.customer?.mobileDisplay || profile.customer?.mobile);
      const address = source === 'talabat' ? profile.address : profile.customer?.address;
      const payload = JSON.stringify({ v: 1, source, ref, branchNo, locationNo, payment, areaService, ...(pickup ? { pickup: true } : {}),
        customer: { phone: deliveryPhone(phone), address: String(address || '').slice(0, 360) } });
      await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at, payload, result) VALUES (?,?,?,'entered',?,?,?,?,?,?,NULL)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'entered', employee_id = excluded.employee_id, employee_name = excluded.employee_name, payment = excluded.payment, note = excluded.note, at = excluded.at, payload = excluded.payload, result = NULL`)
        .run(source, ref, dueDay, me.id, me.name, payment, note, ctx.now, payload);
      // The employee's «سجلته على Apex» action is a confirmed area choice, so it must win over inferred mappings.
      if (!pickup) await learnTransferArea(source, ref, locationNo, true);
    } else if (b.action === 'release') {
      if (othersClaim) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد تاني'));
      await db.prepare("UPDATE transfer_jobs SET state = 'released', at = ? WHERE source = ? AND ref = ?").run(ctx.now, source, ref);
    } else if (b.action === 'auto') {
      await autoJob({ me, b, source, ref, row, cur, othersClaim, payment, note, now: ctx.now, manual: true });
    } else fail(400, 'invalid_action');
    await app.audit('transfer_' + b.action, me.staff ? me.id : null, { actor: me.name, source, ref, payment, ...(b.action === 'auto' ? { branch: b.branchNo, location: b.locationNo, items: b.items, customerName: b.customer?.name, address: b.customer?.address, note: b.note } : {}) });
    return { ok: true };
  });

  // ---- the Apex writer on the restaurant PC ----
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => v == null ? db.prepare('DELETE FROM settings WHERE key = ?').run(k) : db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const writer = async ctx => {
    // The writer runs on the cashier PC next to the monitor, so the monitor's own orders key also opens it.
    const given = ctx.header('x-apex-writer'), hashes = [await setting('apex_writer_token_hash'), await setting('orders_token_hash')].filter(Boolean);
    if (!given || !hashes.includes(sha256(given))) fail(401, 'مفتاح كاتب Apex غير صحيح');
  };
  app.apexWriterAuth = writer;
  const isCashierDbConnectionFailure = r => !r?.ok && r?.db == null && !r?.orderNo && /cannot connect to rest(?:aurant|urant)/i.test(String(r?.error || ''));
  // The on-premises read-only Apex login is the only source of customer-card notes.
  // Staff see these on the transfer page BEFORE they choose to submit an order.
  // Use the same Egypt mobile format that the transfer page displays and hashes.
  // Some source profiles store 1xxxxxxxxx while the displayed phone is 01xxxxxxxxx;
  // reading Apex with the short form then hashing the displayed form left the card
  // lookup unlinked, so the transfer page kept saying it was still waiting.
  const profilePhone = (source, p) => {
    const raw = source === 'talabat'
      ? (p.phoneDisplay || p.phone || p.mobileDisplay || p.mobile)
      : (p.customer?.phoneDisplay || p.customer?.phone || p.customer?.mobileDisplay || p.customer?.mobile);
    return deliveryPhone(phoneOut(deliveryPhone(raw)));
  };
  app.route('POST', '/api/apex-writer/customer-notes/pending', async ctx => {
    await writer(ctx);
    const day = businessDay(ctx.now), due = ctx.now - 5 * 60000, out = [];
    const sent = new Set((await db.prepare("SELECT source, ref FROM transfer_jobs WHERE day = ? AND state IN ('auto_pending', 'auto_sending', 'auto_done', 'entered')").all(day)).map(j => j.source + ':' + j.ref));
    for (const source of ['talabat', 'site']) {
      const orderTable = source === 'talabat' ? 'talabat_orders' : 'site_orders';
      const join = source === 'talabat' ? 'o.id = p.ref' : 'CAST(o.id AS TEXT) = p.ref';
      const terminal = source === 'talabat'
        ? "AND UPPER(COALESCE(o.status,'')) NOT IN ('CANCELLED','REJECTED','DELIVERED','COMPLETED','PICKED_UP','IN_DELIVERY')"
        : "AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelled','failed','wallet-failed','refunded','completed')";
      const dayFilter = source === 'site'
        ? "((o.scheduled_at IS NULL AND o.day = ?) OR (o.scheduled_at >= ? AND o.scheduled_at < ?))"
        : 'o.day = ?';
      const rows = await db.prepare(`SELECT p.ref, p.data, n.checked_at, n.phone_hash, o.day, ${source === 'site' ? 'o.scheduled_at' : 'NULL AS scheduled_at'} FROM ${orderTable} o
        JOIN match_profiles p ON p.source = ? AND ${join}
        LEFT JOIN apex_customer_notes n ON n.source = p.source AND n.ref = p.ref
        WHERE ${dayFilter} ${terminal} ORDER BY o.id DESC LIMIT 35`).all(...(source === 'site' ? [source, day, dayWindow(day).start, dayWindow(day).end] : [source, day]));
      for (const row of rows) {
        const phone = profilePhone(source, parseJson(row.data, {}));
        if (!phone || sent.has(source + ':' + row.ref)) continue;
        if (row.phone_hash === sha256(phone) && Number(row.checked_at) >= due) continue;
        out.push({ source, ref: row.ref, day: source === 'site' && row.scheduled_at ? businessDay(Number(row.scheduled_at)) : day, phone, last: row.phone_hash === sha256(phone) ? Number(row.checked_at) || 0 : 0 });
      }
    }
    // 11-11: Talabat's 35 always filled the 25 places, so a website order's card was never read again. Orders already
    // on their way to Apex are skipped; never read first, then the longest ago, whichever platform.
    // Merge the two platform queues by oldest card read. For equal timestamps (especially never-read cards where
    // last=0), alternate platforms; a plain stable sort kept Talabat first and could starve website orders forever.
    const queues = Object.fromEntries(['talabat', 'site'].map(source => [source, out.filter(x => x.source === source).sort((a, b) => a.last - b.last)]));
    const pending = [];
    let tie = 'talabat';
    while (pending.length < 25 && (queues.talabat.length || queues.site.length)) {
      const t = queues.talabat[0], s = queues.site[0];
      let source;
      if (!t) source = 'site';
      else if (!s) source = 'talabat';
      else if (t.last < s.last) source = 'talabat';
      else if (s.last < t.last) source = 'site';
      else { source = tie; tie = tie === 'talabat' ? 'site' : 'talabat'; }
      pending.push(queues[source].shift());
    }
    return { pending: pending.map(({ last, ...x }) => x) };
  });
  app.route('POST', '/api/apex-writer/customer-notes/result', async ctx => {
    await writer(ctx);
    const rows = Array.isArray(ctx.body.results) ? ctx.body.results.slice(0, 25) : [];
    let updated = 0;
    for (const x of rows) {
      const source = x.source === 'talabat' || x.source === 'site' ? x.source : null, ref = String(x.ref || '');
      if (!source || !/^\d{1,20}$/.test(ref)) continue;
      const profile = await db.prepare('SELECT data FROM match_profiles WHERE source = ? AND ref = ?').get(source, ref);
      if (!profile || profilePhone(source, parseJson(profile.data, {})) !== deliveryPhone(x.phone)) continue;
      const orderTable = source === 'talabat' ? 'talabat_orders' : 'site_orders', pk = source === 'talabat' ? 'id' : 'id';
      const dayRow = await db.prepare(`SELECT day${source === 'site' ? ', scheduled_at' : ''} FROM ${orderTable} WHERE ${pk} = ?`).get(source === 'talabat' ? ref : Number(ref));
      const effectiveDay = source === 'site' && dayRow?.scheduled_at ? businessDay(Number(dayRow.scheduled_at)) : dayRow?.day;
      if (!dayRow || effectiveDay !== x.day) continue;
      const status = x.status === 'found' && x.custNo ? 'found' : x.status === 'none' ? 'none' : 'error';
      const note = status === 'found' ? String(x.note || '').slice(0, 1000) : '';
      await db.prepare(`INSERT INTO apex_customer_notes(source,ref,day,phone_last4,phone_hash,cust_no,note,checked_at,status)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source,ref) DO UPDATE SET day=excluded.day,phone_last4=excluded.phone_last4,phone_hash=excluded.phone_hash,cust_no=excluded.cust_no,note=excluded.note,checked_at=excluded.checked_at,status=excluded.status`)
        .run(source, ref, effectiveDay, String(x.phone).slice(-4), sha256(deliveryPhone(x.phone)), status === 'found' ? String(x.custNo).slice(0, 30) : null, note, ctx.now, status);
      updated++;
    }
    return { updated };
  });
  app.route('GET', '/api/apex-writer', async ctx => {
    await app.requireAdmin(ctx);
    const jobs = await db.prepare("SELECT source, ref, state, employee_name, at, result FROM transfer_jobs WHERE state LIKE 'auto_%' ORDER BY at DESC LIMIT 50").all();
    return { mode: await setting('apex_bridge_mode') || 'shadow', linked: !!await setting('apex_writer_token_hash'), lastSeen: Number(await setting('apex_writer_seen')) || null,
      jobs: jobs.map(j => ({ source: j.source, ref: j.ref, state: j.state, by: j.employee_name, at: iso(j.at), result: parseJson(j.result, null) })) };
  });
  app.route('POST', '/api/apex-writer', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin'), b = ctx.body;
    if (b.action === 'token') { const token = 'apx_' + randomToken(24); await put('apex_writer_token_hash', sha256(token)); await app.audit('apex_writer_token', null, { actor: who.name }); return { token }; }
    if (b.action === 'mode') {
      if (!['off', 'shadow', 'test', 'live'].includes(b.mode)) fail(400, 'invalid_mode');
      if (b.mode === 'live' && String(b.confirm || '') !== 'LIVE') fail(400, 'التشغيل على قاعدة الإنتاج محتاج تأكيد');
      await put('apex_bridge_mode', b.mode); await app.audit('apex_bridge_mode', null, { actor: who.name, mode: b.mode });
      return { ok: true, mode: b.mode };
    }
    fail(400, 'invalid_action');
  });
  // The writer asks for the next order. A job stays «sending» until the writer answers; it is never handed out
  // twice (the writer also checks Apex for its own marker before writing, so a lost answer cannot double an order).
  let seenWritten = 0;
  app.route('POST', '/api/apex-writer/next', async ctx => {
    // The writer asks every few seconds: «seen» is written once a minute, not on every ask (fewer database writes).
    await writer(ctx); if (ctx.now - seenWritten > 60000) { seenWritten = ctx.now; await put('apex_writer_seen', ctx.now); }
    const mode = await setting('apex_bridge_mode') || 'shadow';
    if (mode === 'off') return { mode, job: null };
    const stuck = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_sending' ORDER BY at LIMIT 1").get();
    if (stuck) return { mode, job: { ...parseJson(stuck.payload, {}), resume: true } };   // finish (or confirm) the one in flight first
    const j = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_pending' ORDER BY at LIMIT 1").get();
    if (j) {
      if (!await sourceCanTransfer(db, j.source, j.ref)) {
        await db.prepare("UPDATE transfer_jobs SET state='auto_cancelled', result=? WHERE source=? AND ref=? AND state='auto_pending'").run(JSON.stringify({ok:false,error:'الأوردر اتلغى قبل الإرسال'}),j.source,j.ref);
        return {mode,job:null};
      }
      const job = parseJson(j.payload, {});
      if (job.db !== mode) { await db.prepare("UPDATE transfer_jobs SET state = 'auto_failed', result = ? WHERE source = ? AND ref = ?").run(JSON.stringify({ ok: false, error: 'وضع التحويل اتغير؛ ابعته تاني' }), j.source, j.ref); return { mode, job: null }; }
      const r = await handoffPending(db, j.source, j.ref, 'auto_pending', ctx.now);
      return { mode, job: r.changes ? job : null };
    }
    // A known pre-connection failure is safe to retry: no order could have been written.
    // The writer resumes through its marker check, so a lost response cannot duplicate an Apex order.
    const retry = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_retry_pending' AND at <= ? ORDER BY at LIMIT 1").get(ctx.now);
    if (retry) {
      if (!await sourceCanTransfer(db, retry.source, retry.ref)) {
        await db.prepare("UPDATE transfer_jobs SET state='auto_cancelled', result=? WHERE source=? AND ref=? AND state='auto_retry_pending'").run(JSON.stringify({ok:false,error:'الأوردر اتلغى قبل إعادة المحاولة'}),retry.source,retry.ref);
        return {mode,job:null};
      }
      const retryJob = parseJson(retry.payload, {});
      if (retryJob.db !== mode) { await db.prepare("UPDATE transfer_jobs SET state = 'auto_failed', result = ? WHERE source = ? AND ref = ?").run(JSON.stringify({ ok: false, error: 'وضع التحويل اتغير؛ ابعته تاني' }), retry.source, retry.ref); return { mode, job: null }; }
      const claimed = await handoffPending(db, retry.source, retry.ref, 'auto_retry_pending', ctx.now);
      if (claimed.changes) return { mode, job: { ...retryJob, resume: true } };
    }
    // Recover connection failures already shown to the team before this retry was deployed.
    // Reconcile against the latest Apex snapshot first; never resend an order that is already there.
    const failed = await db.prepare("SELECT source, ref, day, payload, result, at FROM transfer_jobs WHERE day = ? AND state = 'auto_failed' ORDER BY at LIMIT 20").all(businessDay(ctx.now));
    for (const f of failed) {
      const oldResult = parseJson(f.result, {});
      if (!isCashierDbConnectionFailure(oldResult) || Number(oldResult.retryCount) > 0) continue;
      try { await assertNotAlreadyOnApex(f.source, f.ref, f.day, ctx.now); } catch { continue; }
      const retryAt = ctx.now + 15000;
      const savedResult = { ...oldResult, retryCount: 1, retryAt };
      const queued = await db.prepare("UPDATE transfer_jobs SET state = 'auto_retry_pending', result = ?, at = ? WHERE source = ? AND ref = ? AND state = 'auto_failed' AND at = ?")
        .run(JSON.stringify(savedResult), retryAt, f.source, f.ref, f.at);
      if (queued.changes) return { mode, job: null };
    }
    return { mode, job: null };
  });
  // Admin: the orders the writer saved with a price difference, and the ones it could not save, for a period.
  // Apex's delivery charge taken off when Talabat delivered for free is how staff enter them too: shown, not counted.
  app.route('GET', '/api/transfer/price-diffs', async ctx => {
    await app.requireAdmin(ctx);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.to || '')) ? ctx.query.to : businessDay(ctx.now);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.from || '')) ? ctx.query.from : to;
    const rows = await db.prepare("SELECT source, ref, day, state, employee_name, payment, at, payload, result FROM transfer_jobs WHERE day BETWEEN ? AND ? AND state IN ('auto_done', 'auto_failed', 'auto_preview') ORDER BY at DESC LIMIT 500").all(from, to);
    const list = rows.map(r => {
      const p = parseJson(r.payload, {}), x = parseJson(r.result, {}) || {};
      const delivery = x.service != null ? Math.round(x.service * 1.14 * 100) / 100 : 0;
      // Karim 11-11: Apex prices are kept 5% above the website's on purpose — that part of a website order's gap is expected.
      const siteMarkup = r.source === 'site' && x.before ? Math.round(Math.max(0, x.before - delivery) * 0.06 / 1.06 * 100) / 100 : 0;
      const unexplained = Math.round(Math.max(0, (x.gap || 0) - Math.min(x.gap || 0, delivery) - siteMarkup) * 100) / 100;
      return { source: r.source, ref: r.ref, code: p.code || null, day: r.day, state: r.state, by: r.employee_name, at: iso(r.at), branchNo: p.branchNo, payment: r.payment,
        target: x.target ?? p.targetTotal ?? null, before: x.before, total: x.total, gap: x.gap || 0, short: x.short || 0, delivery, unexplained, error: x.error || null,
        apexNo: x.shiftSerial ?? null, items: (p.items || []).map(i => ({ no: i.itemNo, qty: i.qty, name: APEX_NAMES[i.itemNo] || null })) };
    }).filter(x => x.state !== 'auto_done' || x.unexplained > 1 || x.short > 1 || x.error);
    return { from, to, list };
  });

  // Karim 10-11 («ياريت تبعت كشف»): Talabat's price of each dish next to the Apex item staff put for it, from the
  // automatic transfers of the last days. Only orders with no discount at all (so the price is the menu price), each dish
  // with its add-ons: Talabat's line ÷ count vs the Apex lines for it ×1.14 ÷ count.
  app.route('GET', '/api/transfer/price-list', async ctx => {
    await app.requireAdmin(ctx);
    const days = Math.min(30, Math.max(1, Number(ctx.query.days) || 7)), to = businessDay(ctx.now);
    const from = new Date(Date.parse(to + 'T12:00:00Z') - (days - 1) * 86400000).toISOString().slice(0, 10);
    const rows = await db.prepare(`SELECT j.ref, j.day, j.payload, t.items, p.data FROM transfer_jobs j JOIN talabat_orders t ON t.id = j.ref
      LEFT JOIN match_profiles p ON p.source = 'talabat' AND p.ref = j.ref
      WHERE j.source = 'talabat' AND j.state = 'auto_done' AND j.day BETWEEN ? AND ? ORDER BY j.at DESC LIMIT 3000`).all(from, to);
    const groups = new Map();
    const isDisc = o => Number(o.price) < 0 || DISC_WORDS.test(o.name || '');
    const isWeight = o => WEIGHTS.some(w => w[0].test(wName(o.name)));
    for (const r of rows) {
      const bill = parseJson(r.data, {})?.bill || [];
      if (bill.some(x => DISC_WORDS.test((x.k || '') + ' ' + (x.text || '')))) continue;
      const items = parseJson(r.items, []), chosen = (parseJson(r.payload, {})?.items || []).filter(x => !x.free);
      if (items.some(x => (x.discountLines || []).length || (x.options || []).some(isDisc))) continue;
      let at = 0, ok = true;
      const lines = [];
      for (const x of items) {
        const addons = (x.options || []).filter(o => !isDisc(o) && !isWeight(o) && Number(o.price) > 0);
        const mine = chosen.slice(at, at + 1 + addons.length); at += 1 + addons.length;
        if (mine.length !== 1 + addons.length || x.price == null) { ok = false; break; }
        const qty = Number(x.qty) || 1, apex = mine.reduce((sum, c) => sum + (Number(APEX_PRICES[c.itemNo]) || 0) * (Number(c.qty) || 1), 0) * 1.14;
        const size = (x.options || []).find(isWeight)?.name;
        lines.push({ name: x.name + (size ? ' — ' + size : '') + (addons.length ? ' + ' + addons.map(o => o.name).join(' + ') : ''), apexNos: mine.map(c => c.itemNo).join('+'),
          talabat: Number(x.price) / qty, apex: apex / qty });
      }
      if (!ok || at !== chosen.length) continue;
      for (const l of lines) {
        const k = l.name + '|' + l.apexNos, g = groups.get(k) || { talabatName: l.name, apex: l.apexNos.split('+').map(no => APEX_NAMES[no] || no).join(' + '), apexNos: l.apexNos, talabat: [], apexPrice: [], days: new Set() };
        g.talabat.push(l.talabat); g.apexPrice.push(l.apex); g.days.add(r.day); groups.set(k, g);
      }
    }
    const mid = a => { const v = [...a].sort((x, y) => x - y); return Math.round(v[Math.floor(v.length / 2)] * 100) / 100; };
    const list = [...groups.values()].map(g => ({ talabatName: g.talabatName, apex: g.apex, apexNos: g.apexNos, orders: g.talabat.length,
      talabat: mid(g.talabat), apexPrice: mid(g.apexPrice), diff: Math.round((mid(g.apexPrice) - mid(g.talabat)) * 100) / 100 }))
      .sort((a, b) => Math.abs(b.diff) * b.orders - Math.abs(a.diff) * a.orders);
    return { from, to, orders: rows.length, list };
  });

  app.route('POST', '/api/apex-writer/result', async ctx => {
    await writer(ctx);
    const b = ctx.body, source = b.source === 'talabat' || b.source === 'site' ? b.source : null, ref = String(b.ref || '');
    if (!source || !/^\d{1,20}$/.test(ref)) fail(400, 'أوردر غير صحيح');
    const result = { ok: !!b.ok, preview: !!b.preview, db: ['shadow', 'test', 'live'].includes(b.db) ? b.db : null, orderNo: b.orderNo ?? null, shiftSerial: b.shiftSerial ?? null, branchOrderNo: b.branchOrderNo ?? null,
      total: Number(b.total) || null, error: b.error ? String(b.error).slice(0, 300) : null, detail: b.detail ? String(b.detail).slice(0, 1500) : null, at: ctx.now,
      // The price difference (Karim 01-11: the order is saved, admin sees the difference to fix the price or the item).
      gap: Number(b.gap) || 0, short: Number(b.short) || 0, before: Number(b.before) || null, service: Number.isFinite(Number(b.service)) ? Number(b.service) : null, target: Number(b.target) || null,
      cardDiscount: Number(b.cardDiscount) || 0, cardNoteCleared: b.cardNoteCleared === true };
    // A shadow preview writes nothing: the employee still enters the order by hand; the preview is kept for comparison.
    const previous = await db.prepare("SELECT result FROM transfer_jobs WHERE source = ? AND ref = ? AND state = 'auto_sending'").get(source, ref);
    const retryCount = Number(parseJson(previous?.result, {})?.retryCount) || 0;
    const canRetryConnection = isCashierDbConnectionFailure(result);
    const shouldRetry = canRetryConnection && retryCount < 2;
    const retryAt = shouldRetry ? ctx.now + (retryCount === 0 ? 15000 : 45000) : null;
    if (canRetryConnection) { result.retryCount = Math.min(2, retryCount + 1); if (retryAt) result.retryAt = retryAt; }
    const state = result.preview ? 'auto_preview' : result.ok ? 'auto_done' : shouldRetry ? 'auto_retry_pending' : 'auto_failed';
    const r = await db.prepare("UPDATE transfer_jobs SET state = ?, result = ?, at = ? WHERE source = ? AND ref = ? AND state = 'auto_sending'")
      .run(state, JSON.stringify(result), retryAt || ctx.now, source, ref);
    if (!r.changes) fail(409, 'الأوردر مش في حالة إرسال');
    if (state === 'auto_done') {
      // The durable result is already saved. Optional learning must never turn
      // an accepted Apex write into an HTTP failure reported by the cashier.
      const learnWork = (async () => {
        const job = await db.prepare('SELECT payload FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
        await learnSuccessfulTransfer(source, ref, parseJson(job?.payload, {}), ctx.now);
      })().catch(error => console.error('Transfer learning failed', error?.message));
      if (db.kind === 'd1') ctx.waitUntil(learnWork);
      else await learnWork;
    }
    if (state === 'auto_done' && result.db === 'live' && result.cardNoteCleared) {
      // The APEX transaction already cleared the exact one-off note; remove it from
      // the current transfer card, retaining the frozen job payload for order audit.
      const job = await db.prepare('SELECT payload FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
      const next = parseJson(job?.payload, {})?.apexCustomerBenefit?.next || '';
      await db.prepare("UPDATE apex_customer_notes SET note = ?, status = ?, checked_at = ? WHERE source = ? AND ref = ?")
        .run(next, next ? 'found' : 'consumed', ctx.now, source, ref);
    }
    await app.audit('apex_writer_result', null, { source, ref, ...result });
    // Karim 01-11 (#53 stayed «ماتسجلش» for 3 hours): a failed automatic transfer is told to the call center at once.
    if (state === 'auto_failed' && (result.db === 'live' || canRetryConnection)) {
      const job = await db.prepare('SELECT payload FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
      await transferAlert('transfer:failed:' + source + ':' + ref, parseJson(job?.payload, {}), source, ref, 'ماتسجلش على Apex — ' + plainError(result.error), ctx.now);
    }
    return { ok: true };
  });
}

export { setup, talabatPayment, talabatDiscounts, sitePayment, apexBranchOf };
