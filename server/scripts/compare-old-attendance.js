#!/usr/bin/env node
'use strict';
// Parity check for attendance (session and state durations, event durations) and the operations
// analysis: the old route's original SQL and logic on the old SQLite vs this server on the imported DB.
// Usage: node scripts/compare-old-attendance.js <old.sqlite> <new.db>
const D = require('better-sqlite3');
const L = require('../src/legacy-logic/dashboard-logic');
const A = require('../src/legacy-logic/attendance-logic');
const { cairoClockWindow } = require('../src/legacy-logic/missed-context');
const { open } = require('../src/db');
const { createApp } = require('../src/app');
const { dayWindow } = require('../src/time');
const [oldP, newP] = process.argv.slice(2);
const o = new D(oldP, { readonly: true });
const app = createApp({ db: open(newP), config: { secret: 'x', deviceTokens: [], allowedOrigins: [] } });
for (const m of require('../src/index').MODULES.map(x => x.slice(2))) require('../src/' + m).setup(app);
const F = ms => new Date(ms).toISOString(), DAY = 864e5, fields = 'id,event_type AS eventType,call_id AS callId,agent_name AS agentName,extension,phone,call_type AS callType,occurred_at AS occurredAt,duration_seconds AS durationSeconds,payload';
const shiftDate = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const parts = ms => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, +p.value]));
const bdate = ms => { const p = parts(ms), d = p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0'); return p.hour < 9 ? shiftDate(d, -1) : d; };
const bt = c => { const k = cairoClockWindow(c.date, c.start) || cairoClockWindow(c.date, c.end); return k ? bdate(k.start) : c.date; };
function oldRoute(date, now) {
  const w = dayWindow(date), start = w.start, finish = w.end, operatingEnd = w.operatingEnd;
  const events = o.prepare('SELECT ' + fields + " FROM call_events WHERE occurred_at>=? AND occurred_at<? AND event_type<>'heartbeat' ORDER BY occurred_at ASC,id ASC").all(F(start), F(finish));
  const callEvents = o.prepare('SELECT ' + fields + " FROM call_events WHERE occurred_at>=? AND occurred_at<? AND event_type IN ('agentlinked','agentunlinked') ORDER BY occurred_at ASC,id ASC").all(F(start - DAY), F(finish + DAY));
  const groups = new Map();
  for (const e of callEvents) { if (!e.callId) continue; const k = L.eventPayload(e).employeeId + ':' + e.extension + ':' + L.canonicalCallId(e.callId); (groups.get(k) || groups.set(k, []).get(k)).push(e); }
  const scoped = [...groups.values()].filter(l => { const f = l.find(e => e.eventType === 'agentlinked'), en = l.find(e => e.eventType === 'agentunlinked'); const at = f ? Date.parse(f.occurredAt) : en ? Date.parse(en.occurredAt) - en.durationSeconds * 1000 : NaN; return at >= start && at < finish; }).flat();
  // historyAttribution(db, date, live) with the old SQL
  const src = [date, shiftDate(date, 1)].map(d => o.prepare('SELECT records FROM history_reports WHERE report_date=? ORDER BY imported_at DESC,id DESC LIMIT 1').get(d));
  const records = src.flatMap(s => s ? JSON.parse(s.records) : []).filter(c => bt(c) === date);
  const live = L.dashboardMetrics(callEvents).calls;
  const clocks = c => { const a = cairoClockWindow(c.date, c.start); let b = cairoClockWindow(c.date, c.end); if (!a || !b || a.ambiguous || b.ambiguous) return null; if (b.end < a.start) b = cairoClockWindow(shiftDate(c.date, 1), c.end); if (!b || b.ambiguous || b.start - a.end > 12 * 3600000 || b.end < a.start) return null; return { start: a.start, end: b.end }; };
  let att;
  if (!records.length) att = L.reconcileHistory([], live, []);
  else {
    const names = new Map(o.prepare('SELECT id,name FROM employees').all().map(e => [e.id, e.name]));
    const earliest = Math.min(...records.map(c => clocks(c)?.start ?? Infinity)), latest = Math.max(...records.map(c => clocks(c)?.end ?? 0));
    if (!Number.isFinite(earliest)) att = L.reconcileHistory(records, live, []);
    else {
      const sessions = o.prepare('SELECT id,employee_id AS employeeId,extension,issued_at AS issuedAt,last_seen AS lastSeen,expires_at AS expiresAt,revoked_at AS revokedAt FROM employee_sessions WHERE issued_at<=? AND last_seen>=? ORDER BY issued_at').all(latest + 15 * 60000, earliest - 15 * 60000);
      const bound = new Map(o.prepare("SELECT json_extract(payload,'$.sessionId') AS sessionId,extension,MIN(occurred_at) AS boundAt FROM call_events WHERE event_type IN ('session_login','arabicss_login','heartbeat','agentlinked','agentunlinked','break_start','break_end','call_observed','call_observed_end') AND json_extract(payload,'$.sessionId') IS NOT NULL AND occurred_at>=? AND occurred_at<=? AND extension<>'unbound' AND extension<>'' GROUP BY json_extract(payload,'$.sessionId'),extension").all(F(earliest - 12 * 3600000), F(latest)).map(b => [b.sessionId + ':' + b.extension, Date.parse(b.boundAt)]));
      const own = o.prepare("SELECT json_extract(payload,'$.employeeId') AS employeeId,json_extract(payload,'$.sessionId') AS sessionId,extension,occurred_at AS occurredAt,event_type AS eventType,json_extract(payload,'$.state') AS state FROM call_events WHERE occurred_at>=? AND occurred_at<=? AND event_type IN ('session_login','arabicss_login','heartbeat','agentlinked','agentunlinked','break_start','break_end','call_observed','call_observed_end','session_logout','arabicss_logout','page_closed') AND json_extract(payload,'$.sessionId') IS NOT NULL AND extension<>'' AND extension<>'unbound' ORDER BY occurred_at,id").all(F(earliest - 15 * 60000), F(latest + 15 * 60000));
      for (const e of own) { const k = e.sessionId + ':' + e.extension; bound.set(k, Math.min(bound.get(k) ?? Infinity, Date.parse(e.occurredAt))); }
      att = L.reconcileHistory(records, live, sessions.map(s => ({ ...s, boundAt: bound.get(s.id + ':' + s.extension) ?? (/^\d{1,10}$/.test(s.extension) ? s.issuedAt : Infinity), name: names.get(s.employeeId) || '' })), own, now);
    }
  }
  for (const e of att.events) { const k = L.eventPayload(e).employeeId + ':' + e.extension + ':' + L.canonicalCallId(e.callId); (groups.get(k) || groups.set(k, []).get(k)).push(e); }
  scoped.push(...att.events);
  const startOf = e => { const g = groups.get(L.eventPayload(e).employeeId + ':' + e.extension + ':' + L.canonicalCallId(e.callId)), f = g.find(x => x.eventType === 'agentlinked'), en = g.find(x => x.eventType === 'agentunlinked'); return f ? Date.parse(f.occurredAt) : Date.parse(en.occurredAt) - en.durationSeconds * 1000; };
  const all = L.dashboardMetrics([...events.filter(e => !['agentlinked', 'agentunlinked'].includes(e.eventType)), ...scoped]);
  const operating = L.dashboardMetrics([...events.filter(e => !['agentlinked', 'agentunlinked'].includes(e.eventType) && Date.parse(e.occurredAt) < operatingEnd), ...scoped.filter(e => L.eventPayload(e).outsideOperating !== true && startOf(e) < operatingEnd)]);
  const breakEnds = o.prepare('SELECT ' + fields + " FROM call_events WHERE event_type='break_end' AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at ASC").all(F(start), F(finish + DAY));
  const completed = L.canonicalBreaks(breakEnds.filter(e => e.durationSeconds > 0 && Date.parse(e.occurredAt) <= now).map(e => ({ employeeId: Number(L.eventPayload(e).employeeId), extension: e.extension, startedAt: new Date(Date.parse(e.occurredAt) - e.durationSeconds * 1000).toISOString(), endedAt: e.occurredAt, durationSeconds: e.durationSeconds, running: false, completedBreak: true })), start, finish);
  for (const p of operating.performance) p.breakSeconds = completed.filter(b => b.employeeId === p.employeeId).reduce((n, b) => n + Math.max(0, Math.floor((Math.min(Date.parse(b.endedAt), operatingEnd) - Math.max(Date.parse(b.startedAt), start)) / 1000)), 0);
  all.calls = L.enrichHistoryCalls(all.calls, att.details);
  return { calls: all.calls.length, performance: operating.performance, summary: att.summary, allCalls: all.calls.map(c => ({ ...c, outsideHours: Date.parse(c.startedAt) >= operatingEnd || L.eventPayload(c).outsideOperating === true })),
    timeline: all.timeline.map(e => ({ ...e, outsideHours: Date.parse(e.occurredAt) >= operatingEnd })), completed, events, breakEnds, records };
}

// D1-style wrapper so the old attendanceData() runs its own SQL on the old SQLite.
const d1 = { prepare: sql => ({ bind: (...args) => ({ all: async () => ({ results: o.prepare(sql).all(...args) }) }) }) };
const ids = new Map(); // old session id -> new session id (import kept issue order)
{
  const oldS = o.prepare('SELECT id FROM employee_sessions ORDER BY issued_at').all(), newS = app.db.prepare('SELECT id, device FROM employee_sessions').all();
  const byDevice = new Map(newS.map(s => [s.device, s.id]));
  for (const s of oldS) ids.set(s.id, String(byDevice.get('legacy:' + s.id)));
}
const strip = list => list.map(x => JSON.stringify(x)).sort();
const map = v => (v && ids.has(v) ? ids.get(v) : v);
const norm = s => ({ ...s, id: map(s.id), sessionId: map(s.sessionId), reason: undefined });
function report(name, a, b, date) {
  const x = strip(a), y = strip(b);
  if (x.length === y.length && x.every((v, i) => v === y[i])) return 0;
  const onlyA = x.filter(v => !y.includes(v)), onlyB = y.filter(v => !x.includes(v));
  console.log(date, name, 'DIFF old', x.length, 'new', y.length, '\n   old:', (onlyA[0] || '').slice(0, 400), '\n   new:', (onlyB[0] || '').slice(0, 400));
  return 1;
}
(async () => {
  const now = Math.max(...o.prepare('SELECT MAX(occurred_at) m FROM call_events').all().map(r => Date.parse(r.m))) + 3600000;
  let bad = 0, n = 0;
  for (const date of o.prepare('SELECT DISTINCT report_date d FROM history_reports ORDER BY 1').all().map(r => r.d)) {
    const r = oldRoute(date, now), w = dayWindow(date);
    const at = await A.attendanceData(d1, w.start, w.end, now, '', '');
    const durations = A.attendanceTimeline([...r.events, ...r.breakEnds.filter(e => !r.events.some(x => x.id === e.id))], at.sessions, now);
    at.states = A.reconcileBreakStates(at.states, r.completed);
    for (const call of r.allCalls.filter(c => c.eventType === 'agentunlinked' && c.durationSeconds > 0 && c.timePrecision === 'second')) {
      const a = Date.parse(call.startedAt), b = Math.min(Date.parse(call.occurredAt), a + call.durationSeconds * 1000);
      at.states = at.states.flatMap(s => { const x = Date.parse(s.startedAt), y = Date.parse(s.endedAt), u = Math.max(x, a), v = Math.min(y, b); if (s.state !== 'unknown' || s.employeeId !== call.employeeId || s.extension !== call.extension || v <= u) return [s];
        return [[x, u, 'unknown'], [u, v, 'on_call'], [v, y, 'unknown']].filter(([p, q]) => q > p).map(([p, q, state]) => ({ ...s, state, startedAt: new Date(p).toISOString(), endedAt: new Date(q).toISOString(), durationSeconds: Math.floor((q - p) / 1000), running: false })); });
    }
    const mine = app.oldDashboard(date, { attendance: true, all: true }, now);
    let diff = report('sessions', at.sessions.map(norm), mine.attendance.sessions.map(norm), date) + report('states', at.states, mine.attendance.states, date);
    // Event durations: old event ids differ from new ids, so compare the values in event order.
    diff += report('durations', durations.map(d => ({ ...d, eventId: undefined })), mine.durations.map(d => ({ ...d, eventId: undefined })), date);
    // Operations analysis from the same inputs.
    const staff = o.prepare('SELECT id, name, employee_code AS employeeCode FROM employees').all();
    for (const p of r.performance) if (!staff.some(s => s.id === p.employeeId)) staff.push({ id: p.employeeId, name: p.employee, employeeCode: 'حساب سابق' });
    const ins = A.operationsInsights({ date, now, staff, sessions: at.sessions, states: at.states, calls: r.allCalls, events: r.timeline, history: r.records, hasHistory: true, historyVerified: false, missingDates: [], breakTotals: mine.breakTotals.map(({ unknownBreaks, ...t }) => t) });
    const ops = app.operationsData(date, '', '', now);
    for (const k of ['profiles', 'buckets', 'breakOverlaps', 'customers', 'handovers']) diff += report('operations.' + k, (ins[k] || []).map(p => k === 'profiles' ? { ...p, transitions: p.transitions.map(norm) } : p), (ops[k] || []).map(p => k === 'profiles' ? { ...p, transitions: p.transitions.map(norm) } : p), date);
    diff += report('operations.wait', [ins.wait], [ops.wait], date);
    diff += report('operations.coverage', [{ ...ins.coverage, historyVerified: undefined, missingDates: undefined }], [{ ...ops.coverage, historyVerified: undefined, missingDates: undefined }], date);
    if (diff) bad++;
    n++;
    console.log(date, diff ? 'DIFF' : 'same', 'sessions', at.sessions.length, 'states', at.states.length, 'profiles', ins.profiles.length);
  }
  console.log(bad ? bad + ' day(s) differ' : 'ALL DAYS MATCH', '(' + n + ' days)');
})();
