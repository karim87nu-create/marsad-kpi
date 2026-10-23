'use strict';
const { RULES, businessDay, dayWindow, isOperating, validDate, iso } = require('./time');
const { analyzeSession, closure, parse } = require('./state');

const TIMELINE_TYPES = new Set(['session_login', 'session_logout', 'arabicss_logout', 'arabicss_login', 'break_start', 'break_end',
  'break_observed', 'break_end_unknown', 'call_observed', 'call_observed_end', 'page_closed']);
const DETAILS_LIMIT = 300;

function setup(app) {
  const { db, fail } = app;

  // Everything known about one data day, derived from sessions overlapping it.
  app.dayData = function dayData(date, now) {
    const w = dayWindow(date), until = Math.min(now, w.end);
    const sessions = db.prepare(`SELECT * FROM employee_sessions WHERE issued_at < ? AND MIN(COALESCE(revoked_at, expires_at), expires_at) >= ?
      ORDER BY issued_at`).all(w.end, w.start);
    const byEmployee = new Map(db.prepare('SELECT * FROM employees').all().map(e => [e.id, e]));
    const decisions = db.prepare('SELECT * FROM shift_decisions').all();
    const eventsFor = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY occurred_at, id');
    const analyzed = sessions.map(s => {
      const events = eventsFor.all(s.id);
      return { session: s, employee: byEmployee.get(s.employee_id), events, closure: s.revoked_at ? closure(s, decisions) : null, ...analyzeSession(s, events, now) };
    });
    return { date, window: w, until, now, analyzed, employees: byEmployee };
  };

  const clip = (a, b, w) => [Math.max(a, w.start), Math.min(b, w.end)];

  function presence(now) {
    const today = businessDay(now), w = dayWindow(today);
    const latest = db.prepare(`SELECT s.* FROM employee_sessions s WHERE s.id = (SELECT id FROM employee_sessions x WHERE x.employee_id = s.employee_id ORDER BY issued_at DESC, id DESC LIMIT 1)`).all();
    const decisions = db.prepare('SELECT * FROM shift_decisions').all();
    const eventsFor = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY occurred_at, id');
    const out = [];
    for (const e of db.prepare('SELECT * FROM employees WHERE deleted_at IS NULL AND active = 1').all()) {
      const s = latest.find(x => x.employee_id === e.id);
      const open = s && !s.revoked_at && s.expires_at > now;
      if (open) {
        const a = analyzeSession(s, eventsFor.all(s.id), now);
        const call = [...a.calls].reverse().find(c => !c.endedAt);
        const brk = a.breaks.find(b => b.running);
        const startedAt = a.state === 'on_call' ? call?.startedAt ?? null : a.state === 'break' ? brk?.start ?? null : a.stateSince;
        out.push({ id: s.id, employeeId: e.id, extension: s.extension, state: a.state === 'post_call' ? 'ready' : a.state,
          startedAt: iso(startedAt), phone: a.state === 'on_call' ? call?.phone || '' : '', queue: a.state === 'on_call' ? call?.queue || '' : '',
          callId: a.state === 'on_call' ? call?.callId || '' : '', evidenceAt: iso(a.lastEvidence), issuedAt: s.issued_at });
      } else if (s && (s.revoked_at ?? s.expires_at) >= w.start) {
        const c = closure(s, decisions);
        out.push({ id: s.id, employeeId: e.id, extension: s.extension, state: c.excluded ? 'shift_ended' : 'offline',
          startedAt: iso(s.revoked_at ?? s.expires_at), evidenceAt: iso(s.revoked_at ?? s.expires_at), issuedAt: s.issued_at, reason: c.reason });
      } else out.push({ id: 'none:' + e.id, employeeId: e.id, extension: '', state: 'no_session', evidenceAt: null, issuedAt: null });
    }
    return out;
  }
  app.presence = presence;

  function breakTotals(day, scope) {
    const totals = new Map();
    for (const a of day.analyzed.filter(scope)) {
      const t = totals.get(a.session.employee_id) || { employeeId: a.session.employee_id, completedBreakSeconds: 0, ongoingBreakSeconds: 0, unknownBreaks: 0 };
      for (const b of a.breaks) {
        if (b.start != null && b.end != null) {
          const [x, y] = clip(b.start, b.end, day.window);
          if (y > x) t.completedBreakSeconds += Math.round((y - x) / 1000);
        } else if (b.start != null && b.running) {
          const [x, y] = clip(b.start, day.until, day.window);
          if (y > x) t.ongoingBreakSeconds += Math.round((y - x) / 1000);
        } else if ((b.observedAt ?? 0) >= day.window.start && (b.observedAt ?? 0) < day.window.end) t.unknownBreaks++;
      }
      totals.set(t.employeeId, t);
    }
    return [...totals.values()].map(t => ({ ...t, totalBreakSeconds: t.completedBreakSeconds + t.ongoingBreakSeconds }));
  }
  app.breakTotals = breakTotals;

  function callRows(day, scope) {
    const rows = [];
    for (const a of day.analyzed.filter(scope)) for (const c of a.calls) {
      const t = c.startedAt ?? c.observedAt;
      if (t < day.window.start || t >= day.window.end) continue;
      const done = c.endedAt != null && c.durationSeconds != null;
      rows.push({ id: c.eventId, employeeId: a.session.employee_id, agentName: a.employee?.name || '', extension: c.extension,
        callType: c.callType || null, phone: c.phone, callId: c.callId, queue: c.queue,
        eventType: done ? 'agentunlinked' : 'agentlinked', startedAt: iso(c.startedAt ?? c.observedAt), occurredAt: iso(c.endedAt ?? c.observedAt),
        durationSeconds: done ? c.durationSeconds : null, outsideHours: !isOperating(t), attributionSource: 'extension', startKnown: c.startedAt != null });
    }
    return rows.sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt));
  }
  app.callRows = callRows;

  function attendance(day, scope) {
    const w = day.window, sessions = [], states = [], completedBreaks = [];
    for (const a of day.analyzed.filter(scope)) {
      const s = a.session, start = s.work_started_at ?? s.issued_at, end = s.revoked_at ?? Math.min(a.lastEvidence + RULES.presenceStaleMs, a.end);
      const [ds, de] = clip(start, a.running ? day.until : end, w);
      sessions.push({ id: s.id, employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, workStartedAt: s.work_started_at ?? null,
        startedAt: iso(Math.max(s.issued_at, w.start)), endedAt: iso(s.revoked_at), revokedAt: iso(s.revoked_at), observedThrough: iso(a.running ? day.until : end),
        lastSeen: a.lastEvidence, running: a.running && day.until === day.now, dayStart: w.start, dayEnd: w.end,
        daySeconds: s.work_started_at === null && !a.running ? 0 : Math.max(0, Math.round((de - ds) / 1000)),
        durationSeconds: Math.max(0, Math.round(((a.running ? day.until : end) - start) / 1000)),
        durationComplete: !!s.revoked_at, identityDelaySeconds: s.work_started_at ? Math.max(0, Math.round((s.work_started_at - s.issued_at) / 1000)) : null,
        closeReason: s.revoke_reason || null });
      const known = a.breaks.filter(b => b.start != null && b.end != null);
      for (const b of known) {
        const [x, y] = clip(b.start, b.end, w);
        if (y > x) completedBreaks.push({ employeeId: s.employee_id, extension: b.extension, state: 'break', startedAt: iso(x), endedAt: iso(y), durationSeconds: Math.round((y - x) / 1000), completedBreak: true });
      }
      a.spans.forEach((sp, i) => {
        let state = sp.state;
        if (state === 'break') {
          const b = a.breaks.find(b => (b.start ?? b.observedAt) <= sp.start + 1000 && (b.end == null || b.end >= sp.end - 1000));
          if (b && b.start != null && b.end != null) return;                     // shown as a completed break
          if (!(b && b.start != null && b.running)) state = 'break_unconfirmed';
        }
        const [x, y] = clip(sp.start, sp.end, w);
        if (y <= x) return;
        const last = i === a.spans.length - 1 && a.running && day.until === day.now;
        states.push({ employeeId: s.employee_id, extension: s.extension, state, startedAt: iso(x), endedAt: iso(y),
          durationSeconds: Math.round((y - x) / 1000), running: last, evidenceUntil: last ? a.lastEvidence + RULES.presenceStaleMs : y,
          completedBreak: false });
      });
    }
    return { sessions, states, completedBreaks };
  }
  app.attendance = attendance;

  function shifts(day, scope) {
    const out = [];
    for (const a of day.analyzed.filter(scope)) {
      const s = a.session;
      if (!s.revoked_at || s.revoked_at < day.window.start || s.revoked_at >= day.window.end) continue;
      const next = day.analyzed.find(b => b.session.employee_id === s.employee_id && b.session.issued_at >= s.revoked_at);
      out.push({ id: s.id, employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, revokedAt: s.revoked_at,
        continued: !!next, resumedAt: next ? iso(next.session.issued_at) : null, excluded: a.closure.excluded,
        reason: a.closure.reason, note: a.closure.note || '', effectiveAt: iso(s.revoked_at), decidedAt: a.closure.decidedAt ? iso(a.closure.decidedAt) : null });
    }
    return out;
  }
  app.shifts = shifts;

  function performance(day, scope, calls, totals) {
    const by = new Map();
    for (const a of day.analyzed.filter(scope)) {
      const id = a.session.employee_id, p = by.get(id) || { employeeId: id, employee: a.employee?.name || '', calls: 0, inbound: 0, outbound: 0, answered: 0, handle: 0, firstLogin: null, lastLogout: null };
      p.firstLogin = p.firstLogin == null ? a.session.issued_at : Math.min(p.firstLogin, a.session.issued_at);
      if (a.session.revoked_at) p.lastLogout = Math.max(p.lastLogout ?? 0, a.session.revoked_at);
      by.set(id, p);
    }
    for (const c of calls) {
      const p = by.get(c.employeeId);
      if (!p) continue;
      p.calls++;
      if (c.callType === 'outgoing') p.outbound++; else if (c.callType === 'incoming') p.inbound++;
      if (c.eventType === 'agentunlinked') { p.answered++; p.handle += c.durationSeconds || 0; }
    }
    return [...by.values()].map(p => {
      const t = totals.find(x => x.employeeId === p.employeeId);
      return { employeeId: p.employeeId, employee: p.employee, calls: p.calls, inbound: p.inbound, outbound: p.outbound, answered: p.answered,
        avgHandleTime: p.answered ? p.handle / p.answered : 0, firstLogin: iso(p.firstLogin), lastLogout: iso(p.lastLogout),
        breakSeconds: t?.completedBreakSeconds || 0, unknownBreaks: t?.unknownBreaks || 0 };
    });
  }

  function timeline(day, scope) {
    const rows = [], durations = [];
    for (const a of day.analyzed.filter(scope)) for (const e of a.events) {
      if (!TIMELINE_TYPES.has(e.event_type) || e.occurred_at < day.window.start || e.occurred_at >= day.window.end) continue;
      rows.push({ id: e.id, employeeId: e.employee_id, extension: e.extension, eventType: e.event_type, occurredAt: iso(e.occurred_at),
        durationSeconds: e.duration_seconds, state: e.state, reason: parse(e.payload).state || e.state || null });
      if (e.event_type === 'session_login') durations.push({ eventId: e.id, durationKind: 'session', durationSeconds: Math.round(((a.session.revoked_at ?? Math.min(day.until, a.end)) - e.occurred_at) / 1000), complete: !!a.session.revoked_at });
      else if (e.event_type === 'break_end') durations.push({ eventId: e.id, durationKind: 'break', durationSeconds: e.duration_seconds, complete: true });
      else if (['break_end_unknown', 'break_observed', 'call_observed', 'call_observed_end'].includes(e.event_type)) durations.push({ eventId: e.id, durationKind: 'unknown', durationSeconds: null, complete: false });
      else durations.push({ eventId: e.id, durationKind: 'transition', durationSeconds: null, complete: true });
    }
    return { rows: rows.sort((x, y) => Date.parse(y.occurredAt) - Date.parse(x.occurredAt)), durations };
  }

  app.scopeFilter = (employee, extension) => a =>
    (!employee || a.session.employee_id === Number(employee)) && (!extension || a.session.extension === String(extension));

  app.route('GET', '/api/dashboard', ctx => {
    app.requireAdmin(ctx);
    const q = ctx.query, today = businessDay(ctx.now), date = q.date || today;
    if (!validDate(date) || date > today) fail(400, 'تاريخ غير صحيح');
    const live = q.live === '1', wantAttendance = q.attendance === '1';
    const out = { today, serverNow: iso(ctx.now), date, presence: presence(ctx.now) };
    if (q.employee) out.presence = out.presence.filter(p => p.employeeId === Number(q.employee));
    if (q.extension) out.presence = out.presence.filter(p => p.extension === String(q.extension));
    const day = app.dayData(date, ctx.now), scope = app.scopeFilter(q.employee, q.extension);
    const totals = breakTotals(day, scope);
    out.breakTotals = totals;
    if (live && !wantAttendance) return { ...out, liveOnly: true };
    let calls = callRows(day, scope);
    const attribution = app.historyAttribution ? app.historyAttribution(day, scope) : null;
    if (attribution) calls = [...calls, ...attribution.recoveredCalls].sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt));
    const t = timeline(day, scope);
    Object.assign(out, {
      performance: performance(day, scope, calls, totals),
      calls: q.all === '1' ? calls : calls.slice(0, DETAILS_LIMIT), detailsTruncated: q.all !== '1' && calls.length > DETAILS_LIMIT,
      timeline: t.rows, durations: t.durations, shifts: shifts(day, scope),
      historyAttribution: attribution ? { summary: attribution.summary, rows: attribution.rows } : null,
    });
    if (wantAttendance || !live) {
      const at = attendance(day, scope);
      out.attendance = { sessions: at.sessions, states: at.states };
      out.completedBreaks = at.completedBreaks;
    }
    return out;
  });
}

module.exports = { setup };
