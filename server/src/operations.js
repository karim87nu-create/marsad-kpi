'use strict';
const crypto = require('node:crypto');
const { RULES, businessDay, dayWindow, validDate, addDays, iso, isOperating } = require('./time');
const A = require('./arabicss');

const BUCKET_MS = 30 * 60000;
const STATUSES = ['new', 'working', 'resolved', 'reviewed'];

function setup(app) {
  const { db, fail } = app;

  const overlapSeconds = (a, b, x, y) => Math.max(0, Math.min(b, y) - Math.max(a, x)) / 1000;

  function compute(date, extension, queue, now) {
    const day = app.dayData(date, now), w = day.window;
    const opEnd = Math.min(w.operatingEnd, now);
    const scope = app.scopeFilter(null, extension);
    const att = app.attendance(day, scope);
    const totals = app.breakTotals(day, scope);
    const attribution = app.historyAttribution(day, scope);
    const calls = [...app.callRows(day, scope), ...(attribution?.recoveredCalls || [])];
    const h = app.dayHistory(date, now);
    const records = h.records.filter(r => !queue || r.queue === queue);

    // Spans for analysis: every state (breaks included) within operating hours.
    const spans = [];
    for (const a of day.analyzed.filter(scope)) for (const s of a.spans) {
      const x = Math.max(s.start, w.start), y = Math.min(s.end, w.end);
      if (y > x) spans.push({ employeeId: a.session.employee_id, extension: a.session.extension, state: s.state, start: x, end: y, sessionRunning: a.running });
    }
    const opSeconds = (list, state) => list.filter(s => s.state === state).reduce((n, s) => n + overlapSeconds(s.start, s.end, w.start, opEnd), 0);

    const profiles = [...new Set(day.analyzed.filter(scope).map(a => a.session.employee_id))].map(id => {
      const e = day.employees.get(id) || {}, mine = spans.filter(s => s.employeeId === id);
      const t = totals.find(x => x.employeeId === id) || { completedBreakSeconds: 0, ongoingBreakSeconds: 0, totalBreakSeconds: 0 };
      const myCalls = calls.filter(c => c.employeeId === id), done = myCalls.filter(c => c.eventType === 'agentunlinked');
      const ready = opSeconds(mine, 'ready'), onCall = opSeconds(mine, 'on_call'), unknown = opSeconds(mine, 'unknown');
      const sessions = att.sessions.filter(s => s.employeeId === id);
      const observedTotal = mine.reduce((n, s) => n + overlapSeconds(s.start, s.end, w.start, opEnd), 0);
      return {
        id, name: e.name || '', employeeCode: e.employee_code || '',
        sessionSeconds: sessions.reduce((n, s) => n + s.daySeconds, 0),
        readySeconds: Math.round(ready), callSeconds: Math.round(onCall), unknownSeconds: Math.round(unknown),
        breakSeconds: t.totalBreakSeconds, completedBreakSeconds: t.completedBreakSeconds, ongoingBreakSeconds: t.ongoingBreakSeconds,
        breakRemainingSeconds: Math.max(0, RULES.breakBudgetSeconds - t.totalBreakSeconds), breakExcessSeconds: Math.max(0, t.totalBreakSeconds - RULES.breakBudgetSeconds),
        calls: myCalls.length, averageCallSeconds: done.length ? done.reduce((n, c) => n + (c.durationSeconds || 0), 0) / done.length : null,
        longCalls: done.filter(c => c.durationSeconds > RULES.callAlertSeconds).length,
        callExcessSeconds: done.reduce((n, c) => n + Math.max(0, (c.durationSeconds || 0) - RULES.callAlertSeconds), 0),
        occupancy: ready + onCall ? onCall / (ready + onCall) * 100 : null,
        callsPerReadyHour: ready ? myCalls.length / (ready / 3600) : null,
        observedPercent: observedTotal ? (observedTotal - unknown) / observedTotal * 100 : null,
        smallSample: myCalls.length < 10 || ready + onCall < 3600,
        transitions: day.analyzed.filter(a => a.session.employee_id === id && scope(a)).map(a => {
          const readyAt = a.spans.find(s => ['ready', 'on_call'].includes(s.state))?.start ?? null;
          return { sessionId: a.session.id, loginAt: iso(a.session.issued_at), boundAt: iso(a.session.bound_at), readyAt: iso(readyAt),
            delaySeconds: readyAt ? Math.round((readyAt - a.session.issued_at) / 1000) : null, logoutAt: iso(a.session.revoked_at) };
        }),
      };
    });

    // Half-hour pressure buckets across operating hours.
    const buckets = [];
    for (let s = w.start; s < w.operatingEnd; s += BUCKET_MS) {
      const e = s + BUCKET_MS, inBucket = records.filter(r => { const t = r.startMs ?? r.endMs; return t != null && t >= s && t < e; });
      const sum = A.summarize(inBucket).report;
      const readyMs = spans.filter(x => x.state === 'ready').reduce((n, x) => n + overlapSeconds(x.start, x.end, s, Math.min(e, now)) * 1000, 0);
      const waits = inBucket.filter(r => A.classify(r).answered || A.classify(r).abandoned);
      buckets.push({ start: iso(s), end: iso(e), future: s > now, received: h.report ? sum.calls : null, answered: h.report ? sum.answered : null,
        abandoned: h.report ? sum.abandoned : null, asa: sum.asa, sla: sum.sla, answeredWithinThreshold: sum.answeredWithinThreshold,
        averageReadyEmployees: s > now ? null : Math.round(readyMs / Math.max(1, Math.min(e, now) - s) * 100) / 100,
        readyAgentMinutes: Math.round(readyMs / 60000),
        totalWaitSeconds: waits.reduce((n, r) => n + (r.waitSeconds || 0), 0), unknownWaitCalls: waits.filter(r => r.waitSeconds == null).length });
    }

    // Periods where two or more people were on break at once.
    const breakSpans = spans.filter(s => s.state === 'break');
    const points = [...new Set(breakSpans.flatMap(s => [s.start, s.end]))].sort((a, b) => a - b), overlaps = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], who = [...new Set(breakSpans.filter(s => s.start <= a && s.end >= b).map(s => s.employeeId))];
      if (who.length < 2) continue;
      const last = overlaps.at(-1);
      if (last && last.end === a && last.ids === who.join(',')) { last.end = b; continue; }
      overlaps.push({ start: a, end: b, ids: who.join(','), employeeIds: who });
    }
    const breakOverlaps = overlaps.map(o => ({ startedAt: iso(o.start), endedAt: iso(o.end), employeeIds: o.employeeIds, seconds: Math.round((o.end - o.start) / 1000),
      readyEmployeeIds: [...new Set(spans.filter(s => s.state === 'ready' && s.start <= o.start && s.end >= o.end).map(s => s.employeeId))] }));

    const samples = db.prepare('SELECT observed_at, waiting, active, longest_wait FROM live_snapshots WHERE observed_at >= ? AND observed_at < ? AND (changed = 1 OR id % 6 = 0) ORDER BY observed_at')
      .all(w.start, w.end).map(s => ({ observedAt: iso(s.observed_at), waiting: s.waiting, active: s.active, longestWaitSeconds: s.longest_wait }));

    const connections = [];
    for (const a of day.analyzed.filter(scope)) {
      const last = [...a.events].reverse().find(e => /sourceConnection/.test(e.payload || ''));
      let source = null;
      try { source = last ? JSON.parse(last.payload).sourceConnection : null; } catch {}
      connections.push({ employeeId: a.session.employee_id, extension: a.session.extension, occurredAt: iso(a.lastEvidence), sourceConnection: source, version: a.session.client_version || null });
    }

    const handovers = [];
    const byExt = new Map();
    for (const a of day.analyzed.filter(x => x.session.extension && scope(x))) { if (!byExt.has(a.session.extension)) byExt.set(a.session.extension, []); byExt.get(a.session.extension).push(a.session); }
    for (const [ext, list] of byExt) {
      list.sort((x, y) => x.issued_at - y.issued_at);
      for (let i = 1; i < list.length; i++) if (list[i].employee_id !== list[i - 1].employee_id) {
        const prev = list[i - 1], next = list[i];
        handovers.push({ extension: ext, previousEmployeeId: prev.employee_id, previousLogoutAt: iso(prev.revoked_at), nextEmployeeId: next.employee_id,
          nextLoginAt: iso(next.issued_at), gapSeconds: prev.revoked_at ? Math.round((next.issued_at - prev.revoked_at) / 1000) : null });
      }
    }

    const customers = new Map();
    for (const r of records) {
      const key = String(r.phone || '').replace(/\D/g, '');
      if (!key) continue;
      const c = customers.get(key) || { phone: r.phone, calls: 0, answered: 0, abandoned: 0, employeeIds: new Set(), first: Infinity, last: -Infinity };
      const k = A.classify(r), t = r.startMs ?? r.endMs ?? 0;
      c.calls++; if (k.answered) c.answered++; if (k.abandoned) c.abandoned++;
      c.first = Math.min(c.first, t); c.last = Math.max(c.last, t);
      customers.set(key, c);
    }
    for (const c of calls) { const key = String(c.phone || '').replace(/\D/g, ''); const x = [...customers.keys()].find(k => key && (k.endsWith(key.slice(-9)) || key.endsWith(k.slice(-9)))); if (x) customers.get(x).employeeIds.add(c.employeeId); }

    const unknownSeconds = Math.round(spans.filter(s => s.state === 'unknown').reduce((n, s) => n + overlapSeconds(s.start, s.end, w.start, opEnd), 0));
    const waitRecords = records.filter(r => !A.classify(r).outside);
    return {
      date, profileExtension: extension || '', queueFilter: queue || '', generatedAt: iso(now),
      operatingWindow: { start: iso(w.start), end: iso(w.operatingEnd) },
      historyReport: h.report ? { importedAt: h.report.importedAt, ...A.summarize(records).report } : null,
      profiles, calls, buckets, breakOverlaps, queueSamples: samples, connections, handovers,
      states: att.states,
      sessions: att.sessions,
      timeline: day.analyzed.filter(scope).flatMap(a => a.events.filter(e => e.event_type === 'session_login' && e.occurred_at >= w.start && e.occurred_at < w.end)
        .map(e => ({ employeeId: e.employee_id, extension: e.extension, eventType: e.event_type, occurredAt: iso(e.occurred_at) }))),
      historyRecords: records.map(r => ({ date: r.date, start: r.start, end: r.end, phone: r.phone, queue: r.queue, status: r.status, waitSeconds: r.waitSeconds, outsideHours: A.classify(r).outside })),
      attribution: attribution ? { summary: attribution.summary, rows: attribution.rows } : null,
      coverage: { hasHistory: !!h.report, historyVerified: !!h.report?.verifiedTotal, unknownSeconds, missingDates: h.report?.missingCalendarDates || [] },
      wait: { totalSeconds: waitRecords.reduce((n, r) => n + (r.waitSeconds || 0), 0), unknownCalls: waitRecords.filter(r => r.waitSeconds == null).length },
      customers: [...customers.values()].sort((a, b) => b.calls - a.calls).map(c => ({ phone: c.phone, calls: c.calls, answered: c.answered, abandoned: c.abandoned,
        employeeIds: [...c.employeeIds], firstAt: iso(c.first), lastAt: iso(c.last) })),
      reviews: db.prepare('SELECT * FROM reviews WHERE date = ? ORDER BY updated_at DESC').all(date).map(r => ({ id: r.id, reference: r.reference, title: r.title,
        employeeId: r.employee_id, owner: r.owner, status: r.status, note: r.note, updatedAt: iso(r.updated_at) })),
      reports: db.prepare('SELECT id, created_at, filters FROM saved_reports WHERE date = ? ORDER BY created_at DESC').all(date).map(r => ({ id: r.id, createdAt: iso(r.created_at), filters: r.filters })),
      audit: db.prepare('SELECT * FROM audit WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC LIMIT 500').all(w.start, w.end)
        .map(a => ({ occurredAt: iso(a.occurred_at), action: a.action, employeeId: a.employee_id, details: a.details })),
      rules: { slaSeconds: RULES.slaSeconds, shortAbandonSeconds: RULES.shortAbandonSeconds, callAlertSeconds: RULES.callAlertSeconds,
        breakPeriodSeconds: RULES.breakPeriodSeconds, breakBudgetSeconds: RULES.breakBudgetSeconds, businessStart: '09:00', operatingEnd: '03:00', businessEnd: '09:00' },
    };
  }

  // Same day-so-far comparison with the previous day.
  function comparison(date, queue, now) {
    const prev = addDays(date, -1), cut = now - dayWindow(businessDay(now)).start;
    const pick = d => {
      const h = app.dayHistory(d, now), w = dayWindow(d), limit = w.start + Math.max(0, Math.min(cut, w.end - w.start));
      if (!h.report) return null;
      return A.summarize(h.records.filter(r => (!queue || r.queue === queue) && (r.startMs ?? r.endMs ?? 0) < limit)).report;
    };
    const current = pick(date), previous = pick(prev);
    return { date: prev, available: !!(current && previous), current, previous, missingDates: [current ? null : date, previous ? null : prev].filter(Boolean) };
  }

  app.route('GET', '/api/operations', ctx => {
    app.requireAdmin(ctx);
    const q = ctx.query, today = businessDay(ctx.now), date = q.date || today;
    if (!validDate(date) || date > today) fail(400, 'تاريخ غير صحيح');
    if (q.saved) {
      const r = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(String(q.saved));
      if (!r) fail(404, 'التقرير غير موجود');
      return { createdAt: iso(r.created_at), businessDate: r.date, payload: r.payload };
    }
    const out = compute(date, q.extension || '', q.queue || '', ctx.now);
    if (q.compare === '1') out.comparison = comparison(date, q.queue || '', ctx.now);
    return out;
  });

  app.route('POST', '/api/operations', ctx => {
    const who = app.requireAdmin(ctx, 'write');
    const b = ctx.body;
    if (!validDate(b.date)) fail(400, 'تاريخ غير صحيح');
    if (b.action === 'review') {
      const title = String(b.title || '').trim();
      if (!title || title.length > 200 || !STATUSES.includes(b.status)) fail(400, 'اكتب الموضوع واختار الحالة');
      const reference = String(b.reference || '').slice(0, 200);
      const existing = db.prepare('SELECT * FROM reviews WHERE date = ? AND reference = ?').get(b.date, reference);
      if (existing && b.expectedUpdatedAt && iso(existing.updated_at) !== b.expectedUpdatedAt) fail(409, 'review_changed_reload');
      const id = existing?.id || crypto.randomUUID();
      db.prepare(`INSERT INTO reviews (id, date, reference, employee_id, title, owner, status, note, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(date, reference) DO UPDATE SET title = excluded.title, owner = excluded.owner, status = excluded.status, note = excluded.note,
        employee_id = excluded.employee_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .run(id, b.date, reference, b.employeeId ? Number(b.employeeId) : null, title, String(b.owner || '').slice(0, 100), b.status, String(b.note || '').slice(0, 2000), ctx.now, who.name);
      app.audit('review_updated', b.employeeId || null, { actor: who.name, status: b.status, owner: b.owner, note: String(b.note || '').slice(0, 200) });
      return { ok: true, id };
    }
    if (b.action === 'snapshot') {
      const data = compute(b.date, b.extension || '', b.queue || '', ctx.now);
      const profiles = data.profiles.filter(p => !b.employeeId || p.id === Number(b.employeeId));
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO saved_reports (id, date, created_at, filters, payload) VALUES (?,?,?,?,?)').run(id, b.date, ctx.now,
        JSON.stringify({ employeeId: b.employeeId || null, extension: b.extension || '', queue: b.queue || '', phoneMasked: !!b.phoneMasked }),
        JSON.stringify({ profiles, coverage: data.coverage, historyReport: data.historyReport }));
      app.audit('report_saved', b.employeeId || null, { actor: who.name });
      return { ok: true, id };
    }
    fail(400, 'invalid_action');
  });
}

module.exports = { setup };
