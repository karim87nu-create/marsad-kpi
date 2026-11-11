// الأداء المترابط (Karim 11-11): every call, order and customer tied together by the customer's phone, and each
// employee's day against the shift a supervisor set for the week.
//  - جدول المواعيد: supervisors enter each employee's shift for the week (start–end, or off).
//  - التحويل لأوردر: an answered call whose number has a hotline order on Apex within 30 minutes after it.
//  - FCR: an answered call whose number does not call again within 24 hours.
//  - سرعة الرد: how long the customer waited on the calls the employee answered.
//  - فائتة كان ممكن يلحقها: a counted missed call while the employee was available, past the day's break allowance,
//    or away from the extension during the shift the supervisors set.
//  - الالتزام بالمواعيد: late start, early leave, absence, and the share of the shift the employee was working.
// Phones are compared as a short one-way key (the cashier PC sends the same key for Apex orders, never the number).
import { addDays, businessDay, validDate, iso, cairoToUtc, RULES } from './time.js';
import * as A from './arabicss.js';
import { sha256 } from './security.js';

const CONVERT_MS = 30 * 60000, REPEAT_MS = 24 * 3600000, LATE_GRACE_MIN = 5;
const r1 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
const pct = (a, b) => b ? r1(a / b * 100) : null;

// The same key on the cashier PC (marsad_monitor.ps1 PhKey): the last 10 digits of an Egyptian number.
export function phKey(raw) {
  let d = String(raw || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, '');
  if (d.startsWith('0020')) d = d.slice(4); else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 7) return null;
  return sha256('m1:' + d.slice(-10)).slice(0, 12);
}
// A week starts on Saturday.
export function weekStart(day) {
  const [y, m, d] = day.split('-').map(Number), wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -((wd + 1) % 7));
}
const hm = t => { const m = String(t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m) return null; const h = Number(m[1]), mi = Number(m[2] || 0); return h <= 24 && mi < 60 ? h * 60 + mi : null; };
const fmt = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
// The shift on its day in time (an end at or before the start is after midnight).
function shiftWindow(day, start, end) {
  const [y, m, d] = day.split('-').map(Number), a = hm(start), b = hm(end);
  if (a == null || b == null) return null;
  const s = cairoToUtc(y, m, d, Math.floor(a / 60), a % 60);
  let e = cairoToUtc(y, m, d, Math.floor(b / 60) % 24, b % 60);
  if (b >= 24 * 60) e = cairoToUtc(y, m, d, 0, 0) + 24 * 3600000;
  if (e <= s) e += 24 * 3600000;
  return { start: s, end: e };
}

function setup(app) {
  const { db, fail } = app;

  // ---------- جدول المواعيد ----------
  async function rosterRows(from, to) {
    return db.prepare('SELECT * FROM roster WHERE day BETWEEN ? AND ?').all(from, to);
  }
  app.route('GET', '/api/roster', async ctx => {
    await app.requireAdmin(ctx);
    const w = weekStart(validDate(String(ctx.query.week || '')) ? ctx.query.week : businessDay(ctx.now));
    const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
    const people = await db.prepare('SELECT id, name FROM employees WHERE deleted_at IS NULL AND active = 1 ORDER BY name').all();
    const rows = await rosterRows(days[0], days[6]);
    return { week: w, days, employees: people.map(p => ({ id: p.id, name: p.name, cells: Object.fromEntries(rows.filter(r => r.employee_id === p.id).map(r => [r.day, r.off ? { off: true } : { start: r.start, end: r.end }])) })) };
  });
  app.route('PUT', '/api/roster', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const cells = Array.isArray(ctx.body?.cells) ? ctx.body.cells.slice(0, 500) : [];
    const writes = [];
    for (const c of cells) {
      const id = Number(c?.employeeId), day = String(c?.day || '');
      if (!Number.isInteger(id) || !validDate(day)) fail(400, 'خانة غير صحيحة');
      if (c.clear) { writes.push(db.prepare('DELETE FROM roster WHERE employee_id = ? AND day = ?').bind(id, day)); continue; }
      if (c.off) { writes.push(db.prepare('INSERT INTO roster (employee_id, day, start, end, off, set_by, set_at) VALUES (?,?,NULL,NULL,1,?,?) ON CONFLICT(employee_id, day) DO UPDATE SET start = NULL, end = NULL, off = 1, set_by = excluded.set_by, set_at = excluded.set_at').bind(id, day, who.name, ctx.now)); continue; }
      const a = hm(c.start), b = hm(c.end);
      if (a == null || b == null || a === b) fail(400, 'اكتب الميعاد زي 16:00 لـ 00:00');
      writes.push(db.prepare('INSERT INTO roster (employee_id, day, start, end, off, set_by, set_at) VALUES (?,?,?,?,0,?,?) ON CONFLICT(employee_id, day) DO UPDATE SET start = excluded.start, end = excluded.end, off = 0, set_by = excluded.set_by, set_at = excluded.set_at').bind(id, day, fmt(a), fmt(b), who.name, ctx.now));
    }
    if (writes.length) await db.batch(writes);
    await app.audit('roster_set', null, { actor: who.name, cells: cells.length });
    return { ok: true, saved: writes.length };
  });
  app.route('POST', '/api/roster', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), b = ctx.body;
    if (b.action !== 'copy' || !validDate(String(b.from || '')) || !validDate(String(b.to || ''))) fail(400, 'invalid_action');
    const from = weekStart(b.from), to = weekStart(b.to);
    if (from === to) fail(400, 'اختار أسبوع تاني');
    const rows = await rosterRows(from, addDays(from, 6)), writes = [];
    for (const r of rows) {
      const day = addDays(to, Math.round((Date.parse(r.day) - Date.parse(from)) / 86400000));
      writes.push(db.prepare('INSERT INTO roster (employee_id, day, start, end, off, set_by, set_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(employee_id, day) DO UPDATE SET start = excluded.start, end = excluded.end, off = excluded.off, set_by = excluded.set_by, set_at = excluded.set_at')
        .bind(r.employee_id, day, r.start, r.end, r.off, who.name, ctx.now));
    }
    if (writes.length) await db.batch(writes);
    await app.audit('roster_copy', null, { actor: who.name, from, to, cells: writes.length });
    return { ok: true, copied: writes.length };
  });

  // ---------- one day, linked ----------
  async function ordersBook(day) {
    const row = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
    let d = {}; try { d = JSON.parse(row?.data || '{}'); } catch {}
    // [no, at, apexUser, kind, amount, branch, phoneKey, TransType]
    const fixed = new Set((Array.isArray(d.fixes) ? d.fixes : []).map(x => String(x?.no)));
    // The cashier PC sends only the hotline delivery orders: [no, entry unix seconds, amount, phone key].
    const book = (Array.isArray(d.book) ? d.book : []).filter(x => Array.isArray(x)).map(x => ({ no: x[0], at: Number(x[1]) * 1000, kind: 'Hotline', trans: 'Delivery', amount: Number(x[2]) || 0, ph: x[3] || null, fixed: fixed.has(String(x[0])) })).filter(o => Number.isFinite(o.at));
    // Orders each Apex user entered (all kinds), from the day's staff summary.
    book.staff = (Array.isArray(d.staff) ? d.staff : []).map(x => ({ user: x?.name, orders: Number(x?.orders) || 0 }));
    return book;
  }
  // Orders on Talabat and the website by phone (for «didn't order from us at all» on a missed call).
  async function platformPhones(day) {
    const keys = new Map();
    const safe = async q => { try { return await q; } catch { return []; } };
    for (const r of await safe(db.prepare("SELECT p.data, o.placed_at AS at FROM talabat_orders o JOIN match_profiles p ON p.source = 'talabat' AND p.ref = o.id WHERE o.day = ?").all(day))) {
      let p = {}; try { p = JSON.parse(r.data); } catch {}
      const k = phKey(p.phoneDisplay || p.phone || p.mobile); if (k) (keys.get(k) || keys.set(k, []).get(k)).push(Number(r.at) || 0);
    }
    for (const r of await safe(db.prepare("SELECT p.data, o.created_at AS at FROM site_orders o JOIN match_profiles p ON p.source = 'site' AND p.ref = CAST(o.id AS TEXT) WHERE o.day = ?").all(day))) {
      let p = {}; try { p = JSON.parse(r.data); } catch {}
      const k = phKey(p.customer?.phoneDisplay || p.customer?.phone || p.customer?.mobile); if (k) (keys.get(k) || keys.set(k, []).get(k)).push(Number(r.at) || 0);
    }
    return keys;
  }

  async function dayPerf(day, now, nextRecords) {
    const d = await app.day(day, now);
    const records = d.raw?.records || [], calls = d.calls || [], states = d.states || [], sessions = d.sessions || [];
    const book = await ordersBook(day), names = new Map((await db.prepare('SELECT apex_name, employee_id FROM apex_names').all()).map(r => [r.apex_name, r.employee_id]));
    const plat = await platformPhones(day);
    const roster = new Map((await db.prepare('SELECT * FROM roster WHERE day = ?').all(day)).map(r => [r.employee_id, r]));
    const per = new Map(), E = id => per.get(id) || per.set(id, { employeeId: id, answered: 0, orderCalls: 0, converted: 0, revenue: 0, entered: 0, repeat: 0, waitSum: 0, waitN: 0,
      missedAvailable: 0, missedOverBreak: 0, missedAway: 0, rosterDays: 0, absentDays: 0, lateDays: 0, lateMinutes: 0, earlyMinutes: 0, shiftSeconds: 0, workedInShift: 0 }).get(id);
    const digits = v => String(v || '').replace(/\D/g, '');

    // Calls answered by each employee, with the customer's key and wait.
    const recKey = new Map(); for (const r of records) { const k = phKey(r.phone); if (k) (recKey.get(k) || recKey.set(k, []).get(k)).push(r); }
    const allRecords = [...records, ...(nextRecords || [])];
    const answered = calls.filter(c => c.employeeId && c.complete && c.callType !== 'outgoing' && !c.outsideHours);
    const usedOrders = new Set();
    // The call center's own orders: hotline delivery (pickup by phone is «Delivery» on Apex too), not the branches' counter.
    const hotline = book.filter(o => o.ph);
    let teamConverted = 0, teamRevenue = 0, teamRepeat = 0, teamAnswered = 0, teamOrderCalls = 0;
    const callList = [];
    for (const c of answered) {
      const e = E(c.employeeId); e.answered++; teamAnswered++;
      const k = phKey(c.phone), start = Date.parse(c.startedAt), end = Date.parse(c.endedAt) || start;
      // A call on the order queue (Arabicss queue «…1» = طلب أوردر; unknown queue counts too) is a chance to sell.
      const forOrder = !c.queue || A.purpose(c.queue) === '1';
      if (forOrder) { e.orderCalls++; teamOrderCalls++; }
      // What the quality review looks at first (qa.js).
      const flags = [], dur = c.durationSeconds || Math.round((end - start) / 1000);
      if (A.purpose(c.queue) === '3') flags.push('complaint');
      if (forOrder && dur < 20) flags.push('short');
      if (dur > (RULES.callAlertSeconds || 240)) flags.push('long');
      if (k) {
        const o = forOrder && hotline.find(o => !usedOrders.has(o.no) && o.ph === k && o.at >= start - 2 * 60000 && o.at <= end + CONVERT_MS);
        if (o) { usedOrders.add(o.no); e.converted++; e.revenue += o.amount; teamConverted++; teamRevenue += o.amount; if (o.fixed) flags.push('fixed'); }
        else if (forOrder && (plat.get(k) || []).some(t => t >= start && t <= end + 2 * 3600000)) flags.push('wentToPlatform');
        const again = allRecords.some(r => r.startMs != null && r.startMs > end + 60000 && r.startMs <= end + REPEAT_MS && phKey(r.phone) === k);
        if (again) { e.repeat++; teamRepeat++; flags.push('repeat'); }
        const rec = (recKey.get(k) || []).find(r => r.startMs != null && Math.abs(r.startMs + (r.waitSeconds || 0) * 1000 - start) <= 120000);
        if (rec?.waitSeconds != null) { e.waitSum += rec.waitSeconds; e.waitN++; }
      } else {
        const rec = records.find(r => digits(r.phone) && digits(r.phone) === digits(c.phone) && r.startMs != null && Math.abs(r.startMs + (r.waitSeconds || 0) * 1000 - start) <= 120000);
        if (rec?.waitSeconds != null) { e.waitSum += rec.waitSeconds; e.waitN++; }
      }
      callList.push({ key: day + '|' + c.employeeId + '|' + start, employeeId: c.employeeId, at: start, durationSeconds: dur, queue: c.queue || null, phoneEnd: digits(c.phone).slice(-4) || null, flags });
    }
    // Orders each employee entered on Apex (by the Apex user name linked to them).
    for (const u of book.staff || []) { const id = names.get(u.user); if (id) E(id).entered += u.orders; }

    // Missed calls: who could have taken it.
    const segs = new Map(); for (const s of states) { if (!s.employeeId) continue; (segs.get(s.employeeId) || segs.set(s.employeeId, []).get(s.employeeId)).push({ ...s, a: Date.parse(s.startedAt), b: Date.parse(s.endedAt) }); }
    const breakBefore = (id, t) => (segs.get(id) || []).filter(s => s.state === 'break' && s.a < t).reduce((n, s) => n + (Math.min(s.b, t) - s.a) / 1000, 0);
    const shiftOf = new Map(); for (const [id, r] of roster) if (!r.off) { const w = shiftWindow(day, r.start, r.end); if (w) shiftOf.set(id, w); }
    let missedCounted = 0, missedOwned = 0, lost = 0;
    for (const r of records) {
      const c = A.classify(r);
      if (!c.abandoned || c.classification !== 'counted' || r.startMs == null) continue;
      missedCounted++;
      const a = r.startMs, b = a + Math.max(1, r.waitSeconds || 0) * 1000, mid = (a + b) / 2;
      let owned = false;
      const ids = new Set([...segs.keys(), ...shiftOf.keys()]);
      for (const id of ids) {
        const at = (segs.get(id) || []).find(s => s.a <= mid && s.b >= mid);
        if (at?.state === 'ready') { E(id).missedAvailable++; owned = true; }
        else if (at?.state === 'break' && breakBefore(id, mid) > RULES.breakBudgetSeconds) { E(id).missedOverBreak++; owned = true; }
        else if ((!at || at.state === 'offline' || at.state === 'unknown') && shiftOf.has(id) && shiftOf.get(id).start <= mid && shiftOf.get(id).end >= mid) { E(id).missedAway++; owned = true; }
      }
      if (owned) missedOwned++;
      const k = phKey(r.phone);
      const orderedAfter = k && (hotline.some(o => o.ph === k && o.at >= a && o.at <= a + 2 * 3600000) || (plat.get(k) || []).some(t => t >= a && t <= a + 2 * 3600000));
      if (!orderedAfter) lost++;
    }

    // The shift the supervisors set, against the day.
    for (const [id, r] of roster) {
      if (r.off) continue;
      const w = shiftOf.get(id); if (!w) continue;
      const e = E(id); e.rosterDays++; e.shiftSeconds += (w.end - w.start) / 1000;
      const mine = sessions.filter(s => s.employeeId === id && s.workStartedAt != null);
      if (!mine.length) { e.absentDays++; continue; }
      const first = Math.min(...mine.map(s => s.workStartedAt));
      const late = (first - w.start) / 60000;
      if (late > LATE_GRACE_MIN) { e.lateDays++; e.lateMinutes += Math.round(late); }
      const ended = mine.every(s => s.revokedAt != null) ? Math.max(...mine.map(s => s.revokedAt)) : null;
      if (ended && ended < w.end - LATE_GRACE_MIN * 60000 && ended < now) e.earlyMinutes += Math.round((w.end - ended) / 60000);
      let breaks = 0;
      for (const s of segs.get(id) || []) {
        const x = Math.max(s.a, w.start), y = Math.min(s.b, w.end); if (y <= x) continue;
        const sec = (y - x) / 1000;
        if (s.state === 'ready' || s.state === 'on_call') e.workedInShift += sec;
        else if (s.state === 'break') { const ok = Math.max(0, Math.min(sec, RULES.breakBudgetSeconds - breaks)); breaks += sec; e.workedInShift += ok; }
      }
    }
    // A shift still running counts only up to now.
    return { day, employees: per, calls: callList, team: { answered: teamAnswered, orderCalls: teamOrderCalls, converted: teamConverted, revenue: teamRevenue, repeat: teamRepeat, missedCounted, missedOwned, lost,
      avgHotline: hotline.length ? hotline.reduce((n, o) => n + o.amount, 0) / hotline.length : null, linked: book.length > 0 || (book.staff || []).length > 0 } };
  }

  app.perfDay = async (day, now) => { let next = []; try { next = (await app.dayHistory(addDays(day, 1), now)).records || []; } catch {} return dayPerf(day, now, next); };
  app.perfRange = async (from, to, now) => {
    const days = []; for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
    const by = new Map(), team = { answered: 0, orderCalls: 0, converted: 0, revenue: 0, repeat: 0, missedCounted: 0, missedOwned: 0, lost: 0, lostValue: 0, linkedDays: 0 };
    for (const day of days) {
      let next = []; try { next = (await app.dayHistory(addDays(day, 1), now)).records || []; } catch {}
      const p = await dayPerf(day, now, next);
      for (const [id, e] of p.employees) {
        const o = by.get(id) || by.set(id, Object.fromEntries(Object.keys(e).map(k => [k, k === 'employeeId' ? id : 0]))).get(id);
        for (const k of Object.keys(e)) if (k !== 'employeeId') o[k] += e[k];
      }
      for (const k of ['answered', 'orderCalls', 'converted', 'revenue', 'repeat', 'missedCounted', 'missedOwned', 'lost']) team[k] += p.team[k];
      if (p.team.avgHotline) team.lostValue += p.team.lost * p.team.avgHotline;
      if (p.team.linked) team.linkedDays++;
    }
    const employees = [...by.values()].map(e => ({ employeeId: e.employeeId, converted: e.converted, conversionPct: pct(e.converted, e.orderCalls), orderCalls: e.orderCalls, revenue: Math.round(e.revenue),
      entered: e.entered, fcrPct: e.answered ? r1(100 - e.repeat / e.answered * 100) : null, repeat: e.repeat, avgAnswerWait: e.waitN ? r1(e.waitSum / e.waitN) : null,
      missedAvailable: e.missedAvailable, missedOverBreak: e.missedOverBreak, missedAway: e.missedAway, missedMine: e.missedAvailable + e.missedOverBreak + e.missedAway,
      rosterDays: e.rosterDays, absentDays: e.absentDays, lateDays: e.lateDays, lateMinutes: e.lateMinutes, earlyMinutes: e.earlyMinutes,
      adherencePct: e.shiftSeconds ? r1(Math.min(100, e.workedInShift / e.shiftSeconds * 100)) : null }));
    return { days: days.length, team: { conversionPct: pct(team.converted, team.orderCalls), orderCalls: team.orderCalls, converted: team.converted, revenue: Math.round(team.revenue), fcrPct: team.answered ? r1(100 - team.repeat / team.answered * 100) : null,
      missedCounted: team.missedCounted, missedOwned: team.missedOwned, lost: team.lost, lostValue: Math.round(team.lostValue), linkedDays: team.linkedDays }, employees };
  };
}

export { setup, shiftWindow };
