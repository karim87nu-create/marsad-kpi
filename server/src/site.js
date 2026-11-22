import { TUNE } from './tune.js';
import { withDeliveryPlaces } from './delivery-fields.js';
import { wheelPrizeLabel } from './site-items.js';
import { referenceEvidence, siteReference } from './order-identifiers.js';
// الموقع (eldahan.com.eg): the server reads the WooCommerce orders and their notes with a read-only REST key, every
// minute, and keeps per order only the times the reports need (received, sent to the branch, out with the driver,
// delivered) plus the branch and driver names. Matching fields are stored separately for order reconciliation.
// The two reports («تقرير أداء الموقع للفروع» and «تقرير أداء الكول سنتر») are drawn from these rows on the admin page.
import { resolveOrders, customerOf, parseJson, fullerAddress } from './order-match.js';
import { businessDay, addDays, cairoToUtc, dayWindow, iso, validDate } from './time.js';
import { sha256Bytes, randomBytes, b64, fromB64 } from './security.js';

const SYNC_MS = 60000, FIRST_HOURS = 36, NOTES_PER_RUN = 30, OPEN_HOURS = 14;
const EXCLUDED = new Set(['cancelled', 'failed', 'wallet-failed']);
const PREP_MIN = 30, DELIVERY_MIN = 30, TRANSFER_MIN = 5;
const KINDS = ['sitePrep', 'siteTransfer'];

const westernDigits = value => String(value ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
function scheduledAtFrom(value, anchor = Date.now()) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value).trim())) {
    const n = Number(value); if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  }
  const text = westernDigits(typeof value === 'object' ? JSON.stringify(value) : value).replace(/[،]/g, ' ').trim();
  const exact = Date.parse(text);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(exact)) return exact;
  const months = new Map([['يناير',1],['فبراير',2],['مارس',3],['ابريل',4],['أبريل',4],['مايو',5],['يونيو',6],['يونيه',6],['يوليو',7],['أغسطس',8],['اغسطس',8],['سبتمبر',9],['أكتوبر',10],['اكتوبر',10],['نوفمبر',11],['ديسمبر',12]]);
  let y, m, d, hit = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (hit) [, y, m, d] = hit.map(Number);
  else if ((hit = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/))) { d = Number(hit[1]); m = Number(hit[2]); y = Number(hit[3]); }
  else if ((hit = text.match(/\b(\d{1,2})\s+([\u0600-\u06ff]+)\s+(20\d{2})\b/))) { d = Number(hit[1]); m = months.get(hit[2]); y = Number(hit[3]); }
  const withoutDate = hit ? text.replace(hit[0], ' ') : text;
  const tm = withoutDate.match(/(?:الساعة\s*|\b)(\d{1,2})(?:[:٫](\d{2}))\s*(صباح(?:اً|ا)?|مساء(?:اً|ا)?|ص|م|am|pm)?|الساعة\s*(\d{1,2})\s*(صباح(?:اً|ا)?|مساء(?:اً|ا)?|ص|م|am|pm)/i);
  let hour = tm ? Number(tm[1] || tm[4]) : 12, minute = tm?.[2] ? Number(tm[2]) : 0;
  const meridiem = String(tm?.[3] || tm?.[5] || '').toLowerCase();
  if (/(?:م|مساء|pm)/i.test(meridiem) && hour < 12) hour += 12;
  if (/(?:ص|صباح|am)/i.test(meridiem) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) { hour = 12; minute = 0; }
  if (!hit) {
    const baseDay = businessDay(anchor);
    const offset = /بعد\s*(?:بكرة|غد)/.test(text) ? 2 : /بكرة|غد(?:اً|ا)?/.test(text) ? 1 : /اليوم/.test(text) ? 0 : null;
    if (offset === null) return null;
    [y, m, d] = addDays(baseDay, offset).split('-').map(Number);
  }
  const day = y && m && d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '';
  if (!validDate(day)) return null;
  return cairoToUtc(y, m, d, hour, minute);
}
function scheduledOrderAt(order, anchor = Date.now()) {
  for (const key of ['scheduledAt','scheduled_at','scheduledFor','scheduled_for','scheduleAt','schedule_at','scheduleDate','schedule_date','deliveryAt','delivery_at','deliveryDate','delivery_date','deliveryTime','delivery_time','appointmentAt','appointment_at','dateForDelivery','date_for_delivery','موعد_التوصيل','موعد التوصيل']) {
    const at = scheduledAtFrom(order?.[key], anchor); if (at) return at;
  }
  for (const meta of order?.meta_data || []) if (/(?:schedule|appointment|delivery.*(?:date|time)|(?:date|time).*delivery|موعد|تاريخ.*توصيل)/i.test(String(meta?.key || ''))) {
    const at = scheduledAtFrom(meta?.value, anchor); if (at) return at;
  }
  // Karim 11-20 (receipt #31688 «T15 الموعد المطلوب: 2026-11-20…»): the central panel sends the appointment only inside the customer's
  // note, as «الموعد المطلوب: 2026-11-20T15:00» (Cairo time).
  const m = String(order?.customer?.note || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).match(/الموعد\s+المطلوب\s*[:：]?\s*(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})/);
  if (m) { const at = cairoToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]); if (Number.isFinite(at) && at > 0) return at; }
  return null;
}
function isScheduledOrder(order) {
  if (order?.scheduled === true || order?.isScheduled === true || order?.is_scheduled === true) return true;
  return (order?.meta_data || []).some(meta => /(?:schedule|appointment|موعد)/i.test(String(meta?.key || '')) && meta?.value !== false && meta?.value !== '');
}

// The rules of the daily reports, applied to the order notes (exact seconds).
function readNotes(notes) {
  const list = notes.map(n => ({ at: Date.parse(String(n.date_created_gmt || n.date_created || '').replace(/Z?$/, 'Z')), text: String(n.note || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter(n => Number.isFinite(n.at)).sort((a, b) => a.at - b.at);
  const first = f => list.find(f)?.at ?? null, last = f => [...list].reverse().find(f);
  const transferNote = last(n => n.text.includes('تم إرسال الطلب إلى')), outNote = last(n => n.text.includes('خرج الطلب للتوصيل'));
  const scheduledNote = last(n => n.text.includes('موعد التوصيل'));
  return {
    received: first(n => n.text.includes('to تم الاستلام') && !n.text.includes('من الفرع')),
    transfer: first(n => n.text.includes('تم إرسال الطلب إلى')),
    branch: transferNote?.text.match(/إلى (?:فرع )?(.*?) (?:من )?لوحة/)?.[1]?.trim() || null,
    out: first(n => n.text.includes('خرج الطلب للتوصيل')),
    driver: outNote?.text.match(/مع (.*?)\. وقت/)?.[1]?.trim() || null,
    delivered: first(n => /أكد المندوب تسليم|تم التوصيل/.test(n.text)),
    scheduled: !!scheduledNote,
    scheduledAt: scheduledNote ? scheduledAtFrom(scheduledNote.text, scheduledNote.at) : null,
    // Sent to more than one branch (moved between branches): how many different branches it went to.
    transfers: new Set(list.filter(n => n.text.includes('تم إرسال الطلب إلى')).map(n => n.text.match(/إلى (?:فرع )?(.*?) (?:من )?لوحة/)?.[1]?.trim() || n.text)).size,
  };
}

// Apex branch number (transfer page) → the website panel's branch key (its «الفرع المسؤول» list, 11-11).
// The delivery area the customer chose on the website (Karim 11-11 «المناطق معروفه»): the panel's own area field when
// it has one, else the address's last part («26 شارع أبو السعود، النزهة الجديدة» → النزهة الجديدة).
const textOf = v => typeof v === 'string' ? v : v && typeof v === 'object' ? String(v.name || v.title || v.label || v.nameAr || '') : '';
export function panelArea(o) {
  const c = o?.customer || {}, a = c.addressDetails || o?.address || {};
  for (const v of [c.area, c.zone, c.region, c.district, c.neighborhood, a.area, a.zone, a.region, a.district, o?.area, o?.zone, o?.deliveryArea, o?.deliveryZone, o?.shippingZone, o?.region]) {
    const t = textOf(v).trim(); if (t && t.length <= 80) return t;
  }
  const parts = String(c.address || '').split(/[،,;؛—|\n]/).map(x => x.trim()).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return last && last.length <= 60 && !/^[a-z]{0,4}[-/]?[0-9٠-٩۰-۹]+[a-z]?$/i.test(last) && !/^(?:الدور|الطابق|دور|الشقة|الشقه|شقة|شقه|floor|flat|apt|apartment|عمارة|عماره|مبنى|building|فيلا|villa|شارع|الشارع|الطريق|طريق|street|road|كمباوند|كمبوند|compound|بوابة|gate|علام[ةه] مميز[ةه]|landmark|directions|بجوار|بجانب|جنب|أمام|امام|خلف|ورا|عند|بالقرب|next to|near|behind|in front)(?=\s|[:：.]|$)/i.test(last) ? last : '';
}
function panelAddress(order) {
  const customer = order?.customer || {}, detail = customer.addressDetails || order?.address || {};
  const part = (...values) => values.map(v => typeof v === 'number' ? String(v) : textOf(v).trim()).find(Boolean) || '';
  const main = withDeliveryPlaces(part(customer.address, detail.formattedAddress, detail.address), {
    compound: part(detail.compound, detail.compoundName, customer.compound, customer.compoundName),
    mainStreet: part(detail.mainStreet, detail.mainStreetName, detail.mainRoad, customer.mainStreet, customer.mainStreetName, customer.mainRoad),
    street: part(detail.street, detail.streetName, customer.street, customer.streetName),
  });
  const moreStreet = part(detail.address2, detail.address_2, customer.address2);
  const fields = [
    ['مبنى', part(detail.building, detail.buildingNumber, customer.building, customer.buildingNumber)],
    ['الدور', part(detail.floor, detail.floorNumber, customer.floor, customer.floorNumber)],
    ['الشقة', part(detail.apartment, detail.apartmentNumber, detail.flat, detail.flatNumber, customer.apartment, customer.apartmentNumber, customer.flat, customer.flatNumber)],
    ['علامة مميزة', part(detail.landmark, detail.nearestLandmark, customer.landmark, customer.nearestLandmark)],
  ];
  const text = [main, moreStreet && !main.includes(moreStreet) ? moreStreet : ''].filter(Boolean).join('، ');
  return [text, ...fields.filter(([label, v]) => v && v !== '0' && !text.includes(label + ': ' + v)).map(([label, v]) => label + ': ' + v)].filter(Boolean).join(' — ');
}
const SITE_BRANCH_OF_APEX = { 1: 'tagamoa-cloud', 2: 'nasr-city', 3: 'madinaty-craft-zone' };
const APEX_BRANCH_LABELS = {
  'tagamoa-cloud': /^(?:فرع )?التجمع(?: |$)/,
  'nasr-city': /^(?:فرع )?مدين[ةه] نصر(?: |$)/,
  'madinaty-craft-zone': /^(?:فرع )?مدينتي(?: |$)/,
};
// Verified against the website's driver list. An Apex name can mean something different at another branch.
const SITE_DRIVER_NAMES = new Map([
  ['nasr-city', new Map([['رامي', 'رامي رمضان إبراهيم عبدالجليل']])],
  ['madinaty-craft-zone', new Map([['عمرو وعلي مدنتي', 'عمرو علي محمود احمد']])],
]);
const siteCancelled = (status, label) => /cancel|failed|refund/i.test(status) || /ملغ|اتلغ/.test(label);
const siteDelivered = (stage, status, label) => stage >= 4 || /(?:^|-)(?:complete|completed|delivered)$/i.test(status) || /تم التوصيل|تم التسليم/.test(label);

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => v == null ? db.prepare('DELETE FROM settings WHERE key = ?').run(k) : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const doFetch = app.config.siteFetch || ((...a) => fetch(...a));

  // Karim 10-11: the website's central panel (eldahan.com.eg/eldahan-operations-central) read by the extension from the
  // panel's own refresh — no request of ours ever reaches the website. Each push is what the panel showed: open orders
  // with customer, items, money, branch, driver and stage. Times the reports need are kept from the first push that saw
  // them (sent to a branch = the panel's own time; out / delivered = the first push at that stage).
  const num = v => {
    const text = westernDigits(v).replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069,٬]/g, '').replace(/٫/g, '.').replace(/−/g, '-');
    const m = text.match(/-?\s*\d+(?:\.\d+)?/);
    return m ? Number(m[0].replace(/\s/g, '')) : null;
  };
  async function dispatchFromApex(orders, now) {
    const open = orders.filter(o => Number.isSafeInteger(Number(o?.id)) && Number(o.id) > 0 && Number(o.createdAt) > 1e9 &&
      Object.hasOwn(APEX_BRANCH_LABELS, o.branchId) && /^delivery$/i.test(String(o.fulfillment || '').trim()) &&
      !textOf(o.driver).trim() && (Number(o.stage) || 0) < 3 &&
      !siteCancelled(o.status, o.statusLabel) && !siteDelivered(Number(o.stage), o.status, o.statusLabel));
    if (!open.length) return [];
    const day = businessDay(now);
    const snapshots = (await db.prepare('SELECT data FROM orders_days WHERE day IN (?, ?) AND received_at >= ?')
      .all(day, addDays(day, -1), now - 5 * 60000)).map(r => parseJson(r.data, {}));
    const cancelled = new Set(snapshots.flatMap(d => [...(d?.cancels || []), ...(d?.cancelNotes || [])]).map(a => String(a.no)));
    const apex = new Map(snapshots.flatMap(d => d?.online || []).filter(a => a.kind === 'الموقع').map(a => [String(a.no), a]));
    if (!apex.size) return [];
    const lateOut = new Map(snapshots.flatMap(d => d?.lateOut || []).filter(a => a.kind === 'الموقع').map(a => [String(a.no), a]));
    const names = app.apexNameMap ? await app.apexNameMap() : {};
    const dispatch = [], apexUses = new Map();
    for (let i = 0; i < open.length; i += 90) {
      const part = open.slice(i, i + 90), ids = part.map(o => Number(o.id)), qs = ids.map(() => '?').join(',');
      const manual = new Map((await db.prepare(`SELECT site_id, apex_no FROM site_links WHERE site_id IN (${qs})`).all(...ids))
        .map(r => [Number(r.site_id), r.apex_no]));
      const jobs = new Map((await db.prepare(`SELECT ref, state, payload, result FROM transfer_jobs WHERE source = 'site' AND ref IN (${qs})`).all(...ids.map(String)))
        .map(r => [Number(r.ref), r]));
      for (const o of part) {
        const id = Number(o.id), job = jobs.get(id), payload = parseJson(job?.payload, {}), result = parseJson(job?.result, {});
        const writerNo = job?.state === 'auto_done' && payload?.db === 'live' && (!result?.db || result.db === 'live') && !result?.preview &&
          SITE_BRANCH_OF_APEX[Number(payload.branchNo)] === o.branchId ? result?.orderNo : null;
        const hasManual = manual.has(id);
        const matches = [...apex.values()].filter(a => {
          if (!APEX_BRANCH_LABELS[o.branchId].test(String(a.branch || '').trim())) return false;
          if (hasManual) return String(a.no) === String(manual.get(id));
          const ref = referenceEvidence({ source: 'site', id }, a);
          if (ref.conflict) return false;
          if (writerNo != null) return String(a.no) === String(writerNo);
          return ref.exact || westernDigits(a.tag).trim().replace(/^#/, '') === String(id);
        });
        if (matches.length !== 1) continue;
        const [a] = matches, fallback = lateOut.get(String(a.no));
        const departure = fallback && APEX_BRANCH_LABELS[o.branchId].test(String(fallback.branch || '').trim()) ? fallback : null;
        const out = Date.parse(a.out || departure?.out), entered = Date.parse(a.at);
        const pilot = a.out && a.pilot ? a.pilot : departure?.pilot;
        const pilotName = String(names[pilot] || pilot || '').trim();
        const driver = SITE_DRIVER_NAMES.get(o.branchId)?.get(pilotName.replace(/\s+/g, ' ').replace(/ى/g, 'ي')) || pilotName;
        // The platform and Apex may display different wall-clock times. Validate their own chronology and the exact link.
        if (cancelled.has(String(a.no)) || !Number.isFinite(out) || out > now + 60000 ||
          out < Number(o.createdAt) * 1000 - 3 * 3600000 || (Number.isFinite(entered) && out < entered) ||
          !/\p{L}/u.test(driver) || driver.length > 80) continue;
        const apexNo = String(a.no);
        apexUses.set(apexNo, (apexUses.get(apexNo) || 0) + 1);
        dispatch.push({ orderId: id, driver, apexNo });
      }
    }
    return dispatch.filter(a => apexUses.get(a.apexNo) === 1).map(({ orderId, driver }) => ({ orderId, driver }));
  }

  async function writeBatches(writes) {
    for (let i = 0; i < writes.length; i += 40) await db.batch(writes.slice(i, i + 40));
  }

  async function savePanel(list, board, now) {
    const writes = [];
    // The board can contain 300 orders and is resent every minute. Read saved order + profile state together, in bounded
    // groups; the D1 primary key on (source, ref) makes each profile lookup a point read.
    const ids = [...new Set(list.map(o => Number(o?.id)).filter(n => Number.isInteger(n) && n > 0))];
    const olds = new Map(), profs = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90), qs = part.map(() => '?').join(',');
      for (const r of await db.prepare(`SELECT s.*, p.data AS profile_data FROM site_orders s LEFT JOIN match_profiles p ON p.source = 'site' AND p.ref = CAST(s.id AS TEXT) WHERE s.id IN (${qs})`).all(...part)) {
        olds.set(Number(r.id), r);
        if (r.profile_data != null) profs.set(String(r.id), r.profile_data);
      }
    }
    for (const o of list) {
      const id = Number(o?.id); if (!Number.isInteger(id) || id <= 0) continue;
      const created = Number(o.createdAt) > 1e9 ? Number(o.createdAt) * 1000 : null; if (!created) continue;
      const stage = Number(o.stage) || 0, status = String(o.status || '').slice(0, 40), label = String(o.statusLabel || '');
      const cancelled = siteCancelled(status, label);
      const done = !cancelled && siteDelivered(stage, status, label);
      const old = olds.get(id) || null;
      const assigned = Number(o.branchAssignedAt) > 1e9 ? Number(o.branchAssignedAt) * 1000 : null;
      const scheduledAt = scheduledOrderAt(o, created) || old?.scheduled_at || null;
      const scheduled = isScheduledOrder(o) || !!scheduledAt || !!old?.scheduled ? 1 : 0;
      const driver = textOf(o.driver).trim().slice(0, 80) || null;
      const outAt = old?.out_at || (stage >= 3 || driver ? now : null), deliveredAt = old?.delivered_at || (done ? now : null);
      const previousProfile = parseJson(profs.get(String(id)), {});
      const f = o.financial || {}, rows = Array.isArray(f.rows) ? f.rows : [];
      const onlinePaid = num(f.onlinePaid) || 0, due = num(f.due) ?? num(o.total) ?? 0;
      // The panel's own payment words decide (11-11, live: «الدفع أون لاين - Visa / Card» with nothing paid yet and
      // «متبقي للدفع أونلاين» is an online order whose payment is not complete — never cash). «المحفظة + الباقي كاش» = cash
      // (the wallet is a discount line). Paid = online with nothing left to pay; part paid online = mixed (by hand).
      const payText = String(o.paymentMethod || '') + ' ' + String(f.dueLabel || '');
      const saysOnline = /أون\s*لاين|أونلاين|اونلاين|online|visa|card|فيزا|بطاقة|instapay|انستاباي|محفظة إلكترونية|vodafone|فودافون/i.test(String(o.paymentMethod || ''));
      const saysCash = /كاش|نقد|cash|عند الاستلام/i.test(String(o.paymentMethod || ''));
      const method = onlinePaid > 0.01 && due > 0.01 ? 'mixed'
        : onlinePaid > 0.01 ? 'online'
        : saysOnline && !saysCash ? (due <= 0.01 && !/متبقي/.test(payText) ? 'online' : 'online-unpaid')
        : saysCash && !saysOnline ? 'cod' : 'unknown';
      const shipping = rows.filter(r => /توصيل|delivery|shipping/i.test(r?.label || '') && num(r.amount) > 0).reduce((a, r) => a + num(r.amount), 0);
      const minus = rows.filter(r => (num(r?.amount) || 0) < 0);
      const panelPay = { method, title: String(o.paymentMethod || '').slice(0, 120) || null, dueLabel: String(f.dueLabel || '').slice(0, 60) || null, paid: method === 'online', onlinePaid, due,
        discount: minus.length ? Math.abs(minus.reduce((a, r) => a + num(r.amount), 0)) : 0, discountLines: minus.map(r => ({ text: String(r.label || '').slice(0, 80), amount: Math.abs(num(r.amount)) })),
        shipping: shipping || null, total: num(o.total), coupons: [], fees: [], note: String(o.customer?.note || '').slice(0, 500) || null };
      const pay = Array.isArray(f.rows) || !previousProfile.payment ? panelPay : previousProfile.payment;
      const items = (Array.isArray(o.items) ? o.items : []).slice(0, 80).map(x => {
        const details = Array.isArray(x?.details) ? x.details : [], price = num(x?.total);
        const gift = price === 0 && details.some(d => wheelPrizeLabel(d?.label));
        const choices = details.filter(d => !wheelPrizeLabel(d?.label)).slice(0, 20);
        return { name: String(x?.name || '').slice(0, 160), qty: Number(x?.quantity) || 0, price: price ?? 0, ...(gift ? { wheelPrize: true } : {}),
          ...(x?.addon ? { parent: String(x.parent || '').slice(0, 160) } : {}),
          modifiers: choices.map(d => (String(d?.label || '').slice(0, 60) + ': ' + String(d?.value || '').replace(/<[^>]*>/g, '').slice(0, 120)).trim()),
          // The weight picks the Apex item; the other choices become notes.
          options: choices.map(d => {
            const label = String(d?.label || '').trim(), value = String(d?.value || '').replace(/<[^>]*>/g, '').trim();
            return { name: (/^(?:الوزن|الحجم|الكمية|weight|size)$/i.test(label) ? value : (label ? label + ': ' : '') + value).slice(0, 160), price: 0 };
          }).filter(v => v.name) };
      });
      const c = o.customer || {}, customer = customerOf({ name: String(c.name || '').slice(0, 120), phone: String(c.phone || '').slice(0, 30), address: panelAddress(o), area: panelArea(o) });
      const oldCustomer = previousProfile.customer || {};
      const delivery = { ...oldCustomer, ...Object.fromEntries(Object.entries(customer).filter(([, v]) => v)) };
      delivery.address = fullerAddress(oldCustomer.address, customer.address);
      const profile = { customer: delivery, items, payment: pay, panel: { number: String(o.number || id), stage, status, label, branchId: String(o.branchId || '').slice(0, 40) || null, fulfillment: String(o.fulfillment || '').slice(0, 20) || null } };
      const pj = JSON.stringify(profile);
      const profileChanged = profs.get(String(id)) !== pj;
      if (profileChanged) writes.push(db.prepare("INSERT INTO match_profiles (source, ref, data) VALUES ('site', ?, ?) ON CONFLICT(source, ref) DO UPDATE SET data = excluded.data").bind(String(id), pj));
      const day = businessDay(created), nextStatus = cancelled ? 'cancelled' : done ? 'completed' : status || 'processing';
      const fulfillment = String(o.fulfillment || '') || null, total = num(o.total), modified = Number(o.lastActionAt) > 1e9 ? Number(o.lastActionAt) * 1000 : (old?.modified_at ?? now);
      const branch = String(o.branchName || '').slice(0, 60) || null;
      const transfers = old?.branch && branch && old.branch !== branch ? (old.transfers || 1) + 1 : (assigned ? 1 : 0);
      const orderChanged = !old || old.day !== day || old.status !== nextStatus || old.fulfillment !== fulfillment || old.total !== total || old.modified_at !== modified ||
        old.received_at == null || (assigned != null && old.transfer_at == null) || (branch != null && old.branch !== branch) || old.out_at !== outAt || old.driver !== driver ||
        old.delivered_at !== deliveredAt || Number(old.scheduled || 0) !== scheduled || Number(old.scheduled_at || 0) !== Number(scheduledAt || 0) || Number(old.transfers || 0) !== Number(transfers || 0);
      if (profileChanged || orderChanged) writes.push(db.prepare(`INSERT INTO site_orders (id, day, status, fulfillment, total, created_at, modified_at, notes_at, received_at, transfer_at, branch, out_at, driver, delivered_at, scheduled, scheduled_at, transfers)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, fulfillment = excluded.fulfillment, total = excluded.total, modified_at = excluded.modified_at,
        notes_at = excluded.notes_at, received_at = COALESCE(site_orders.received_at, excluded.received_at), transfer_at = COALESCE(site_orders.transfer_at, excluded.transfer_at),
        branch = COALESCE(excluded.branch, site_orders.branch), out_at = COALESCE(site_orders.out_at, excluded.out_at), driver = COALESCE(excluded.driver, site_orders.driver),
        delivered_at = COALESCE(site_orders.delivered_at, excluded.delivered_at), scheduled = MAX(site_orders.scheduled, excluded.scheduled),
        scheduled_at = COALESCE(excluded.scheduled_at, site_orders.scheduled_at), transfers = MAX(site_orders.transfers, excluded.transfers)`)
        .bind(id, day, nextStatus, fulfillment, total, created, modified, now, created, assigned, branch, outAt, driver, deliveredAt, scheduled, scheduledAt, transfers));
    }
    // The central board lists every open order: one that was out with a driver and is gone from it was delivered.
    if (board === 'central' && list.length) {
      const seen = new Set(list.map(o => Number(o?.id)));
      // Karim 11-11 «بيتعامل ازاي مع اللاغي علي الموقع»: an order cancelled on the website mostly just leaves the central
      // board. Gone before it went out (no driver) for 3 minutes → cancelled: off the transfer page; if it is already on
      // Apex, the branch and the online group are told to void it there (once).
      // Drive all missing-order checks from the recent indexed order rows, joining profiles by their primary key.
      // The old IN(subquery) form scanned the full profile table on each minute's central-board refresh.
      const today = businessDay(now), window = dayWindow(today);
      const recent = await db.prepare("SELECT id, fulfillment, out_at, delivered_at, status, gone_at, branch, total, transfers, scheduled, scheduled_at FROM site_orders WHERE (created_at >= ? OR (scheduled_at >= ? AND scheduled_at < ?)) AND delivered_at IS NULL AND status NOT IN ('cancelled','failed','wallet-failed')")
        .all(now - 14 * 3600000, window.start, window.end);
      const recentProfiles = new Map(), recentIds = recent.map(r => Number(r.id)).filter(n => Number.isInteger(n) && n > 0);
      for (let i = 0; i < recentIds.length; i += 90) {
        const part = recentIds.slice(i, i + 90), qs = part.map(() => '?').join(',');
        for (const p of await db.prepare(`SELECT ref, data FROM match_profiles WHERE source = 'site' AND ref IN (${qs})`).all(...part.map(String))) recentProfiles.set(String(p.ref), parseJson(p.data, {}));
      }
      for (const r of recent) {
        if (seen.has(r.id)) { if (r.gone_at) writes.push(db.prepare('UPDATE site_orders SET gone_at = NULL WHERE id = ?').bind(r.id)); continue; }
        const panel = recentProfiles.get(String(r.id))?.panel || {};
        if ((r.fulfillment === 'pickup' && Number(panel.stage) >= 2) || r.out_at != null) {
          writes.push(db.prepare("UPDATE site_orders SET delivered_at = ?, status = 'completed' WHERE id = ? AND delivered_at IS NULL").bind(now, r.id)); continue;
        }
        if (r.status === 'completed' || (r.scheduled && (!r.scheduled_at || r.scheduled_at > now)) || panel.number == null) continue;
        if (!r.gone_at) { writes.push(db.prepare('UPDATE site_orders SET gone_at = ? WHERE id = ?').bind(now, r.id)); continue; }
        if (now - r.gone_at < 3 * 60000) continue;
        writes.push(db.prepare("UPDATE site_orders SET status = 'cancelled' WHERE id = ?").bind(r.id));
        await siteCancelledOnApex(r, now, writes);
      }
    }
    // An order the panel itself shows as cancelled, already on Apex: the same message.
    for (const o of list) {
      const id = Number(o?.id); if (!Number.isInteger(id)) continue;
      if (/cancel|failed|refund/i.test(String(o.status || '')) || /ملغ|اتلغ/.test(String(o.statusLabel || ''))) {
        const r = olds.get(id); if (r) await siteCancelledOnApex(r, now, writes);
      }
    }
    await writeBatches(writes);
    await put('site_panel_at', String(now));
  }

  app.route('POST', '/api/site/panel', async ctx => {
    await app.extensionAuth(ctx);
    const list = (Array.isArray(ctx.body?.orders) ? ctx.body.orders : []).slice(0, 300), now = ctx.now, board = ctx.body?.board;
    const canDispatch = board === 'branch' && ctx.body?.dispatchFromApex === true;
    const dispatch = canDispatch ? await dispatchFromApex(list, now) : [];
    // The branch already supplied the current order state. It can act on an exact Apex match
    // even if the write for reports has to wait until the next panel refresh.
    const save = savePanel(list, board, now);
    if (canDispatch && db.kind === 'd1') ctx.waitUntil(save.catch(e => console.error('Website branch snapshot failed', e?.message)));
    else await save;
    // Karim 11-11: «عايز الاوردر في الصفحه المركزيه برضو يتحول للفرع». An order the Marsad wrote on Apex and that is still
    // without a branch on the central panel: the extension picks that branch in the panel and presses «إرسال للفرع» itself
    // (the panel's own button, as an employee would). An order already sent to a branch is never changed.
    const assign = [];
    if (board === 'central') {
      const open = list.filter(o => Number.isInteger(Number(o?.id)) && !o.branchId && (Number(o.stage) || 0) < 3 && !/cancel|failed|refund/i.test(String(o.status || '')));
      if (open.length) {
        const ids = open.map(o => String(Number(o.id)));
        const jobs = await db.prepare(`SELECT ref, payload, result FROM transfer_jobs WHERE source = 'site' AND state = 'auto_done' AND ref IN (${ids.map(() => '?').join(',')})`).all(...ids);
        for (const j of jobs) {
          let p = {}, r = {}; try { p = JSON.parse(j.payload || '{}'); r = JSON.parse(j.result || '{}') || {}; } catch {}
          if (p.db !== 'live' || (r.db && r.db !== 'live')) continue;   // written on Apex's test copy: the real order is not on Apex
          const branchId = SITE_BRANCH_OF_APEX[Number(p.branchNo)];
          if (branchId) assign.push({ orderId: Number(j.ref), branchId });
        }
      }
    }
    return { ok: true, saved: canDispatch && db.kind === 'd1' ? null : list.length, assign, dispatch };
  }, { limit: 2 * 1024 * 1024 });   // 11-11: the day's board passed 256 KB at 19:42 and every push was refused

  // The key and secret are stored encrypted with the server secret (like the Telegram bot token).
  let aesKey = null;
  const aes = () => aesKey ??= crypto.subtle.importKey('raw', sha256Bytes('site:' + app.config.secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const seal = async text => { const iv = randomBytes(12); return b64(iv) + '.' + b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), new TextEncoder().encode(text)))); };
  const open = async sealed => { try { const [iv, data] = sealed.split('.').map(fromB64); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aes(), data)); } catch { return null; } };
  async function creds() {
    const raw = await setting('site_wc');
    if (!raw) return null;
    try { const c = JSON.parse(await open(raw)); return c?.key && c.secret ? c : null; } catch { return null; }
  }
  async function wc(c, path, params = {}, write = null) {
    const url = new URL(c.url.replace(/\/$/, '') + '/wp-json/wc/v3/' + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await doFetch(url.toString(), { method: write ? 'PUT' : 'GET', headers: { authorization: 'Basic ' + btoa(c.key + ':' + c.secret), accept: 'application/json', 'user-agent': 'MarsadEldahan/1.0', ...(write ? { 'content-type': 'application/json' } : {}) },
      ...(write ? { body: JSON.stringify(write) } : {}), signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    let body = null; try { body = JSON.parse(text); } catch {}
    if (!r.ok) throw Error('الموقع رد ' + r.status + (body?.message ? ': ' + String(body.message).slice(0, 120) : ''));
    if (body == null) throw Error('الموقع رد بحاجة مش JSON (ممكن الحماية قافلة الطلب)');
    return body;
  }

  // For «الأصناف الواقفة» (stock.js): the website's products, and a product's stock changed (admin's own button).
  app.siteWc = async (path, params) => { const c = await creds(); if (!c) throw Error('الموقع مش متربط'); return wc(c, path, params); };
  app.siteWcWrite = async (path, body) => { const c = await creds(); if (!c) throw Error('الموقع مش متربط'); return wc(c, path, {}, body); };

  // The rating the customer gave the order (meta written by the app's rating page): a number 1–5, alone or in an object
  // with its comment. Keys about asking / dismissing / snoozing the rating are not the rating.
  const metaSeen = new Set();
  function ratingOf(meta) {
    let rating = null, comment = null;
    for (const m of meta || []) {
      const k = String(m.key || ''), v = m.value;
      if (!/rating|review|feedback/i.test(k) || /dismiss|snooze|pending|ask|sent|notif|remind|due|count/i.test(k)) continue;
      if (v && typeof v === 'object') {
        const r = Number(v.rating ?? v.stars ?? v.rate ?? v.value), c = v.comment ?? v.review ?? v.note ?? v.text ?? v.feedback;
        if (r >= 1 && r <= 5) rating = Math.round(r); if (typeof c === 'string' && c.trim()) comment = c.trim().slice(0, 1000);
      } else if (/comment|note|text|feedback|review/i.test(k) && typeof v === 'string' && v.trim() && !/^\d(\.\d)?$/.test(v.trim())) comment = v.trim().slice(0, 1000);
      else if (Number(v) >= 1 && Number(v) <= 5) rating = Math.round(Number(v));
    }
    return rating == null && !comment ? null : { rating, comment };
  }
  // Reviews sent from the website's review form (WooCommerce product reviews), every 30 minutes.
  async function reviewsSync(c, now) {
    if (now - (Number(await setting('site_reviews_at')) || 0) < 30 * 60000) return;
    const after = new Date((Number(await setting('site_reviews_at')) || now - 3 * 86400000) - 3600000).toISOString().slice(0, 19);
    const list = await wc(c, 'products/reviews', { per_page: 100, after, orderby: 'date', order: 'asc' }).catch(() => null);
    if (Array.isArray(list)) {
      const w = [];
      for (const r of list) {
        const at = Date.parse(String(r.date_created_gmt || r.date_created) + (r.date_created_gmt ? 'Z' : '')); if (!Number.isFinite(at)) continue;
        const text = String(r.review || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
        const phone = String(r.reviewer_phone || '').replace(/\D/g, '').slice(-11) || null;
        w.push(db.prepare('INSERT INTO site_reviews (id, day, product, rating, review, reviewer, email, phone, order_id, at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, review = excluded.review')
          .bind(r.id, businessDay(at), String(r.product_name || r.product_id || '').slice(0, 120), Number(r.rating) || null, text, String(r.reviewer || '').slice(0, 80) || null, String(r.reviewer_email || '').slice(0, 120) || null, phone, null, at));
      }
      if (w.length) await db.batch(w);
    }
    await db.prepare("INSERT INTO settings (key, value) VALUES ('site_reviews_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(now));
    if (metaSeen.size) await db.prepare("INSERT INTO settings (key, value) VALUES ('site_rating_keys', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify([...metaSeen].slice(0, 40)));
  }

  // ---- one sync: orders changed since the last run, then notes for changed and still-open orders ----
  let running = false, current = null;
  // A manual sync (admin's button) waits for a background run in progress, then runs itself, so it is never skipped.
  async function syncNow(now) {
    for (let i = 0; i < 3 && current; i++) await current.catch(() => {});
    return sync(now);
  }
  function sync(now) {
    if (running) return Promise.resolve({ skipped: true });
    running = true;
    return (current = syncRun(now).finally(() => { running = false; current = null; }));
  }
  async function syncRun(now) {
    try {
      const c = await creds();
      if (!c) return { skipped: true };
      const last = Number(await setting('site_sync_at')) || (now - FIRST_HOURS * 3600000);
      const pending = parseJson(await setting('site_sync_cursor'), null);
      const after = pending?.after || new Date(last - 5 * 60000).toISOString().slice(0, 19);
      const until = pending?.until || new Date(now).toISOString().slice(0, 19);
      const startPage = pending?.page || 1;
      const changed = []; let nextPage = null;
      for (let page = startPage; page < startPage + 2; page++) {
        const list = await wc(c, 'orders', { per_page: 50, page, modified_after: after, modified_before: until, dates_are_gmt: 'true', orderby: 'modified', order: 'asc', _fields: 'id,status,total,date_created_gmt,date_modified_gmt,meta_data,billing,shipping,line_items,customer_id,created_via' });
        if (!Array.isArray(list)) throw Error('رد غير متوقع من الموقع');
        changed.push(...list);
        nextPage = list.length < 50 ? null : page + 1;
        if (nextPage === null) break;
      }
      const prior = new Map(), ids = [...new Set(changed.map(o => Number(o.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
      for (let i = 0; i < ids.length; i += 90) {
        const part = ids.slice(i, i + 90), qs = part.map(() => '?').join(',');
        const rows = await db.prepare(`SELECT s.id, s.modified_at, s.scheduled, s.scheduled_at, p.data
          FROM site_orders s LEFT JOIN match_profiles p ON p.source = 'site' AND p.ref = CAST(s.id AS TEXT)
          WHERE s.id IN (${qs})`).all(...part);
        for (const row of rows) prior.set(Number(row.id), row);
      }
      const upsert = [];
      for (const o of changed) {
        if (!Number.isSafeInteger(Number(o.id)) || Number(o.id) <= 0) continue;
        const ful = (o.meta_data || []).find(m => m.key === '_eldahan_app_fulfillment')?.value || null;
        // Karim 11-16: the customer's rating of the order (the app's rating page), kept with its comment.
        const rt = ratingOf(o.meta_data);
        if (rt) upsert.push(db.prepare('INSERT INTO site_ratings (order_id, rating, comment, at) VALUES (?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, at = excluded.at').bind(o.id, rt.rating, rt.comment, now));
        for (const m of o.meta_data || []) if (/rat|review|feedback/i.test(String(m.key || ''))) metaSeen.add(String(m.key).slice(0, 60));
        const created = Date.parse(String(o.date_created_gmt) + 'Z');
        if (!Number.isFinite(created)) continue;
        const modified = Date.parse(String(o.date_modified_gmt).replace(/Z?$/, 'Z')) || created;
        const saved = prior.get(Number(o.id));
        if (saved?.modified_at > modified) continue;
        const scheduledAt = scheduledOrderAt(o, created) || saved?.scheduled_at || null;
        const scheduled = isScheduledOrder(o) || !!scheduledAt || !!saved?.scheduled ? 1 : 0;
        const b = o.billing || {}, sh = o.shipping || {};
        const name = [sh.first_name || b.first_name, sh.last_name || b.last_name].filter(Boolean).join(' ');
        const address = sh.address_1 || sh.address_2 ? sh : b;
        const customer = customerOf({ name, phone: b.phone, mobile: sh.phone,
          address: [address.address_1, address.address_2, address.city].filter(Boolean).join('، ') });
        const items = Array.isArray(o.line_items) ? o.line_items.slice(0, 80).map(x => ({ name: String(x.name || '').slice(0, 160), qty: Number(x.quantity) || 0,
          price: (Number(x.total) || 0) + (Number(x.total_tax) || 0),
          ...(x.total != null && x.total !== '' && Number(x.total) === 0 && (Number(x.total_tax) || 0) === 0 &&
            (x.meta_data || []).some(m => wheelPrizeLabel(m?.key) || wheelPrizeLabel(m?.display_key)) ? { wheelPrize: true } : {}),
          // Add-ons/options the website stores on the line (hidden keys start with "_").
          modifiers: (Array.isArray(x.meta_data) ? x.meta_data : []).filter(m => m && !String(m.key || '').startsWith('_') && !wheelPrizeLabel(m.key) && !wheelPrizeLabel(m.display_key) && ['string', 'number'].includes(typeof (m.display_value ?? m.value)))
            .slice(0, 20).map(m => (String(m.display_key || m.key || '').slice(0, 60) + ': ' + String(m.display_value ?? m.value).replace(/<[^>]*>/g, '').slice(0, 120)).trim()) })) : [];
        const old = parseJson(saved?.data, {});
        // Payment and discounts exactly as the website order records them (no guessing).
        const money = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
        const withTax = (amount, tax) => money(amount) == null ? null : money(amount) + (money(tax) || 0);
        const pay = { method: String(o.payment_method || '').slice(0, 60) || null, title: String(o.payment_method_title || '').slice(0, 120) || null, paid: !!o.date_paid || !!o.date_paid_gmt,
          discount: money(o.discount_total), discountTax: money(o.discount_tax), shipping: money(o.shipping_total), total: money(o.total),
          coupons: Array.isArray(o.coupon_lines) ? o.coupon_lines.slice(0, 10).map(c => ({ code: String(c.code || '').slice(0, 60), amount: withTax(c.discount, c.discount_tax) })) : [],
          fees: Array.isArray(o.fee_lines) ? o.fee_lines.slice(0, 10).map(f => ({ name: String(f.name || '').slice(0, 80), amount: withTax(f.total, f.total_tax) })) : [],
          note: String(o.customer_note || '').slice(0, 500) || null };
        // The live board can give the payment split and the wallet rows for the same WooCommerce revision.
        const samePanelRevision = saved?.modified_at === modified && Array.isArray(old.payment?.discountLines);
        const profile = { ...old, customer: { ...(old.customer || {}) }, items: Array.isArray(o.line_items) ? items : old.items || [], payment: !samePanelRevision && ('payment_method' in o || 'discount_total' in o) ? pay : old.payment || null };
        for (const [k, v] of Object.entries(customer)) if (v) profile.customer[k] = k === 'address' ? fullerAddress(old.customer?.address, v) : v;
        upsert.push(db.prepare("INSERT INTO match_profiles (source, ref, data) SELECT 'site',?,? WHERE NOT EXISTS (SELECT 1 FROM site_orders WHERE id=? AND modified_at>?) ON CONFLICT(source, ref) DO UPDATE SET data = excluded.data").bind(String(o.id), JSON.stringify(profile),o.id,modified));
        // Karim 11-16 (orders by source: app / website): how WooCommerce says the order was made.
        if (o.created_via) upsert.push(db.prepare('INSERT INTO site_channels (id, via) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET via = excluded.via').bind(o.id, String(o.created_via).slice(0, 40)));
        upsert.push(db.prepare('INSERT INTO site_orders (id, day, status, fulfillment, total, created_at, modified_at, notes_at, scheduled, scheduled_at) VALUES (?,?,?,?,?,?,?,NULL,?,?) ON CONFLICT(id) DO UPDATE SET status = CASE WHEN site_orders.gone_at IS NOT NULL AND site_orders.status = \'cancelled\' THEN site_orders.status ELSE excluded.status END, fulfillment = excluded.fulfillment, total = excluded.total, modified_at = excluded.modified_at, notes_at = CASE WHEN excluded.modified_at > IFNULL(site_orders.modified_at, 0) THEN NULL ELSE site_orders.notes_at END, scheduled = MAX(site_orders.scheduled, excluded.scheduled), scheduled_at = COALESCE(excluded.scheduled_at, site_orders.scheduled_at) WHERE COALESCE(site_orders.modified_at,0) <= excluded.modified_at')
          .bind(o.id, businessDay(created), String(o.status), ful ? String(ful) : null, money(o.total), created, modified, scheduled, scheduledAt));
      }
      await writeBatches(upsert);
      // A bounded run is not a completed window. Resume its remaining pages after restart.
      if (nextPage !== null) await put('site_sync_cursor', JSON.stringify({ after, until, page: nextPage }));
      else {
        await db.batch([
          db.prepare("INSERT INTO settings (key, value) VALUES ('site_sync_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(Date.parse(until + 'Z'))),
          db.prepare("INSERT INTO settings (key, value) VALUES ('site_sync_cursor', 'null') ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(),
        ]);
      }
      // Notes: orders never read since they changed first, then open orders (their notes change without a status change).
      const due = await db.prepare(`SELECT id FROM site_orders WHERE status NOT IN ('cancelled','failed','wallet-failed') AND
        ((created_at >= ? AND (notes_at IS NULL OR (delivered_at IS NULL AND notes_at < ?))) OR (scheduled = 1 AND scheduled_at IS NULL AND (notes_at IS NULL OR notes_at < ?)))
        ORDER BY notes_at IS NOT NULL, notes_at, created_at LIMIT ?`).all(now - OPEN_HOURS * 3600000, now - 50000, now - 50000, NOTES_PER_RUN);
      const noteWrites = [];
      for (const { id } of due) {
        const notes = await wc(c, 'orders/' + id + '/notes', { per_page: 100, _fields: 'date_created_gmt,note' });
        const x = readNotes(Array.isArray(notes) ? notes : []);
        noteWrites.push(db.prepare(`UPDATE site_orders SET received_at = COALESCE(?, received_at),
          transfer_at = COALESCE(?, transfer_at), branch = COALESCE(?, branch), out_at = COALESCE(?, out_at),
          driver = COALESCE(?, driver), delivered_at = COALESCE(?, delivered_at), scheduled = MAX(scheduled, ?),
          scheduled_at = COALESCE(?, scheduled_at), transfers = MAX(COALESCE(transfers, 0), ?), notes_at = ?
          WHERE id = ? AND (notes_at IS NULL OR notes_at <= ?)`)
          .bind(x.received, x.transfer, x.branch, x.out, x.driver, x.delivered, x.scheduled ? 1 : 0, x.scheduledAt, x.transfers, now, id, now));
      }
      await writeBatches(noteWrites);
      await put('site_error', null);
      await reviewsSync(c, now).catch(() => {});
      await alerts(now);
      return { orders: changed.length, notes: due.length };
    } catch (e) {
      await put('site_error', String(e.message).slice(0, 300)); await put('site_error_at', now);
      return { error: e.message };
    }
  }

  // ---- alerts: prep over 30 min to the branches, transfer over 5 min to the call center's online group ----
  async function alerts(now) {
    const day = businessDay(now), window = dayWindow(day);
    const rows = await db.prepare(`SELECT * FROM site_orders WHERE status NOT IN ('cancelled','failed','wallet-failed') AND delivered_at IS NULL
      AND ((created_at >= ? AND scheduled = 0) OR (scheduled_at >= ? AND scheduled_at < ? AND scheduled_at <= ?))`)
      .all(now - OPEN_HOURS * 3600000, window.start, window.end, now);
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
    const list = [], clock = ms => new Date(ms).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    // Keep the linked Apex number, area and comments; Apex status summaries belong only in Apex messages.
    const det = app.apexDetails ? await app.apexDetails(day) : { extra: () => '' };
    let mt = new Map(); try { mt = (await apexMatch(day, rows, { teach: true })).matches; } catch {}
    const more = o => { const a = mt.get(o.id);
      return (o.total ? '\nقيمة الأوردر: ' + Math.round(o.total) + ' ج' : '') +
        (a ? '\nالمطابقة مع Apex مؤكدة' : '\nالمطابقة مع Apex غير مؤكدة') + (a ? det.extra(a.no) : ''); };
    const where = app.transferWhere ? await app.transferWhere('site', rows.filter(o => o.received_at && !o.transfer_at).map(o => o.id)) : () => '';
    for (const o of rows) {
      if (o.received_at && !o.transfer_at && now - o.received_at > TUNE.siteTransferMin * 60000)
        list.push({ key: 'site:transfer:' + o.id, kind: 'siteTransfer', target: 'online', text: '🌐 الموقع | ⏳ أوردر وصل على الموقع ولسه ماتحوّلش لأي فرع\nرقم أوردر الموقع: #' + o.id + '\nوصل الساعة ' + clock(o.received_at) + '، وبقاله ' + Math.round((now - o.received_at) / 60000) + ' دقيقة' + more(o) + where(o.id) });
      if (o.fulfillment === 'delivery' && o.transfer_at && !o.out_at && now - o.transfer_at > TUNE.sitePrepMin * 60000)
        list.push({ key: 'site:prep:' + o.id, kind: 'sitePrep', target: 'branches', branch: o.branch || null, text: '🌐 الموقع | 🟠 أوردر عدّى 30 دقيقة من التحويل ولسه ماخرجش للتوصيل\nالفرع: ' + (o.branch || 'غير معروف') + '\nرقم أوردر الموقع: #' + o.id + '\nاتحوّل للفرع الساعة ' + clock(o.transfer_at) + '، وبقاله ' + Math.round((now - o.transfer_at) / 60000) + ' دقيقة' + more(o) });
    }
    // Each warning is answered when the order moves on: transferred, out for delivery, delivered, or cancelled.
    const waiting = await db.prepare("SELECT l.key, l.kind, l.target, l.branch FROM telegram_log l WHERE (l.key LIKE 'site:transfer:%' OR l.key LIKE 'site:prep:%') AND l.created_at >= ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key)").all(now - 12 * 3600000);
    for (const w of waiting) {
      const o = await db.prepare('SELECT * FROM site_orders WHERE id = ?').get(Number(w.key.split(':')[2])); if (!o) continue;
      const mins = (a, b) => Math.round((b - a) / 60000);
      let text = null;
      if (EXCLUDED.has(o.status)) text = '🌐 الموقع | 🔄 أوردر الموقع #' + o.id + ' اتلغى على الموقع';
      else if (w.kind === 'siteTransfer' && o.transfer_at) text = '🌐 الموقع | ✅ أوردر الموقع #' + o.id + ' اتحوّل لـ ' + (o.branch || 'الفرع') + ' الساعة ' + clock(o.transfer_at) + (o.received_at ? ' (بعد ' + mins(o.received_at, o.transfer_at) + ' دقيقة من الاستلام)' : '');
      else if (w.kind === 'sitePrep' && o.out_at) text = '🌐 الموقع | ✅ أوردر الموقع #' + o.id + ' خرج للتوصيل الساعة ' + clock(o.out_at) + (o.transfer_at ? ' (بعد ' + mins(o.transfer_at, o.out_at) + ' دقيقة من التحويل)' : '') + (o.driver ? ' · ' + o.driver : '');
      else if (w.kind === 'sitePrep' && o.delivered_at) text = '🌐 الموقع | ⚠️ أوردر الموقع #' + o.id + ' اتقفل «تم التوصيل» الساعة ' + clock(o.delivered_at) + ' من غير «خروج للتوصيل» — محتاج مراجعة';
      if (text) list.push({ key: 'resolved:' + w.key, kind: w.kind, target: w.target, branch: w.branch, replyTo: w.key, text });
    }
    if (list.length) await db.batch(list.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch, reply_to) VALUES (?,?,?,?,?,?,?,?,?)').bind(a.key, a.kind, null, a.text, now, r[a.kind] === false && !a.replyTo ? now : null, a.target, a.branch || null, a.replyTo || null)));
  }

  let lastRun = 0;
  app.afterRequest(async now => {
    if (now - lastRun < SYNC_MS) return;
    lastRun = now;
    await sync(now);
  });

  async function siteCancelledOnApex(r, now, writes) {
    const j = await db.prepare("SELECT state, result FROM transfer_jobs WHERE source = 'site' AND ref = ? AND state IN ('auto_done', 'entered', 'auto_pending', 'auto_sending')").get(String(r.id));
    if (!j) return;
    let res = {}; try { res = JSON.parse(j.result || '{}'); } catch {}
    const p = await db.prepare("SELECT data FROM match_profiles WHERE source = 'site' AND ref = ?").get(String(r.id));
    let num = r.id; try { num = JSON.parse(p?.data || '{}').panel?.number || r.id; } catch {}
    const text = '🌐 الموقع | ❌ أوردر الموقع #' + num + ' اتلغى على الموقع وهو متسجل على Apex' + (res.shiftSerial != null ? ' (Apex ' + res.shiftSerial + ')' : '') +
      (r.branch ? '\nالفرع: ' + r.branch : '') + '\nالغوه على Apex وماتطلعوهوش';
    // The same «لاغي» edit as a Talabat cancel when the automatic cancel is on (not once it is with its pilot).
    if (j.state === 'auto_done' || j.state === 'entered') await app.siteCancelNote?.({ orderNo: res.orderNo, ref: r.id, code: num, sn: res.shiftSerial, branch: r.branch, out: !!r.out_at }, now).catch(() => 0);
    for (const [target, branch, suffix] of [['branches', r.branch || null, ''], ['online', null, ':online']])
      writes.push(db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch) VALUES (?, 'siteCancelled', NULL, ?, ?, NULL, ?, ?)").bind('site:cancel:' + r.id + suffix, text, now, target, branch));
  }

  // ---- admin: the key, the status, a manual sync ----
  app.route('GET', '/api/site', async ctx => {
    await app.requireAdmin(ctx);
    const c = await creds();
    const panelAt = Number(await setting('site_panel_at')) || null;
    return { linked: !!c || (panelAt && ctx.now - panelAt < 6 * 3600000), panelAt: iso(panelAt), url: c?.url || 'https://eldahan.com.eg', keyEnd: c ? c.key.slice(-4) : null, lastSync: iso(Number(await setting('site_sync_at')) || null),
      error: await setting('site_error'), errorAt: iso(Number(await setting('site_error_at')) || null), serverNow: iso(ctx.now) };
  });
  app.route('POST', '/api/site', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body;
    if (b.action === 'key') {
      const key = String(b.key || '').trim(), secret = String(b.secret || '').trim(), url = String(b.url || 'https://eldahan.com.eg').trim();
      if (!/^ck_[a-f0-9]{20,64}$/.test(key) || !/^cs_[a-f0-9]{20,64}$/.test(secret)) fail(400, 'المفتاح لازم يبدأ بـ ck_ والسر بـ cs_');
      if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) fail(400, 'invalid_url');
      const c = { url, key, secret };
      try { await wc(c, 'orders', { per_page: 1, _fields: 'id' }); } catch (e) { fail(400, 'المفتاح مش شغال: ' + e.message); }
      await put('site_wc', await seal(JSON.stringify(c))); await put('site_sync_at', null); await put('site_error', null);
      await app.audit('site_key_set', null, { actor: who.name, keyEnd: key.slice(-4) });
      return { ok: true, sync: await syncNow(ctx.now) };
    }
    if (b.action === 'sync') return { ok: true, sync: await syncNow(ctx.now) };
    if (b.action === 'unlink') { await put('site_wc', null); await app.audit('site_key_removed', null, { actor: who.name }); return { ok: true }; }
    fail(400, 'invalid_action');
  });

  // ---- each site order matched to its Apex order (the monitor's list of online orders): who entered it and when ----
  // Same day, entered on Apex between 2 minutes before the site received it and 90 minutes after; the closest in time to
  // the branch transfer wins, with the branch and the amount as tie-breakers. One Apex order per site order.
  const norm = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^(فرع|الدهان)\s*/g, '').trim();
  const sameBranch = (a, b) => { const x = norm(a), y = norm(b); if (!x || !y) return null; const fx = x.split(/[\s،,-]+/)[0], fy = y.split(/[\s،,-]+/)[0]; return x.includes(fy) || y.includes(fx); };
  async function apexMatch(day, rows, { teach = false } = {}) {
    const r = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
    let d = null; try { d = r ? JSON.parse(r.data) : null; } catch {}
    const apex = (d?.online || []).filter(a => a.kind === 'الموقع' && a.at).map(a => ({ ...a, t: Date.parse(a.at) }));
    const names = app.apexNameMap ? await app.apexNameMap() : {};
    const profiles = new Map(), ids = rows.map(o => Number(o.id)).filter(n => Number.isInteger(n) && n > 0);
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90), qs = part.map(() => '?').join(',');
      for (const x of await db.prepare(`SELECT ref, data FROM match_profiles WHERE source = 'site' AND ref IN (${qs})`).all(...part.map(String))) profiles.set(x.ref, parseJson(x.data, {}));
    }
    const manual = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90), qs = part.map(() => '?').join(',');
      for (const x of await db.prepare(`SELECT site_id, apex_no FROM site_links WHERE site_id IN (${qs})`).all(...part)) manual.set(x.site_id, x.apex_no);
    }
    const learned = app.learn ? await app.learn.pairs('match-v2:branch:site') : new Map();
    const branchOk = (s, b) => { const k = learned.get(s); return k && [...k.values()].reduce((x, y) => x + y, 0) >= 3 ? k.has(b) : sameBranch(s, b); };
    const decision = resolveOrders(rows.map(o => ({ ...o, source: 'site', anchor: o.scheduled_at || o.transfer_at || o.received_at || o.created_at,
      amount: o.total, ...profiles.get(String(o.id)), excluded: EXCLUDED.has(o.status) })), apex, { manual, branchOk, windowFor: () => 90 * 60000 });
    const matches = new Map();
    for (const [id, a] of decision.matches) {
      const how = decision.how.get(id), o = rows.find(o => o.id === id);

      matches.set(id, { no: a.no, sn: a.sn ?? null, at: iso(a.t), user: names[a.user] || a.user || null, amount: a.amount ?? null, branch: a.branch || null, how });
    }
    if (teach && app.learn) for (const o of rows) {
      const a = decision.matches.get(o.id), h = decision.how.get(o.id);
      const facts = a && h === 'code' && o.branch && a.branch ? [{ kind:'match-v2:branch:site',a:o.branch,b:a.branch,value:null }] : [];
      await app.learn.replace('site',String(o.id),facts);
    }
    return { matches, states: decision.states, apexCount: apex.length, unmatched: apex.filter(a => !decision.used.has(String(a.no))).map(a => ({ no: a.no, sn: a.sn ?? null, at: iso(a.t), branch: a.branch, user: names[a.user] || a.user, amount: a.amount })), hasList: Array.isArray(d?.online) };
  }
  app.site = { apexMatch };
  app.route('POST', '/api/site/link', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), id = Number(ctx.body.siteId);
    const no = ctx.body.apexNo == null || ctx.body.apexNo === '' ? null : String(ctx.body.apexNo);
    const o = await db.prepare('SELECT day FROM site_orders WHERE id = ?').get(id);
    if (!o) fail(404, 'الأوردر مش موجود');
    if (no != null && no !== 'none') {
      const snap = parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(o.day))?.data, {});
      if (!(snap.online || []).some(a => String(a.no) === no && a.kind === 'الموقع')) fail(400, 'أوردر Apex غير موجود في نفس اليوم والمصدر');
      if (await db.prepare('SELECT site_id FROM site_links WHERE day = ? AND apex_no = ? AND site_id != ?').get(o.day, no, id)) fail(409, 'أوردر Apex مربوط يدويًا بأوردر آخر');
    }
    const before = await db.prepare('SELECT apex_no, set_by, set_at FROM site_links WHERE site_id = ?').get(id);
    if (no === null) await db.prepare('DELETE FROM site_links WHERE site_id = ?').run(id);
    else await db.prepare('INSERT INTO site_links (site_id, day, apex_no, set_by, set_at) VALUES (?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET apex_no = excluded.apex_no, set_by = excluded.set_by, set_at = excluded.set_at').run(id, o.day, no === 'none' ? null : no, who.name, ctx.now);
    await apexMatch(o.day, await db.prepare('SELECT * FROM site_orders WHERE day = ?').all(o.day), { teach: true });
    await app.audit('site_link', null, { actor: who.name, siteId: id, apexNo: no, before: before || null, after: no, reason: String(ctx.body.reason || '').slice(0,500) || null });
    return { ok: true };
  });

  // ---- the day's rows for the two reports ----
  app.route('GET', '/api/site/day', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare('SELECT * FROM site_orders WHERE day = ? ORDER BY id').all(day);
    const m = await apexMatch(day, rows);
    return { day, apex: { linked: m.hasList, count: m.apexCount, unmatched: m.unmatched || [] }, linked: !!await creds() || (Number(await setting('site_panel_at')) || 0) > ctx.now - 6 * 3600000, lastSync: iso(Number(await setting('site_panel_at')) || Number(await setting('site_sync_at')) || null), error: await setting('site_error'), live: day === businessDay(ctx.now),
      orders: rows.map(o => ({ id: o.id, status: o.status, fulfillment: o.fulfillment, excluded: EXCLUDED.has(o.status), scheduled: !!o.scheduled, branch: o.branch, driver: o.driver,
        total: o.total, transfers: o.transfers || 0, apex: m.matches.get(o.id) || null, matching: m.states?.get(o.id) || null, createdAt: iso(o.created_at), receivedAt: iso(o.received_at), transferAt: iso(o.transfer_at), outAt: iso(o.out_at), deliveredAt: iso(o.delivered_at), notesRead: !!o.notes_at })),
      rules: { prep: TUNE.sitePrepMin, delivery: DELIVERY_MIN, transfer: TUNE.siteTransferMin }, serverNow: iso(ctx.now) };
  });
  app.siteSync = sync;
  // The transfer page's manual refresh asks for a fresh site snapshot without admin credentials.
  app.siteSyncNow = syncNow;
}

export { setup, readNotes, KINDS };
