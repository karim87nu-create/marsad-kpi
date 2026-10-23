'use strict';
// Attendance (sessions and state durations), live presence and the full /api/dashboard response,
// computed the way the old app/api/dashboard/route.ts and lib/dashboard-presence.ts did,
// using the old logic files in src/legacy-logic. This module only reads this server's tables
// in the shape that logic expects.
const L = require('./legacy-logic/attendance-logic');
const { shiftAt } = require('./legacy-logic/shift-responsibility');
const { operationalState } = require('./legacy-logic/operational-state');
const { eventPayload } = require('./legacy-logic/dashboard-logic');
const { dashboardEvent } = require('./old-shape');
const { dayWindow, iso, businessDay } = require('./time');

const OLD_EXIT = { manual: 'explicit_logout' };
const reason = r => OLD_EXIT[r] || r || null;
const PRESENCE_TYPES = "('heartbeat','session_login','session_logout','arabicss_login','arabicss_logout','page_closed','break_start','break_observed','break_end','break_end_unknown','agentlinked','agentunlinked','call_observed','call_observed_end')";
const SPAN_TYPES = "('heartbeat','session_login','arabicss_login','break_start','break_observed','break_end','break_end_unknown','agentlinked','agentunlinked','call_observed','call_observed_end','page_closed')";

function setup(app) {
  const { db } = app;
  const names = () => new Map(db.prepare('SELECT id, name FROM employees').all().map(e => [e.id, e]));

  // lib/attendance-durations.ts attendanceData()
  app.oldAttendance = function oldAttendance(date, { employee = '', extension = '' } = {}, now = app.now()) {
    const { start, end } = dayWindow(date);
    const sessions = db.prepare(`SELECT * FROM employee_sessions WHERE issued_at < ? AND COALESCE(revoked_at, expires_at) > ?
        AND (? = '' OR employee_id = ?) AND (? = '' OR extension = ?) ORDER BY issued_at`).all(end, start, employee, Number(employee), extension, extension)
      .map(s => ({ id: String(s.id), employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, lastSeen: s.last_seen, expiresAt: s.expires_at, revokedAt: s.revoked_at ?? null, reason: reason(s.revoke_reason) }));
    const spans = db.prepare(`WITH raw AS (
        SELECT id, CAST(session_id AS TEXT) sessionId, employee_id employeeId, extension, (occurred_at / 1000) * 1000 at,
          CASE WHEN event_type = 'heartbeat' THEN COALESCE(state, 'unknown') WHEN event_type IN ('session_login','arabicss_login') THEN 'logged_in'
            WHEN event_type IN ('break_start','break_observed') THEN 'break' WHEN event_type IN ('agentlinked','call_observed') THEN 'on_call'
            WHEN event_type IN ('agentunlinked','call_observed_end') THEN 'post_call' WHEN event_type IN ('break_end','break_end_unknown') THEN 'ready' ELSE 'unknown' END state
        FROM events WHERE occurred_at >= ? AND occurred_at < ? AND event_type IN ${SPAN_TYPES} AND (? = '' OR employee_id = ?) AND (? = '' OR extension = ?)
      ), previous AS (SELECT *, LAG(state) OVER (PARTITION BY sessionId ORDER BY at, id) prevState, LAG(at) OVER (PARTITION BY sessionId ORDER BY at, id) prevAt FROM raw),
      numbered AS (SELECT *, SUM(CASE WHEN prevState IS NULL OR state <> prevState OR at - prevAt >= 90000 THEN 1 ELSE 0 END) OVER (PARTITION BY sessionId ORDER BY at, id ROWS UNBOUNDED PRECEDING) grp FROM previous)
      SELECT sessionId, employeeId, extension, state, MIN(at) started, MAX(at) lastEvidence FROM numbered GROUP BY sessionId, grp, state ORDER BY started`)
      .all(start - 12 * 3600000, Math.min(end, now + 1), employee, Number(employee), extension, extension);
    const bySession = new Map();
    for (const p of spans) { if (!bySession.has(p.sessionId)) bySession.set(p.sessionId, []); bySession.get(p.sessionId).push(p); }
    for (const s of sessions) {
      const first = (bySession.get(s.id) || []).filter(p => /^\d+$/.test(p.extension) && ['ready', 'on_call'].includes(p.state) && p.started >= s.issuedAt && p.started < Math.min(s.revokedAt ?? s.expiresAt, now + 1)).sort((a, b) => a.started - b.started)[0];
      s.workStartedAt = first?.started ?? null;
    }
    return { sessions: L.sessionDurations(sessions, start, end, now), states: L.stateDurations(spans, sessions, start, end, now) };
  };

  // lib/dashboard-presence.ts dashboardPresence() + the shift_ended override both old routes applied.
  app.oldPresence = function oldPresence(date, now = app.now(), { shiftOverride = true } = {}) {
    const { start, end: finish } = dayWindow(date), n = names();
    const states = db.prepare(`SELECT * FROM events WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY employee_id, session_id ORDER BY occurred_at DESC, id DESC) rn
        FROM events WHERE occurred_at >= ? AND event_type IN ${PRESENCE_TYPES}) WHERE rn = 1)`).all(now - 12 * 3600000).map(e => dashboardEvent(e, n));
    const latest = new Map();
    for (const e of states) { const sid = eventPayload(e).sessionId, x = latest.get(sid); if (!x || Date.parse(e.occurredAt) > Date.parse(x.occurredAt)) latest.set(sid, e); }
    const sessions = db.prepare('SELECT * FROM employee_sessions WHERE revoked_at IS NULL').all()
      .map(s => ({ id: String(s.id), employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, lastSeen: s.last_seen, expiresAt: s.expires_at, revokedAt: null }));
    const presence = sessions.sort((a, b) => b.issuedAt - a.issuedAt).filter((s, i, all) => all.findIndex(x => x.employeeId === s.employeeId) === i).map(s => {
      const last = latest.get(s.id), p = last ? eventPayload(last) : {};
      const fresh = s.expiresAt > now && now - s.lastSeen < 90000 && last && now - Date.parse(last.occurredAt) < 90000;
      const identityOnly = s.expiresAt > now && !/^\d{1,10}$/.test(String(s.extension || '')) && !/^\d{1,10}$/.test(String(last?.extension || '')) && !['page_closed', 'session_logout', 'arabicss_logout'].includes(last?.eventType || '');
      const state = identityOnly ? 'logged_in' : !fresh ? 'unknown' : operationalState(last.eventType, p, String(last.extension || s.extension || ''));
      const data = { ...(p.payload && typeof p.payload === 'object' ? p.payload : {}), ...p };
      const startValue = state === 'break' ? data.breakStartedAt : state === 'on_call' ? data.callStartedAt : null;
      const parsed = typeof startValue === 'number' ? startValue : Date.parse(String(startValue || (['break_start', 'agentlinked'].includes(last?.eventType || '') ? last?.occurredAt : '')));
      const known = Number.isFinite(parsed) && parsed >= s.issuedAt - 1000 && parsed <= now;
      return { ...s, state, identityOnly, notReadyObserved: !!fresh && state === 'unknown' && data.sourceConnection === 'connected' && data.waitingOrHeld === true,
        closureKind: last?.eventType === 'page_closed' ? 'page_unavailable' : '', sourceConnection: String(data.sourceConnection || 'unknown'), evidenceAt: last?.occurredAt || null,
        startedAt: known ? new Date(parsed).toISOString() : null, elapsedSeconds: known ? Math.max(0, Math.floor((now - parsed) / 1000)) : null,
        phone: data.phone || last?.phone || '', callId: data.callId || last?.callId || '', callType: data.callType || last?.callType || '', queue: data.queue || '' };
    });
    // Addition to the old logic: when the newest event (e.g. a source-evidence heartbeat) does not carry the
    // call or break details, take them from the event that does in the same session, so the live view keeps
    // the phone and the start time instead of flickering to blank. The state itself is unchanged.
    const recent = db.prepare('SELECT * FROM events WHERE session_id = ? AND occurred_at >= ? ORDER BY occurred_at DESC, id DESC LIMIT 300');
    for (const p of presence) {
      if (!['on_call', 'break'].includes(p.state) || (p.startedAt && (p.state === 'break' || p.phone))) continue;
      for (const e of recent.all(Number(p.id), now - 12 * 3600000).map(x => dashboardEvent(x, n))) {
        const x = eventPayload(e), d = { ...(x.payload && typeof x.payload === 'object' ? x.payload : {}), ...x };
        if (p.state === 'on_call') {
          if (['agentunlinked', 'call_observed_end'].includes(e.eventType)) break;
          const at = e.eventType === 'agentlinked' ? Date.parse(e.occurredAt) : typeof d.callStartedAt === 'number' ? d.callStartedAt : NaN;
          if (!(Number.isFinite(at) && at >= p.issuedAt - 1000 && at <= now) && !d.phone) continue;
          if (!p.startedAt && Number.isFinite(at) && at >= p.issuedAt - 1000 && at <= now) { p.startedAt = new Date(at).toISOString(); p.elapsedSeconds = Math.max(0, Math.floor((now - at) / 1000)); }
          p.phone ||= d.phone || e.phone || ''; p.callId ||= d.callId || e.callId || ''; p.callType ||= d.callType || e.callType || ''; p.queue ||= d.queue || '';
          if (p.startedAt && p.phone) break;
        } else {
          if (['break_end', 'break_end_unknown'].includes(e.eventType)) break;
          const at = e.eventType === 'break_start' ? Date.parse(e.occurredAt) : typeof d.breakStartedAt === 'number' ? d.breakStartedAt : Date.parse(String(d.breakStartedAt || ''));
          if (Number.isFinite(at) && at >= p.issuedAt - 1000 && at <= now) { p.startedAt = new Date(at).toISOString(); p.elapsedSeconds = Math.max(0, Math.floor((now - at) / 1000)); break; }
        }
      }
    }
    const roster = db.prepare('SELECT id, name, employee_code FROM employees WHERE active = 1 AND deleted_at IS NULL').all();
    for (const employee of roster) {
      if (presence.some(p => p.employeeId === employee.id)) continue;
      const last = states.filter(e => Number(eventPayload(e).employeeId) === employee.id).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
      const closed = last && ['session_logout', 'arabicss_logout'].includes(last.eventType);
      const interrupted = closed && ['tab_closed', 'browser_restarted', 'extension_restarted', 'unapproved_disconnect'].includes(String(eventPayload(last).state));
      const browserClosed = closed && ['tab_closed', 'browser_restarted'].includes(String(eventPayload(last).state));
      presence.push({ id: '', employeeId: employee.id, extension: last?.extension || '', issuedAt: 0, lastSeen: 0, expiresAt: 0, revokedAt: null,
        state: browserClosed ? 'offline' : interrupted ? 'unknown' : closed ? 'offline' : 'no_session', identityOnly: false, notReadyObserved: false,
        closureKind: browserClosed ? 'browser_closed' : last?.eventType === 'page_closed' ? 'page_unavailable' : '', sourceConnection: 'unknown',
        evidenceAt: closed ? last.occurredAt : null, startedAt: interrupted ? last.occurredAt : null,
        elapsedSeconds: interrupted ? Math.max(0, Math.floor((now - Date.parse(last.occurredAt)) / 1000)) : null, phone: '', callId: '', callType: '', queue: '' });
    }
    const shiftData = app.oldShiftData(start - 12 * 3600000, Math.max(finish, now));
    if (shiftOverride) for (const p of presence) { const r = shiftAt(shiftData, p.employeeId, now); if (r?.excluded) { p.state = 'shift_ended'; p.evidenceAt = new Date(r.effectiveAt).toISOString(); } }
    return { presence, shiftData };
  };

  // Live branch: presence reconciled with the Arabicss live-calls snapshot (lib/live-presence-reconciliation.ts).
  app.oldLivePresence = function oldLivePresence(date, now = app.now()) {
    const { presence } = app.oldPresence(date, now), live = app.latestLive();
    const snapshot = live ? { observedAt: iso(live.observed_at), records: live.rows } : null;
    return { presence: L.reconcileLiveCallStates(presence, snapshot, now), liveQueue: snapshot ? { observedAt: snapshot.observedAt, records: JSON.parse(snapshot.records), stale: now - live.observed_at >= 30000 } : null };
  };

  // Shift closures shown on the day (old route `shifts`).
  function oldShifts(shiftData, start, finish, now, employee, extension) {
    return shiftData.sessions.filter(s => s.revokedAt !== null && s.revokedAt >= start && s.revokedAt < finish && (!employee || s.employeeId === Number(employee)) && (!extension || s.extension === extension)).map(s => {
      const next = shiftData.sessions.filter(x => x.employeeId === s.employeeId && x.issuedAt > s.issuedAt && x.issuedAt <= Math.min(now, finish)).sort((a, b) => a.issuedAt - b.issuedAt)[0];
      const responsibility = shiftAt(shiftData, s.employeeId, Math.max(s.revokedAt, Math.min(now, finish - 1)));
      return { ...s, ...responsibility, extension: s.extension, sessionId: s.id, continued: !!next, resumedAt: next ? new Date(next.issuedAt).toISOString() : null, ...(next ? { excluded: false, reason: 'work_resumed' } : {}) };
    });
  }

  // The full (non-live) old /api/dashboard response.
  app.oldDashboard = function oldDashboard(date, { employee = '', extension = '', attendance: wantAttendance = false, all = false } = {}, now = app.now()) {
    const { start, end: finish, operatingEnd } = dayWindow(date);
    const old = app.oldDay(date, { employee, extension }, now);
    const { presence, shiftData } = app.oldPresence(date, now);
    let attendance = null, durations = [];
    if (wantAttendance) {
      attendance = app.oldAttendance(date, { employee, extension }, now);
      durations = L.attendanceTimeline([...old.events, ...old.breakEnds.filter(e => !old.events.some(x => x.id === e.id))], attendance.sessions, now);
      attendance.states = L.reconcileBreakStates(attendance.states, [...old.completedBreaks, ...old.ongoingBreaks]);
      // Completed, identity-attributed calls can restore missing state intervals (old route).
      for (const call of old.calls.filter(c => c.eventType === 'agentunlinked' && c.durationSeconds > 0 && c.timePrecision === 'second')) {
        const a = Date.parse(call.startedAt), b = Math.min(Date.parse(call.occurredAt), a + call.durationSeconds * 1000);
        attendance.states = attendance.states.flatMap(s => {
          const x = Date.parse(s.startedAt), y = Date.parse(s.endedAt), u = Math.max(x, a), v = Math.min(y, b);
          if (s.state !== 'unknown' || s.employeeId !== call.employeeId || s.extension !== call.extension || v <= u) return [s];
          return [[x, u, 'unknown'], [u, v, 'on_call'], [v, y, 'unknown']].filter(([p, q]) => q > p)
            .map(([p, q, state]) => ({ ...s, state, startedAt: new Date(p).toISOString(), endedAt: new Date(q).toISOString(), durationSeconds: Math.floor((q - p) / 1000), running: false }));
        });
      }
    }
    const shifts = oldShifts(shiftData, start, finish, now, employee, extension);
    const numbered = p => /^\d+$/.test(String(p.extension || ''));
    const loggedIn = presence.filter(p => numbered(p) && ['ready', 'break', 'on_call'].includes(p.state)).length;
    const available = presence.filter(p => numbered(p) && p.state === 'ready').length;
    return {
      performance: old.performance, historyAttribution: old.historyAttribution,
      summary: { ...old.summary, active: presence.filter(p => p.state === 'on_call').length, loggedIn, available, connectorOnline: loggedIn > 0, asa: null, sla: null, slaThresholdSeconds: 10,
        abandonmentRate: null, abandoned: 0, queueMetricsAvailable: false, ahtAvailable: false },
      calls: all ? old.calls : old.calls.slice(0, 300),
      timeline: (all ? old.timeline : old.timeline.slice(0, 500)).map(e => ({ ...e, outsideHours: Date.parse(e.occurredAt) >= operatingEnd })),
      presence, shifts, attendance, durations, completedBreaks: old.completedBreaks, breakTotals: old.breakTotals, dataComplete: true,
      detailsTruncated: !all && (old.calls.length > 300 || old.timeline.length > 500), date, today: businessDay(now), serverNow: new Date(now).toISOString(),
    };
  };
}

module.exports = { setup };
