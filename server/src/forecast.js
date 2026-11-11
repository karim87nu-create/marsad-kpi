// التوقع والاحتياج (Karim 11-11): for a day, every half hour from 9 ص to 2 الفجر —
//  - the calls and orders expected, from the same weekday of the last 4 weeks (the nearer weeks count more) and the
//    trend of the last 7 days against the 7 before;
//  - how many employees are needed to answer 90% within 10 seconds (Erlang C, with the team's recent call length);
//  - how many are on the shift table, and (for a day that passed) how many actually worked and how many calls came.
import { addDays, businessDay, validDate, iso, dayWindow, RULES } from './time.js';
import * as A from './arabicss.js';

const SLOT_MS = 30 * 60000, SLA = 0.9, SLA_S = 10, WRAP_S = 15, WEIGHTS = [4, 3, 2, 1];
const r1 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;

// Erlang C: the share of calls answered within `t` seconds with `n` agents, `a` erlangs of traffic and `aht` seconds.
export function serviceLevel(n, a, aht, t) {
  if (n <= a) return 0;
  let sum = 1, term = 1;
  for (let k = 1; k < n; k++) { term *= a / k; sum += term; }
  const top = term * a / n * (n / (n - a));
  const pw = top / (sum + top);
  return 1 - pw * Math.exp(-(n - a) * t / aht);
}
export function agentsNeeded(calls, aht, slotSeconds = SLOT_MS / 1000) {
  if (!calls || !aht) return 0;
  const a = calls * aht / slotSeconds;
  for (let n = Math.max(1, Math.ceil(a)); n < 60; n++) if (serviceLevel(n, a, aht, SLA_S) >= SLA) return n;
  return 60;
}

function setup(app) {
  const { db, fail } = app;
  const slotsOf = day => { const w = dayWindow(day), out = []; for (let t = w.start; t < w.operatingEnd; t += SLOT_MS) out.push(t); return out; };
  const label = t => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

  // Incoming calls (answered or not, in working hours) per half hour of a day.
  async function callsBySlot(day, now) {
    let recs = []; try { recs = (await app.dayHistory(day, now)).records || []; } catch {}
    const w = dayWindow(day), n = new Array(Math.ceil((w.operatingEnd - w.start) / SLOT_MS)).fill(0);
    let talk = 0, answered = 0;
    for (const r of recs) {
      if (r.startMs == null) continue;
      const c = A.classify(r); if (c.outside) continue;
      const i = Math.floor((r.startMs - w.start) / SLOT_MS); if (i >= 0 && i < n.length) n[i]++;
      if (c.answered && r.durationSeconds) { talk += r.durationSeconds; answered++; }
    }
    return { n, total: recs.length ? n.reduce((a, b) => a + b, 0) : null, aht: answered ? talk / answered : null };
  }
  // Orders per hour of a day (Apex, all kinds), split evenly in its two half hours.
  async function ordersBySlot(day) {
    const row = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day);
    let d = {}; try { d = JSON.parse(row?.data || '{}'); } catch {}
    const w = dayWindow(day), n = new Array(Math.ceil((w.operatingEnd - w.start) / SLOT_MS)).fill(0);
    if (!Array.isArray(d.hours)) return { n, total: null };
    for (const x of d.hours) {
      const h = Number(x.h), o = Number(x.orders) || 0; if (!Number.isFinite(h)) continue;
      const i = ((h - RULES.businessStartHour + 24) % 24) * 2; if (i < n.length) { n[i] += o / 2; if (i + 1 < n.length) n[i + 1] += o / 2; }
    }
    return { n, total: n.reduce((a, b) => a + b, 0) };
  }
  // Employees working (ready or on a call) in each half hour, on average over the half hour.
  async function staffedBySlot(day, now) {
    let states = []; try { states = (await app.day(day, now)).states || []; } catch {}
    const w = dayWindow(day), n = new Array(Math.ceil((w.operatingEnd - w.start) / SLOT_MS)).fill(0);
    for (const s of states) {
      if (s.state !== 'ready' && s.state !== 'on_call') continue;
      const a = Date.parse(s.startedAt), b = Date.parse(s.endedAt);
      for (let i = 0; i < n.length; i++) { const x = Math.max(a, w.start + i * SLOT_MS), y = Math.min(b, w.start + (i + 1) * SLOT_MS); if (y > x) n[i] += (y - x) / SLOT_MS; }
    }
    return n.map(v => r1(v));
  }
  async function rosteredBySlot(day) {
    const w = dayWindow(day), n = new Array(Math.ceil((w.operatingEnd - w.start) / SLOT_MS)).fill(0);
    const { shiftWindow } = await import('./perf.js');
    for (const r of await db.prepare('SELECT * FROM roster WHERE day = ? AND off = 0').all(day)) {
      const s = shiftWindow(day, r.start, r.end); if (!s) continue;
      for (let i = 0; i < n.length; i++) { const x = Math.max(s.start, w.start + i * SLOT_MS), y = Math.min(s.end, w.start + (i + 1) * SLOT_MS); if (y > x) n[i] += (y - x) / SLOT_MS; }
    }
    return n.map(v => r1(v));
  }

  async function forecast(day, now) {
    const past = [7, 14, 21, 28].map(k => addDays(day, -k));
    const calls = await Promise.all(past.map(d => callsBySlot(d, now))), orders = await Promise.all(past.map(ordersBySlot));
    const blend = list => { const len = list[0].n.length, out = new Array(len).fill(0); let wsum = 0;
      list.forEach((x, i) => { if (x.total == null) return; wsum += WEIGHTS[i]; for (let j = 0; j < len; j++) out[j] += x.n[j] * WEIGHTS[i]; });
      return wsum ? out.map(v => v / wsum) : null; };
    // Trend: the last 7 days against the 7 before them (calls), limited to ±20%.
    const ref = businessDay(now) < day ? businessDay(now) : day;
    const sumDays = async (from, n) => { let s = 0, k = 0; for (let i = 0; i < n; i++) { const c = await callsBySlot(addDays(from, -i), now); if (c.total != null) { s += c.total; k++; } } return k ? s / k : null; };
    const recent = await sumDays(addDays(ref, -1), 7), before = await sumDays(addDays(ref, -8), 7);
    const trend = recent && before ? Math.min(1.2, Math.max(0.8, recent / before)) : 1;
    const ahts = calls.map(c => c.aht).filter(Boolean), aht = (ahts.length ? ahts.reduce((a, b) => a + b, 0) / ahts.length : 120) + WRAP_S;
    const fc = blend(calls), fo = blend(orders);
    const slots = slotsOf(day), rostered = await rosteredBySlot(day);
    const happened = day <= businessDay(now);
    const actual = happened ? await callsBySlot(day, now) : null, staffed = happened ? await staffedBySlot(day, now) : null;
    const rows = slots.map((t, i) => {
      const c = fc ? fc[i] * trend : null, need = c != null ? agentsNeeded(c, aht) : null;
      return { at: iso(t), label: label(t), calls: r1(c), orders: fo ? r1(fo[i] * trend) : null, need, rostered: rostered[i], gap: need != null ? r1(rostered[i] - need) : null,
        actualCalls: actual ? actual.n[i] : null, staffed: staffed ? staffed[i] : null };
    });
    const tot = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
    const mape = actual?.total ? (() => { const p = rows.filter(r => r.actualCalls); return p.length ? r1(p.reduce((a, r) => a + Math.abs((r.calls || 0) - r.actualCalls) / r.actualCalls, 0) / p.length * 100) : null; })() : null;
    return { day, basedOn: past, trend: r1(trend), aht: Math.round(aht), sla: { share: SLA * 100, seconds: SLA_S }, rows,
      totals: { calls: r1(tot('calls')), orders: r1(tot('orders')), actualCalls: actual?.total ?? null, needHours: r1(tot('need') / 2), rosteredHours: r1(tot('rostered') / 2), staffedHours: staffed ? r1(tot('staffed') / 2) : null },
      shortSlots: rows.filter(r => r.gap != null && r.gap < 0).map(r => r.label), errorPct: mape };
  }

  app.route('GET', '/api/forecast', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : addDays(businessDay(ctx.now), 1);
    return forecast(day, ctx.now);
  });
  app.forecast = forecast;
}

export { setup };
