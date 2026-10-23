#!/usr/bin/env node
'use strict';
// Parity check for employee performance, calls and history attribution:
// the old dashboard route (original SQL on the old SQLite) vs this server's oldDay().
// Usage: node scripts/compare-old-dashboard.js <old.sqlite> <new.db>
const D = require('better-sqlite3');
const L = require('../src/legacy-logic/dashboard-logic');
const { cairoClockWindow } = require('../src/legacy-logic/missed-context');
const { open } = require('../src/db');
const { createApp } = require('../src/app');
const { dayWindow } = require('../src/time');
const [oldP, newP] = process.argv.slice(2);
const o = new D(oldP, { readonly: true });
const app = createApp({ db: open(newP), config: { secret: 'x', deviceTokens: [], allowedOrigins: [] } });
for (const m of ['admin', 'employees', 'sessions', 'dashboard', 'breaks', 'messages', 'shifts', 'history', 'missed', 'legacy-dashboard', 'operations', 'telegram']) require('../src/' + m).setup(app);
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
  const completed = L.canonicalBreaks(breakEnds.filter(e => e.durationSeconds > 0 && Date.parse(e.occurredAt) <= now).map(e => ({ employeeId: Number(L.eventPayload(e).employeeId), extension: e.extension, startedAt: new Date(Date.parse(e.occurredAt) - e.durationSeconds * 1000).toISOString(), endedAt: e.occurredAt, durationSeconds: e.durationSeconds, completedBreak: true })), start, finish);
  for (const p of operating.performance) p.breakSeconds = completed.filter(b => b.employeeId === p.employeeId).reduce((n, b) => n + Math.max(0, Math.floor((Math.min(Date.parse(b.endedAt), operatingEnd) - Math.max(Date.parse(b.startedAt), start)) / 1000)), 0);
  return { calls: all.calls.length, performance: operating.performance, summary: att.summary };
}
const keys = ['calls', 'inbound', 'outbound', 'answered', 'avgHandleTime', 'breakSeconds', 'unknownBreaks', 'firstLogin', 'lastLogout'];
let bad = 0, rows = 0;
const now = Date.now();
for (const date of o.prepare('SELECT DISTINCT report_date d FROM history_reports ORDER BY 1').all().map(r => r.d)) {
  const a = oldRoute(date, now), b = app.oldDay(date, {}, now);
  const diffs = [];
  if (a.calls !== b.calls.length) diffs.push('calls ' + a.calls + '≠' + b.calls.length);
  if (JSON.stringify(a.summary) !== JSON.stringify(b.historyAttribution.summary)) diffs.push('attribution ' + JSON.stringify(a.summary) + '≠' + JSON.stringify(b.historyAttribution.summary));
  for (const p of a.performance) {
    if (!b.performance.find(x => x.employeeId === p.employeeId) && keys.every(k => !p[k])) continue;
    rows++; const q = b.performance.find(x => x.employeeId === p.employeeId) || {};
    for (const k of keys) if (p[k] !== q[k] && !(p.breakSeconds === 0 && k === 'breakSeconds' && q[k] == null)) diffs.push('emp ' + p.employeeId + ' ' + k + ' ' + p[k] + '≠' + q[k]);
  }
  if (diffs.length) bad++;
  console.log(date, diffs.length ? 'DIFF ' + diffs.slice(0, 4).join(' | ') : 'same', 'calls', a.calls, 'recovered', a.summary.recovered, 'completed', a.summary.completedFromHistory);
}
console.log(bad ? bad + ' day(s) differ' : 'ALL DAYS MATCH', '(employee-days', rows + ')');
