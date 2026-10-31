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

const TOKEN_MS = 12 * 3600000;
const CLAIM_MS = 10 * 60000;               // a claim left untouched for 10 minutes is free again
const TALABAT_DONE = new Set(['CANCELLED', 'REJECTED']);
const SITE_DONE = new Set(['cancelled', 'failed', 'wallet-failed', 'refunded']);

// Payment, from the source's own words only.
// Talabat shows «Payment method | Online» (or Cash) once its billing data is ready; the live card may show a
// payment badge earlier. Only those exact places count; anything else stays unknown for the employee to check.
function payWord(v) {
  const t = String(v || '').trim();
  const cash = /\bcash\b|كاش|نقد[اًي]?|الدفع عند الاستلام/i.test(t), paid = /\bonline\b|\bpaid\b|card|wallet|apple pay|مدفوع|بطاقة|محفظة|أونلاين/i.test(t);
  return cash && !paid ? 'cash' : paid && !cash ? 'paid' : null;
}
function talabatPayment(bill, liveBadge) {
  const line = (bill || []).find(x => /^(?:payment method|payment|طريقة الدفع)$/i.test(String(x.k || '').trim()));
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
      return stale ? null : { state: j.state, by: j.employee_name, mine: me.staff && j.employee_id === me.id, payment: j.payment, note: j.note, at: iso(j.at) };
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
      list.push({ source: 'talabat', ref: o.id, code: o.code || null, at: iso(o.accepted_at || o.received_at || o.placed_at), status: o.status, branch: o.store, deliveryType: o.delivery_type || null,
        customer: { name: p.name || null, phone: phoneOut(p.phone), address: p.address || null },
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
      list.push({ source: 'site', ref: String(o.id), code: String(o.id), at: iso(o.created_at), status: o.status, branch: o.branch || null, scheduled: !!o.scheduled,
        customer: { name: p.customer?.name || null, phone: phoneOut(p.customer?.phone || p.customer?.mobile), address: p.customer?.address || null },
        payment: sitePayment(pay), paymentTitle: pay?.title || null, note: pay?.note || null, discounts, fees: pay?.fees || [], shipping: pay?.shipping ?? null, total: o.total ?? null,
        items: (p.items || []).map(x => itemOut(x, false)), detailRead: !!p.items?.length,
        apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null, matching: sm.states?.get(o.id) || null, job: jobOf('site', String(o.id)) });
    }
    list.sort((x, y) => (x.apex ? 1 : 0) - (y.apex ? 1 : 0) || String(x.at || '').localeCompare(String(y.at || '')));
    const bridge = await db.prepare("SELECT value FROM settings WHERE key = 'apex_bridge_verified'").get();
    return { day, me: { name: me.name, staff: me.staff }, serverNow: iso(ctx.now), autoTransfer: bridge?.value === '1' ? 'ready' : 'off', orders: list };
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
    } else fail(400, 'invalid_action');
    await app.audit('transfer_' + b.action, me.staff ? me.id : null, { actor: me.name, source, ref, payment });
    return { ok: true };
  });
}

export { setup, talabatPayment, talabatDiscounts, sitePayment };
