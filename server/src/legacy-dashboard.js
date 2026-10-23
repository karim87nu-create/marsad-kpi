'use strict';
// Calls, history attribution, employee performance and break totals for one data day,
// computed step by step exactly as the old app/api/dashboard/route.ts did.
const { dashboardMetrics, eventPayload, canonicalCallId, reconcileHistory, enrichHistoryCalls, canonicalBreaks } = require('./legacy-logic/dashboard-logic');
const { dashboardEvent, historyCall } = require('./old-shape');
const { dayWindow, iso } = require('./time');

const DAY = 86400000;
const CALL_TYPES = "('agentlinked','agentunlinked')";

function setup(app) {
  const { db } = app;
  const cache = new Map();

  // Old sessions/bindings/ownership inputs for reconcileHistory (lib/history-attribution.ts).
  function attributionInputs(records, names) {
    const { cairoClockWindow } = require('./legacy-logic/missed-context');
    const shiftDate = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
    const clocks = c => { // lib/history-attribution.ts clocks()
      const a = cairoClockWindow(c.date, c.start); let b = cairoClockWindow(c.date, c.end);
      if (!a || !b || a.ambiguous || b.ambiguous) return null;
      if (b.end < a.start) b = cairoClockWindow(shiftDate(c.date, 1), c.end);
      if (!b || b.ambiguous || b.start - a.end > 12 * 3600000 || b.end < a.start) return null;
      return { start: a.start, end: b.end };
    };
    const earliest = Math.min(...records.map(c => clocks(c)?.start ?? Infinity)), latest = Math.max(...records.map(c => clocks(c)?.end ?? 0));
    if (!Number.isFinite(earliest)) return null;
    const sessions = db.prepare('SELECT * FROM employee_sessions WHERE issued_at <= ? AND last_seen >= ? ORDER BY issued_at').all(latest + 15 * 60000, earliest - 15 * 60000);
    const bound = new Map();
    for (const b of db.prepare(`SELECT session_id, extension, MIN(occurred_at) at FROM events WHERE event_type IN ('session_login','arabicss_login','heartbeat','agentlinked','agentunlinked','break_start','break_end','call_observed','call_observed_end')
      AND occurred_at >= ? AND occurred_at <= ? AND extension <> 'unbound' AND extension <> '' GROUP BY session_id, extension`).all(earliest - 12 * 3600000, latest)) bound.set(b.session_id + ':' + b.extension, b.at);
    const evidence = db.prepare(`SELECT employee_id, session_id, extension, occurred_at, event_type, state FROM events WHERE occurred_at >= ? AND occurred_at <= ?
      AND event_type IN ('session_login','arabicss_login','heartbeat','agentlinked','agentunlinked','break_start','break_end','call_observed','call_observed_end','session_logout','arabicss_logout','page_closed')
      AND extension <> '' AND extension <> 'unbound' ORDER BY occurred_at, id`).all(earliest - 15 * 60000, latest + 15 * 60000)
      .map(e => ({ employeeId: e.employee_id, sessionId: String(e.session_id), extension: e.extension, occurredAt: iso(e.occurred_at), eventType: e.event_type, state: e.state || undefined }));
    for (const e of evidence) { const k = e.sessionId + ':' + e.extension; bound.set(k, Math.min(bound.get(k) ?? Infinity, Date.parse(e.occurredAt))); }
    return {
      evidence,
      sessions: sessions.map(s => ({ id: String(s.id), employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, lastSeen: s.last_seen, expiresAt: s.expires_at,
        revokedAt: s.revoked_at ?? null, boundAt: bound.get(s.id + ':' + s.extension) ?? (/^\d{1,10}$/.test(s.extension) ? s.issued_at : Infinity), name: names.get(s.employee_id)?.name || '' })),
    };
  }

  app.oldDay = function oldDay(date, { employee = '', extension = '' } = {}, now = app.now()) {
    const w = dayWindow(date), start = w.start, finish = w.end, operatingEnd = w.operatingEnd;
    const key = [date, employee, extension, db.prepare('SELECT MAX(id) m FROM events').get().m, db.prepare('SELECT MAX(imported_at) m FROM history_reports').get().m, Math.floor(now / 15000)].join('|');
    if (cache.has(key)) return cache.get(key);
    const names = new Map(db.prepare('SELECT id, name FROM employees').all().map(e => [e.id, e]));
    const inScope = e => (!extension || e.extension === String(extension)) && (!employee || e.employee_id === Number(employee));
    const ev = e => dashboardEvent(e, names);

    const events = db.prepare("SELECT * FROM events WHERE occurred_at >= ? AND occurred_at < ? AND event_type <> 'heartbeat' ORDER BY occurred_at, id").all(start, finish).filter(inScope).map(ev);
    const allCallRows = db.prepare(`SELECT * FROM events WHERE occurred_at >= ? AND occurred_at < ? AND event_type IN ${CALL_TYPES} ORDER BY occurred_at, id`).all(start - DAY, finish + DAY);
    const callEvents = allCallRows.filter(inScope).map(ev), observed = allCallRows.map(ev);
    const groups = new Map(), gkey = e => eventPayload(e).employeeId + ':' + e.extension + ':' + canonicalCallId(e.callId);
    for (const e of callEvents) { if (!e.callId) continue; const k = gkey(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const scopedCalls = [...groups.values()].filter(list => {
      const first = list.find(e => e.eventType === 'agentlinked'), ended = list.find(e => e.eventType === 'agentunlinked');
      const at = first ? Date.parse(first.occurredAt) : ended ? Date.parse(ended.occurredAt) - ended.durationSeconds * 1000 : NaN;
      return at >= start && at < finish;
    }).flat();

    // History attribution (recovered calls and completions) from the Arabicss day report.
    const h = app.dayHistory(date, now);
    const records = h.records.map(historyCall);
    const inputs = attributionInputs(records, names);
    const liveCalls = dashboardMetrics(observed).calls;
    const attribution = !records.length ? reconcileHistory([], liveCalls, []) : !inputs ? reconcileHistory(records, liveCalls, []) : reconcileHistory(records, liveCalls, inputs.sessions, inputs.evidence, now);
    const recovered = attribution.events.filter(e => (!employee || Number(eventPayload(e).employeeId) === Number(employee)) && (!extension || e.extension === String(extension)));
    for (const e of recovered) { const k = gkey(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    scopedCalls.push(...recovered);

    const metrics = dashboardMetrics([...events.filter(e => !['agentlinked', 'agentunlinked'].includes(e.eventType)), ...scopedCalls]);
    metrics.calls = enrichHistoryCalls(metrics.calls, attribution.details);
    const startOf = e => { const g = groups.get(gkey(e)), first = g.find(x => x.eventType === 'agentlinked'), ended = g.find(x => x.eventType === 'agentunlinked'); return first ? Date.parse(first.occurredAt) : Date.parse(ended.occurredAt) - ended.durationSeconds * 1000; };
    const operating = dashboardMetrics([...events.filter(e => !['agentlinked', 'agentunlinked'].includes(e.eventType) && Date.parse(e.occurredAt) < operatingEnd),
      ...scopedCalls.filter(e => eventPayload(e).outsideOperating !== true && startOf(e) < operatingEnd)]);
    metrics.summary = operating.summary;
    metrics.performance = operating.performance;

    // Completed breaks from break ends, allocated to this day (old route).
    const breakEnds = db.prepare("SELECT * FROM events WHERE event_type = 'break_end' AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at").all(start, finish + DAY).filter(inScope).map(ev);
    for (const p of metrics.performance) p.breakSeconds = 0;
    for (const e of breakEnds) {
      const ended = Date.parse(e.occurredAt), seconds = Math.max(0, Math.floor((Math.min(ended, operatingEnd) - Math.max(ended - e.durationSeconds * 1000, start)) / 1000)), id = Number(eventPayload(e).employeeId);
      if (!seconds || !id) continue;
      let p = metrics.performance.find(x => x.employeeId === id);
      if (!p) { p = { employeeId: id, employee: e.agentName || '', calls: 0, inbound: 0, outbound: 0, answered: 0, talk: 0, avgHandleTime: 0, breakSeconds: 0, unknownBreaks: 0, firstLogin: null, lastLogout: null }; metrics.performance.push(p); }
      p.breakSeconds += seconds;
    }
    const completedBreaks = canonicalBreaks(breakEnds.filter(e => e.durationSeconds > 0 && Date.parse(e.occurredAt) <= now).map(e => ({ employeeId: Number(eventPayload(e).employeeId), extension: e.extension,
      startedAt: new Date(Date.parse(e.occurredAt) - e.durationSeconds * 1000).toISOString(), endedAt: e.occurredAt, durationSeconds: e.durationSeconds, running: false, completedBreak: true })), start, finish);
    const live = now >= start && now < finish ? app.presence(now).filter(p => p.state === 'break' && p.startedAt && (!employee || p.employeeId === Number(employee)) && (!extension || p.extension === String(extension))) : [];
    const ongoingBreaks = canonicalBreaks(live.map(p => ({ employeeId: p.employeeId, extension: p.extension, startedAt: p.startedAt, endedAt: iso(now), durationSeconds: 0, running: true, completedBreak: false,
      evidenceUntil: Date.parse(p.evidenceAt || '') + 90000 })), start, Math.min(finish, now));
    for (const b of ongoingBreaks) if (!metrics.performance.some(p => p.employeeId === b.employeeId))
      metrics.performance.push({ employeeId: b.employeeId, employee: names.get(b.employeeId)?.name || '', calls: 0, inbound: 0, outbound: 0, answered: 0, talk: 0, avgHandleTime: 0, breakSeconds: 0, unknownBreaks: 0, firstLogin: null, lastLogout: null });
    const seconds = (list, id) => list.filter(b => b.employeeId === id).reduce((n, b) => n + Math.max(0, Math.floor((Math.min(Date.parse(b.endedAt), operatingEnd) - Math.max(Date.parse(b.startedAt), start)) / 1000)), 0);
    const breakTotals = metrics.performance.map(p => { p.breakSeconds = seconds(completedBreaks, p.employeeId); const o = seconds(ongoingBreaks, p.employeeId); return { employeeId: p.employeeId, completedBreakSeconds: p.breakSeconds, ongoingBreakSeconds: o, totalBreakSeconds: p.breakSeconds + o, unknownBreaks: p.unknownBreaks }; });

    const out = {
      calls: metrics.calls.map(c => ({ ...c, outsideHours: eventPayload(c).outsideOperating === true || Date.parse(c.startedAt) >= operatingEnd })),
      performance: metrics.performance, summary: metrics.summary, timeline: metrics.timeline, breakTotals, completedBreaks, ongoingBreaks,
      historyAttribution: { summary: attribution.summary, rows: attribution.rows.filter(x => (!employee || x.employeeId === Number(employee)) && (!extension || x.extension === String(extension))) },
    };
    if (cache.size > 30) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  };
}

module.exports = { setup };
