'use strict';
const { RULES, businessDay, dayWindow, isOperating, validDate, iso } = require('./time');
const { analyzeSession, closure, parse } = require('./state');

const TIMELINE_TYPES = new Set(['session_login', 'session_logout', 'arabicss_logout', 'arabicss_login', 'break_start', 'break_end',
  'break_observed', 'break_end_unknown', 'call_observed', 'call_observed_end', 'page_closed']);
const DETAILS_LIMIT = 300;

function setup(app) {
  const { db, fail } = app;

  // Everything known about one data day, derived from sessions overlapping it.
  // Everything known about one data day. Session analysis is computed only when a caller needs it,
  // so the per-second live view (presence + break totals) stays cheap.
  app.dayData = function dayData(date, now) {
    const w = dayWindow(date), until = Math.min(now, w.end);
    const byEmployee = new Map(db.prepare('SELECT * FROM employees').all().map(e => [e.id, e]));
    let analyzed = null;
    const day = { date, window: w, until, now, employees: byEmployee };
    Object.defineProperty(day, 'analyzed', { enumerable: true, get() {
      if (analyzed) return analyzed;
      const sessions = db.prepare(`SELECT * FROM employee_sessions WHERE issued_at < ? AND MIN(COALESCE(revoked_at, expires_at), expires_at) >= ?
        ORDER BY issued_at`).all(w.end, w.start);
      const decisions = db.prepare('SELECT * FROM shift_decisions').all();
      const eventsFor = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY occurred_at, id');
      analyzed = sessions.map(s => {
        const events = eventsFor.all(s.id);
        return { session: s, employee: byEmployee.get(s.employee_id), events, closure: s.revoked_at ? closure(s, decisions) : null, ...analyzeSession(s, events, now) };
      });
      return analyzed;
    } });
    return day;
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

  // ---- Calls and breaks follow the old server's rules exactly (lib/dashboard-metrics.ts,
  // lib/break-accounting.ts, app/api/dashboard/route.ts) so numbers do not change on migration.
  const canonicalCallId = id => (String(id).match(/(?:incoming-q\d+-|outgoing-)?(\d+)$/) || [])[1] || String(id);
  const evScope = scope => e => scope({ session: { employee_id: e.employee_id, extension: e.extension } });
  const DAY = 86400000;

  function canonicalBreaks(periods, start, end) {
    const rows = periods.map(p => ({ ...p, a: Math.max(start, p.start), b: Math.min(end, p.end) })).filter(p => p.employeeId && p.b > p.a)
      .sort((x, y) => x.employeeId - y.employeeId || String(x.extension).localeCompare(String(y.extension)) || x.a - y.a);
    const out = [];
    for (const p of rows) {
      const last = out.at(-1);
      if (last && last.employeeId === p.employeeId && last.extension === p.extension && p.a < last.b) { last.b = Math.max(last.b, p.b); last.running = last.running || p.running; last.completedBreak = last.completedBreak && p.completedBreak; }
      else out.push({ ...p });
    }
    return out.map(p => ({ employeeId: p.employeeId, extension: p.extension, state: 'break', startedAt: iso(p.a), endedAt: iso(p.b), durationSeconds: Math.floor((p.b - p.a) / 1000),
      running: !!p.running, completedBreak: !!p.completedBreak, evidenceUntil: p.evidenceUntil ?? p.b }));
  }

  function dayBreaks(day, scope) {
    if (day._breaks?.scope === scope) return day._breaks;
    const w = day.window, inScope = evScope(scope);
    const ends = db.prepare("SELECT * FROM events WHERE event_type = 'break_end' AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at").all(w.start, w.end + DAY).filter(inScope);
    const completed = canonicalBreaks(ends.filter(e => e.duration_seconds > 0 && e.occurred_at <= day.now)
      .map(e => ({ employeeId: e.employee_id, extension: e.extension, start: e.occurred_at - e.duration_seconds * 1000, end: e.occurred_at, completedBreak: true })), w.start, w.end);
    const live = day.now >= w.start && day.now < w.end ? presence(day.now).filter(p => p.state === 'break' && p.startedAt && scope({ session: { employee_id: p.employeeId, extension: p.extension } })) : [];
    const ongoing = canonicalBreaks(live.map(p => ({ employeeId: p.employeeId, extension: p.extension, start: Date.parse(p.startedAt), end: day.now, running: true,
      completedBreak: false, evidenceUntil: Date.parse(p.evidenceAt || '') + RULES.presenceStaleMs })), w.start, Math.min(w.end, day.now));
    day._breaks = { scope, completed, ongoing };
    return day._breaks;
  }

  function breakTotals(day, scope) {
    const w = day.window, { completed, ongoing } = dayBreaks(day, scope);
    const seconds = (list, id) => list.filter(b => b.employeeId === id).reduce((n, b) => n + Math.max(0, Math.floor((Math.min(Date.parse(b.endedAt), w.operatingEnd) - Math.max(Date.parse(b.startedAt), w.start)) / 1000)), 0);
    const unknown = db.prepare("SELECT employee_id, extension FROM events WHERE event_type = 'break_end_unknown' AND occurred_at >= ? AND occurred_at < ?").all(w.start, Math.min(w.end, w.operatingEnd)).filter(evScope(scope));
    const ids = new Set([...completed, ...ongoing].map(b => b.employeeId).concat(unknown.map(u => u.employee_id)));
    return [...ids].map(id => {
      const c = seconds(completed, id), o = seconds(ongoing, id);
      return { employeeId: id, completedBreakSeconds: c, ongoingBreakSeconds: o, totalBreakSeconds: c + o, unknownBreaks: unknown.filter(u => u.employee_id === id).length };
    });
  }
  app.breakTotals = breakTotals;

  function callRows(day, scope) {
    const w = day.window, groups = new Map();
    const evs = db.prepare("SELECT * FROM events WHERE event_type IN ('agentlinked','agentunlinked') AND call_id IS NOT NULL AND call_id <> '' AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, id")
      .all(w.start - DAY, w.end + DAY).filter(evScope(scope));
    for (const e of evs) {
      const key = e.employee_id + ':' + e.extension + ':' + canonicalCallId(e.call_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const names = day.employees, rows = [];
    for (const list of groups.values()) {
      const first = list.find(e => e.event_type === 'agentlinked'), ends = list.filter(e => e.event_type === 'agentunlinked');
      const e = ends.at(-1) || list.at(-1);
      const at = first ? first.occurred_at : e.occurred_at - (e.duration_seconds || 0) * 1000;
      if (!(at >= w.start && at < w.end)) continue;
      rows.push({ id: e.id, employeeId: e.employee_id, agentName: names.get(e.employee_id)?.name || '', extension: e.extension,
        callType: ['incoming', 'outgoing'].includes(e.call_type) ? e.call_type : null, phone: e.phone || '', callId: canonicalCallId(e.call_id), queue: (first || e).queue || '',
        eventType: e.event_type, startedAt: iso(at), occurredAt: iso(e.occurred_at), durationSeconds: e.duration_seconds ?? 0,
        outsideHours: at >= w.operatingEnd, attributionSource: 'extension', startKnown: !!first });
    }
    return rows.sort((x, y) => Date.parse(y.occurredAt) - Date.parse(x.occurredAt) || y.id - x.id);
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
      a.spans.forEach((sp, i) => {
        const [x, y] = clip(sp.start, sp.end, w);
        if (y <= x) return;
        const last = i === a.spans.length - 1 && a.running && day.until === day.now;
        states.push({ employeeId: s.employee_id, extension: s.extension, state: sp.state, startedAt: iso(x), endedAt: iso(y),
          durationSeconds: Math.floor((y - x) / 1000), running: last, evidenceUntil: last ? a.lastEvidence + RULES.presenceStaleMs : y, completedBreak: false });
      });
    }
    // Breaks come from recorded break ends; other "break" spans become unconfirmed (old reconcileBreakStates).
    const { completed, ongoing } = dayBreaks(day, scope), breaks = [...completed, ...ongoing];
    const keyOf = x => x.employeeId + '|' + x.extension, group = list => { const m = new Map(); for (const x of list) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
    const breaksBy = group(breaks);
    let reconciled = [];
    for (const st of states) {
      let pieces = [[Date.parse(st.startedAt), Date.parse(st.endedAt)]];
      for (const b of breaksBy.get(keyOf(st)) || []) {
        const x = Date.parse(b.startedAt), y = Date.parse(b.endedAt);
        if (y <= pieces[0][0] || x >= pieces.at(-1)[1]) continue;
        pieces = pieces.flatMap(([u, v]) => (y <= u || x >= v ? [[u, v]] : [[u, Math.min(x, v)], [Math.max(y, u), v]].filter(([p, q]) => q > p)));
        if (!pieces.length) break;
      }
      for (const [u, v] of pieces) reconciled.push({ ...st, state: st.state === 'break' ? 'break_unconfirmed' : st.state, startedAt: iso(u), endedAt: iso(v),
        durationSeconds: Math.floor((v - u) / 1000), running: st.running && v === Date.parse(st.endedAt) });
    }
    // Completed calls fill "انقطاع رصد" gaps they prove (old dashboard rule). Only unknown spans can change.
    const callsBy = group(callRows(day, scope).filter(c => c.eventType === 'agentunlinked' && c.durationSeconds > 0)
      .map(c => ({ employeeId: c.employeeId, extension: c.extension, a: Date.parse(c.startedAt), b: Math.min(Date.parse(c.occurredAt), Date.parse(c.startedAt) + c.durationSeconds * 1000) })));
    reconciled = reconciled.flatMap(st => {
      if (st.state !== 'unknown') return [st];
      let parts = [st];
      for (const c of callsBy.get(keyOf(st)) || []) {
        parts = parts.flatMap(p => {
          const x = Date.parse(p.startedAt), y = Date.parse(p.endedAt), u = Math.max(x, c.a), v = Math.min(y, c.b);
          if (p.state !== 'unknown' || v <= u) return [p];
          return [[x, u, 'unknown'], [u, v, 'on_call'], [v, y, 'unknown']].filter(([q, r]) => r > q)
            .map(([q, r, state]) => ({ ...p, state, startedAt: iso(q), endedAt: iso(r), durationSeconds: Math.floor((r - q) / 1000), running: false }));
        });
      }
      return parts;
    });
    states.length = 0;
    states.push(...reconciled, ...breaks);
    completedBreaks.push(...completed);
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
    const w = day.window, by = new Map(), names = day.employees;
    const get = id => {
      if (!by.has(id)) by.set(id, { employeeId: id, employee: names.get(id)?.name || '', calls: 0, inbound: 0, outbound: 0, answered: 0, talk: 0, firstLogin: null, lastLogout: null });
      return by.get(id);
    };
    const evs = db.prepare("SELECT employee_id, extension, event_type, occurred_at FROM events WHERE event_type NOT IN ('heartbeat','agentlinked','agentunlinked') AND occurred_at >= ? AND occurred_at < ?")
      .all(w.start, Math.min(w.end, w.operatingEnd)).filter(evScope(scope));
    for (const e of evs) {
      const p = get(e.employee_id);
      if (e.event_type === 'session_login' && /^\d+$/.test(e.extension || '') && (p.firstLogin == null || e.occurred_at < p.firstLogin)) p.firstLogin = e.occurred_at;
      if (['session_logout', 'arabicss_logout'].includes(e.event_type) && (p.lastLogout == null || e.occurred_at > p.lastLogout)) p.lastLogout = e.occurred_at;
    }
    for (const c of calls) {
      if (c.outsideHours || Date.parse(c.startedAt) >= w.operatingEnd) continue;
      const p = get(c.employeeId);
      p.calls++;
      if (c.callType === 'incoming') p.inbound++; else if (c.callType === 'outgoing') p.outbound++;
      if (c.eventType === 'agentunlinked') { p.answered++; p.talk += c.durationSeconds || 0; }
    }
    for (const t of totals) get(t.employeeId);
    return [...by.values()].map(p => {
      const t = totals.find(x => x.employeeId === p.employeeId);
      return { employeeId: p.employeeId, employee: p.employee, calls: p.calls, inbound: p.inbound, outbound: p.outbound, answered: p.answered,
        avgHandleTime: p.answered ? Math.round(p.talk / p.answered) : 0, firstLogin: iso(p.firstLogin), lastLogout: iso(p.lastLogout),
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
