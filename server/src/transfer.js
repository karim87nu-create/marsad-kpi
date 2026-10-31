// صفحة التحويل للفروع — a page for the call-center employees, separate from the admin page.
// It lists today's Talabat and website orders that still have to be entered on Apex, with what the employee
// writes there: the label next to the customer name («اطلب/كاش» or «مدفوع» + the hashtag), the items and
// add-ons with their known Apex items, the branch, address, phone, and the discounts split into the
// restaurant's (deducted) and the platform's (written in the special mark). Nothing is guessed: what the
// source does not say is shown as «مش واضح من المصدر» for the employee to check.
// The employee claims an order (so two people do not enter it twice) and marks it entered; the order then
// turns «في Apex» only when the monitor actually sees it on Apex. Automatic transfer to Apex stays off until
// the bridge is proven (numbering under live work and the branch delivery); this page never writes to Apex.
import { businessDay, iso, validDate } from './time.js';
import { parseJson } from './order-match.js';
import { knownNos } from './items.js';
import { sha256, randomToken } from './security.js';

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
  // Live order screen (Arabic, 2026-10-31): «التحصيل من العميل» = what the rider collects. Above zero means cash;
  // zero together with «ONLINE» / «تم الدفع بواسطة CREDIT_CARD» means paid. Both above zero and online = mixed → review.
  const collect = rows.find(x => /^(?:التحصيل من العميل|collect from customer|cash to collect|amount to collect)$/i.test(String(x.k || '').trim()));
  const online = rows.some(x => /\bONLINE\b|تم الدفع بواسطة|paid by|CREDIT_CARD|DEBIT_CARD|WALLET/i.test(String(x.text || '')));
  if (collect) {
    const due = amountOf(String(collect.text).split(' | ').slice(1).join(' '));
    if (due != null) { if (due > 0 && online) return 'mixed'; if (due > 0) return 'cash'; if (due === 0 && online) return 'paid'; }
  }
  const line = rows.find(x => /^(?:payment method|payment|طريقة الدفع)$/i.test(String(x.k || '').trim()));
  const fromBill = line ? payWord(String(line.text).split(' | ').slice(1).join(' | ')) : null;
  return fromBill || payWord(liveBadge) || null;
}
function sitePayment(p) {
  if (!p?.method) return null;
  if (p.method === 'cod') return 'cash';
  return p.paid ? 'paid' : 'unpaid';
}
// Discounts: whose money it is, only when the source says it.
const AMOUNT = /(-?\s*(?:E£|EGP|£E|ج\.م)?\s*-?\d[\d,]*(?:\.\d+)?)/;
function talabatDiscounts(bill) {
  const out = [];
  for (const x of bill || []) {
    const t = x.k + ' ' + x.text;
    if (!/discount|voucher|promo|coupon|خصم|قسيمة|كوبون/i.test(t)) continue;
    const m = String(x.text).match(AMOUNT), amount = m ? Math.abs(Number(m[1].replace(/[^\d.]/g, ''))) || null : null;
    const who = /(talabat|platform|طلبات)[\s-]*(funded|ممول)|funded by talabat|ممول من طلبات/i.test(t) ? 'platform'
      : /(vendor|restaurant|المطعم)[\s-]*(funded|ممول)|funded by (?:the )?(?:vendor|restaurant)|ممول من المطعم/i.test(t) ? 'restaurant' : null;
    out.push({ text: x.text, amount, who });
  }
  return out;
}

// Phones are kept as their last 10 digits for matching; shown as the employee dials them.
const phoneOut = p => p ? (/^1\d{9}$/.test(String(p)) ? '0' + p : String(p)) : null;

// Talabat option words for a weight → how Apex item names write it → how the page says it.
const WEIGHTS = [
  [/quarter|1\/4|ربع/i, /1\/4|ربع/, 'ربع كيلو'],
  [/third|1\/3|ثلث|تلت/i, /1\/3|ثلث|تلت/, 'تلت كيلو'],
  [/half|1\/2|نص|نصف/i, /1\/2|نص/, 'نص كيلو'],
];

// Apex branches (Branches table, read 2026-10-31): number → name, for the employee's branch choice.
const APEX_BRANCHES = [{ no: 1, name: 'التجمع' }, { no: 2, name: 'مدينة نصر' }, { no: 3, name: 'مدينتى' }];

// The Apex branch a Talabat store / website branch name points to (null when unclear: the employee picks).
function apexBranchOf(name) {
  const t = String(name || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
  const hits = [/التجمع/.test(t) && 1, /(مدينة نصر|سيتي ستار|مكرم)/.test(t) && 2, /مدينتي/.test(t) && 3].filter(Boolean);
  return hits.length === 1 ? hits[0] : null;
}

function setup(app) {
  const { db, fail } = app;
  // ---- sign-in with the employee's own PIN (the same one used for work), separate from the admin password ----
  app.route('POST', '/api/transfer/login', async ctx => {
    const pin = ctx.body.pin, key = 'transfer|' + ctx.ip;
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

  // ---- the queue ----
  app.route('GET', '/api/transfer/queue', async ctx => {
    const me = await who(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const snap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day))?.data, {});
    const apexName = new Map();
    for (const a of [...(snap.online || []), ...(snap.orders || [])]) for (const i of a.items || []) if (i?.no && i?.name) apexName.set(String(i.no).trim(), i.name);
    const learned = new Map();
    if (app.learn) for (const [n, m] of await app.learn.pairs('match-v2:item:talabat')) { const ok = new Map([...m].filter(([, c]) => c >= 2)); if (ok.size) learned.set(n, ok); }
    const jobs = new Map((await db.prepare('SELECT * FROM transfer_jobs WHERE day = ?').all(day)).map(j => [j.source + ':' + j.ref, j]));
    const jobOf = (source, ref) => {
      const j = jobs.get(source + ':' + ref);
      if (!j) return null;
      const stale = j.state === 'claimed' && ctx.now - j.at > CLAIM_MS;
      return stale ? null : { state: j.state, by: j.employee_name, mine: me.staff && j.employee_id === me.id, payment: j.payment, note: j.note, at: iso(j.at), result: parseJson(j.result, null) };
    };
    const itemOut = (x, withApex) => {
      let apex = (withApex ? knownNos(x.name, learned) : []).map(no => ({ no, name: apexName.get(no) || null }));
      // A size/weight chosen on Talabat («Quarter Kilo») narrows the Apex choices to that size, when their names say it.
      const size = WEIGHTS.find(w => (x.options || []).some(o => w[0].test(o.name)) || (x.modifiers || []).some(m => w[0].test(m)));
      const sized = size ? apex.filter(a => a.name && size[1].test(a.name)) : [];
      if (sized.length) apex = sized;
      return { qty: x.qty, name: x.name, price: x.price ?? null, modifiers: x.modifiers || [], modifiersComplete: x.modifierComplete === true || !withApex, size: size ? size[2] : null, apex };
    };
    const list = [];

    // Talabat
    const tm = app.talabat ? await app.talabat.matchDay(day) : { rows: [], matches: new Map(), states: new Map() };
    const tProfiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map(x => [x.ref, parseJson(x.data, {})]));
    for (const o of tm.rows) {
      if (TALABAT_DONE.has(o.status)) continue;
      const p = tProfiles.get(o.id) || {}, a = tm.matches.get(o.id), bill = p.bill || [];
      const discounts = talabatDiscounts(bill);
      list.push({ source: 'talabat', ref: o.id, code: o.code || null, at: iso(o.accepted_at || o.received_at || o.placed_at), status: o.status, out: TALABAT_OUT.has(String(o.status || '').toUpperCase()) || !!o.picked_up_at || !!o.delivered_at, branch: o.store, apexBranch: apexBranchOf(o.store), deliveryType: o.delivery_type || null,
        customer: { name: /^(?:information|details|customer|العميل)$/i.test(p.name || '') ? null : p.name || null, phone: phoneOut(p.phone), address: p.address || null },
        payment: talabatPayment(bill, p.livePay), bill, discounts, subtotal: o.subtotal ?? null, total: o.total ?? null,
        items: parseJson(o.items, []).map(x => itemOut(x, true)), detailRead: !!o.detail_at,
        apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null, matching: tm.states.get(o.id) || null, job: jobOf('talabat', o.id) });
    }

    // Website
    const sRows = await db.prepare('SELECT * FROM site_orders WHERE day = ?').all(day);
    const sm = app.site && sRows.length ? await app.site.apexMatch(day, sRows) : { matches: new Map(), states: new Map() };
    const sProfiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'site' AND ref IN (SELECT CAST(id AS TEXT) FROM site_orders WHERE day = ?)").all(day)).map(x => [x.ref, parseJson(x.data, {})]));
    for (const o of sRows) {
      if (SITE_DONE.has(o.status)) continue;
      const p = sProfiles.get(String(o.id)) || {}, pay = p.payment || null, a = sm.matches.get(o.id);
      const discounts = pay ? [...(pay.coupons || []).map(c => ({ text: 'كوبون ' + c.code, amount: c.amount, who: 'restaurant' })),
        ...(!pay.coupons?.length && pay.discount ? [{ text: 'خصم الموقع', amount: pay.discount, who: 'restaurant' }] : [])] : [];
      list.push({ source: 'site', ref: String(o.id), code: String(o.id), at: iso(o.created_at), status: o.status, out: !!o.out_at || !!o.delivered_at || o.status === 'completed', branch: o.branch || null, apexBranch: apexBranchOf(o.branch), scheduled: !!o.scheduled,
        customer: { name: p.customer?.name || null, phone: phoneOut(p.customer?.phone || p.customer?.mobile), address: p.customer?.address || null },
        payment: sitePayment(pay), paymentTitle: pay?.title || null, note: pay?.note || null, discounts, fees: pay?.fees || [], shipping: pay?.shipping ?? null, total: o.total ?? null,
        items: (p.items || []).map(x => itemOut(x, false)), detailRead: !!p.items?.length,
        apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null, matching: sm.states?.get(o.id) || null, job: jobOf('site', String(o.id)) });
    }
    list.sort((x, y) => (x.apex ? 1 : 0) - (y.apex ? 1 : 0) || String(x.at || '').localeCompare(String(y.at || '')));
    // Until an admin chooses, the automatic transfer only previews (shadow): it never writes to Apex.
    const mode = (await db.prepare("SELECT value FROM settings WHERE key = 'apex_bridge_mode'").get())?.value || 'shadow';
    const locations = (Array.isArray(snap.locations) ? snap.locations : []).filter(l => Number.isInteger(l?.no)).map(l => ({ no: l.no, name: String(l.name || ''), branch: l.branch ?? null, service: l.service ?? null }));
    return { day, me: { name: me.name, staff: me.staff }, serverNow: iso(ctx.now), autoTransfer: mode, branches: APEX_BRANCHES, locations, orders: list };
  });

  // ---- claim / entered / release ----
  app.route('POST', '/api/transfer/job', async ctx => {
    const me = await who(ctx);
    const b = ctx.body, source = b.source === 'talabat' || b.source === 'site' ? b.source : null, ref = String(b.ref || '').slice(0, 40);
    if (!source || !/^\d{1,20}$/.test(ref)) fail(400, 'أوردر غير صحيح');
    const row = source === 'talabat' ? await db.prepare('SELECT day FROM talabat_orders WHERE id = ?').get(ref) : await db.prepare('SELECT day FROM site_orders WHERE id = ?').get(Number(ref));
    if (!row) fail(404, 'الأوردر مش موجود');
    const payment = ['cash', 'paid'].includes(b.payment) ? b.payment : null, note = b.note ? String(b.note).slice(0, 300) : null;
    const cur = await db.prepare('SELECT * FROM transfer_jobs WHERE source = ? AND ref = ?').get(source, ref);
    const othersClaim = cur && cur.state !== 'released' && cur.employee_id !== me.id && !(cur.state === 'claimed' && ctx.now - cur.at > CLAIM_MS);
    if (b.action === 'claim') {
      if (othersClaim) fail(409, (cur.employee_name || 'حد تاني') + (cur.state === 'entered' ? ' سجله بالفعل' : ' شغال عليه دلوقتي'));
      // Atomic: only one claim wins even if two employees press at the same moment.
      const r = await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at) VALUES (?,?,?,'claimed',?,?,?,?,?)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'claimed', employee_id = excluded.employee_id, employee_name = excluded.employee_name, at = excluded.at
        WHERE transfer_jobs.state = 'released' OR transfer_jobs.employee_id IS excluded.employee_id OR (transfer_jobs.state = 'claimed' AND transfer_jobs.at < ?)`)
        .run(source, ref, row.day, me.id, me.name, payment, note, ctx.now, ctx.now - CLAIM_MS);
      if (!r.changes) fail(409, 'حد تاني لسه ماسكه');
    } else if (b.action === 'entered') {
      if (othersClaim) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد تاني'));
      if (!payment) fail(400, 'حدد: كاش ولا مدفوع');
      await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at) VALUES (?,?,?,'entered',?,?,?,?,?)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'entered', employee_id = excluded.employee_id, employee_name = excluded.employee_name, payment = excluded.payment, note = excluded.note, at = excluded.at`)
        .run(source, ref, row.day, me.id, me.name, payment, note, ctx.now);
    } else if (b.action === 'release') {
      if (othersClaim) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد تاني'));
      await db.prepare("UPDATE transfer_jobs SET state = 'released', at = ? WHERE source = ? AND ref = ?").run(ctx.now, source, ref);
    } else if (b.action === 'auto') {
      // Automatic transfer: the employee confirms the Apex items, branch and payment; the order is frozen
      // and handed to the Apex writer on the restaurant PC. Off until an admin turns it on (test first).
      const mode = await setting('apex_bridge_mode') || 'shadow';
      if (!['shadow', 'test', 'live'].includes(mode)) fail(409, 'التحويل الآلي مقفول — سجّل على Apex بإيدك');
      if (othersClaim) fail(409, 'الأوردر مع ' + (cur.employee_name || 'حد تاني'));
      if (cur && /^auto_(?:pending|sending|done|preview)$/.test(cur.state)) fail(409, 'الأوردر اتبعت للتحويل الآلي بالفعل');
      // Cash, or prepaid (Apex: Ledge with the amount on the customer's ledger, like every prepaid Talabat order there).
      if (payment !== 'cash' && payment !== 'paid') fail(400, 'حدد: كاش ولا مدفوع');
      const branchNo = Number(b.branchNo);
      if (!Number.isInteger(branchNo) || branchNo < 1 || branchNo > 99) fail(400, 'اختار فرع Apex');
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length || items.length > 40) fail(400, 'اختار أصناف Apex');
      const clean = items.map(x => ({ itemNo: String(x?.itemNo || '').trim(), qty: Number(x?.qty), note: x?.note ? String(x.note).slice(0, 60) : '' }));
      if (clean.some(x => !/^\d{4,10}$/.test(x.itemNo) || !(x.qty > 0 && x.qty <= 50))) fail(400, 'فيه صنف من غير رقم Apex أو كمية غلط');
      const locationNo = Number(b.locationNo);
      if (!Number.isInteger(locationNo) || locationNo < 1) fail(400, 'اختار منطقة العميل على Apex');
      const restaurantDiscount = Math.max(0, Number(b.restaurantDiscount) || 0), expectedTotal = Number(b.expectedTotal) || null;
      const payload = { v: 1, source, ref, code: String(b.code || '').replace(/[^\d]/g, '').slice(0, 10) || null, db: mode, branchNo, locationNo, payment,
        label: String(b.label || '').slice(0, 80), customer: { name: String(b.customer?.name || '').slice(0, 80), phone: String(b.customer?.phone || '').replace(/[^\d+]/g, '').slice(0, 15), address: String(b.customer?.address || '').slice(0, 200) },
        sign: String(b.sign || '').slice(0, 120), note: note || '', items: clean, restaurantDiscount, expectedTotal, by: me.name, at: ctx.now };
      await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at, payload, result) VALUES (?,?,?,'auto_pending',?,?,?,?,?,?,NULL)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'auto_pending', employee_id = excluded.employee_id, employee_name = excluded.employee_name, payment = excluded.payment, note = excluded.note, at = excluded.at, payload = excluded.payload, result = NULL`)
        .run(source, ref, row.day, me.id, me.name, payment, note, ctx.now, JSON.stringify(payload));
    } else fail(400, 'invalid_action');
    await app.audit('transfer_' + b.action, me.staff ? me.id : null, { actor: me.name, source, ref, payment });
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
  app.route('POST', '/api/apex-writer/next', async ctx => {
    await writer(ctx); await put('apex_writer_seen', ctx.now);
    const mode = await setting('apex_bridge_mode') || 'shadow';
    if (mode === 'off') return { mode, job: null };
    const stuck = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_sending' ORDER BY at LIMIT 1").get();
    if (stuck) return { mode, job: { ...parseJson(stuck.payload, {}), resume: true } };   // finish (or confirm) the one in flight first
    const j = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_pending' ORDER BY at LIMIT 1").get();
    if (!j) return { mode, job: null };
    const job = parseJson(j.payload, {});
    if (job.db !== mode) { await db.prepare("UPDATE transfer_jobs SET state = 'auto_failed', result = ? WHERE source = ? AND ref = ?").run(JSON.stringify({ ok: false, error: 'وضع التحويل اتغير؛ ابعته تاني' }), j.source, j.ref); return { mode, job: null }; }
    const r = await db.prepare("UPDATE transfer_jobs SET state = 'auto_sending', at = ? WHERE source = ? AND ref = ? AND state = 'auto_pending'").run(ctx.now, j.source, j.ref);
    return { mode, job: r.changes ? job : null };
  });
  app.route('POST', '/api/apex-writer/result', async ctx => {
    await writer(ctx);
    const b = ctx.body, source = b.source === 'talabat' || b.source === 'site' ? b.source : null, ref = String(b.ref || '');
    if (!source || !/^\d{1,20}$/.test(ref)) fail(400, 'أوردر غير صحيح');
    const result = { ok: !!b.ok, preview: !!b.preview, db: ['shadow', 'test', 'live'].includes(b.db) ? b.db : null, orderNo: b.orderNo ?? null, shiftSerial: b.shiftSerial ?? null, branchOrderNo: b.branchOrderNo ?? null,
      total: Number(b.total) || null, error: b.error ? String(b.error).slice(0, 300) : null, detail: b.detail ? String(b.detail).slice(0, 1500) : null, at: ctx.now };
    // A shadow preview writes nothing: the employee still enters the order by hand; the preview is kept for comparison.
    const state = result.preview ? 'auto_preview' : result.ok ? 'auto_done' : 'auto_failed';
    const r = await db.prepare("UPDATE transfer_jobs SET state = ?, result = ?, at = ? WHERE source = ? AND ref = ? AND state = 'auto_sending'")
      .run(state, JSON.stringify(result), ctx.now, source, ref);
    if (!r.changes) fail(409, 'الأوردر مش في حالة إرسال');
    await app.audit('apex_writer_result', null, { source, ref, ...result });
    return { ok: true };
  });
}

export { setup, talabatPayment, talabatDiscounts, sitePayment, apexBranchOf };
