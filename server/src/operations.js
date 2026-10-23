'use strict';
// /api/operations: same inputs, logic (lib/operations-insights.ts, unchanged in src/legacy-logic)
// and response as the old app/api/operations/route.ts.
const crypto = require('node:crypto');
const { businessDay, dayWindow, validDate, addDays, iso } = require('./time');
const { operationsInsights, historyMetrics, operatingCalls } = require('./legacy-logic/attendance-logic');
const { cairoClockWindow } = require('./legacy-logic/missed-context');
const { historyCall, parse } = require('./old-shape');
const { settled } = require('./legacy-dashboard');

const STATUSES = ['new', 'working', 'resolved', 'reviewed'];
const IDENTITY_NOTE = 'الدخول الإداري الحالي بكلمة مرور مشتركة؛ سجل التغييرات يثبت حساب الإدارة، وليس هوية مشرف منفرد.';

function setup(app) {
  const { db, fail } = app;
  const insightsCache = new Map();

  const reviews = date => db.prepare('SELECT * FROM reviews WHERE date = ? ORDER BY updated_at DESC LIMIT 501').all(date)
    .map(r => ({ id: r.id, reference: r.reference, title: r.title, employeeId: r.employee_id, status: r.status, owner: r.owner, note: r.note, updatedAt: iso(r.updated_at) }));
  const reports = date => db.prepare('SELECT id, created_at, filters FROM saved_reports WHERE date = ? ORDER BY created_at DESC LIMIT 51').all(date)
    .map(r => ({ id: r.id, createdAt: iso(r.created_at), filters: r.filters }));
  const audit = w => db.prepare('SELECT * FROM audit WHERE occurred_at >= ? AND occurred_at < ? ORDER BY id DESC LIMIT 501').all(w.start, w.end).map(a => {
    const { reference, ...details } = parse(a.details);
    return { id: a.id, occurredAt: iso(a.occurred_at), action: a.action, employeeId: a.employee_id, reference: reference ?? null, details: JSON.stringify(details) };
  });
  // Latest heartbeat per employee: which connector version and Arabicss connection each PC reported.
  function connections(w) {
    const rows = db.prepare("SELECT * FROM events WHERE event_type = 'heartbeat' AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC, id DESC LIMIT 2001").all(w.start, w.end);
    const names = new Map(db.prepare('SELECT id, name FROM employees').all().map(e => [e.id, e.name])), seen = new Set(), out = [];
    for (const e of rows) {
      if (seen.has(e.employee_id)) continue;
      seen.add(e.employee_id);
      const p = parse(e.payload), x = parse(e.extra);
      out.push({ name: names.get(e.employee_id) || '', extension: e.extension, occurredAt: iso(e.occurred_at), employeeId: e.employee_id,
        sourceConnection: p.sourceConnection ?? x.sourceConnection ?? null, version: p.connectorVersion ?? x.connectorVersion ?? e.client_version ?? null });
    }
    return { rows: out, truncated: rows.length > 2000 };
  }
  const queueSamples = w => db.prepare('SELECT observed_at, waiting, active, longest_wait FROM live_snapshots WHERE observed_at >= ? AND observed_at < ? AND (changed = 1 OR id % 6 = 0) ORDER BY observed_at LIMIT 3001')
    .all(w.start, w.end).map(s => ({ observedAt: iso(s.observed_at), waiting: s.waiting, active: s.active, longestWaitSeconds: s.longest_wait }));

  // Old /api/history?all=1 for one day, in the old record shape.
  function history(date, now, queueFilter) {
    const h = app.dayHistory(date, now);
    let records = h.records.map(historyCall), report = h.report, queues = h.queues, missed = h.missed;
    if (queueFilter) {
      records = records.filter(c => c.queue === queueFilter);
      if (report) report = { ...report, ...historyMetrics(operatingCalls(records)), totalRecords: records.length };
      queues = queues.filter(q => q.queue === queueFilter);
      missed = missed.filter(c => c.queue === queueFilter);
    }
    return { records, report, queues, missed };
  }

  function data(date, profileExtension, queueFilter, now) {
    const d = app.oldDashboard(date, { attendance: true, all: true }, now), h = history(date, now, queueFilter), w = dayWindow(date);
    const staff = db.prepare('SELECT id, name, employee_code FROM employees').all().map(e => ({ id: e.id, name: e.name, employeeCode: e.employee_code }));
    for (const p of d.performance || []) if (!staff.some(s => s.id === p.employeeId)) staff.push({ id: p.employeeId, name: p.employee, employeeCode: 'حساب سابق' });
    const key = [date, profileExtension, queueFilter, db.prepare('SELECT MAX(id) m FROM events').get().m, h.report?.importedAt, settled(date, now) ? 'settled' : Math.floor(now / 15000)].join('|');
    const insights = insightsCache.get(key) || operationsInsights({ date, now, staff, sessions: d.attendance?.sessions || [], states: d.attendance?.states || [], calls: d.calls || [], events: d.timeline || [],
      history: h.records, hasHistory: !!h.report, historyVerified: !!h.report?.verifiedTotal, missingDates: h.report?.missingCalendarDates || [],
      breakTotals: profileExtension ? undefined : d.breakTotals }, profileExtension);
    if (!insightsCache.has(key)) { if (insightsCache.size > 20) insightsCache.delete(insightsCache.keys().next().value); insightsCache.set(key, insights); }
    const c = connections(w), rv = reviews(date), au = audit(w), rp = reports(date), qs = queueSamples(w);
    return { date, profileExtension, queueFilter, generatedAt: iso(now), ...insights, historyReport: h.report, historyRecords: h.records, queues: h.queues, missed: h.missed,
      attribution: d.historyAttribution, calls: d.calls || [], timeline: d.timeline || [], sessions: d.attendance?.sessions || [], states: d.attendance?.states || [],
      connections: c.rows, queueSamples: qs.slice(0, 3000), reviews: rv.slice(0, 500), audit: au.slice(0, 500), reports: rp.slice(0, 50),
      truncated: { reviews: rv.length > 500, audit: au.length > 500, reports: rp.length > 50, connections: c.truncated, queueSamples: qs.length > 3000 }, identityNote: IDENTITY_NOTE };
  }

  // Same-time-of-day comparison with the previous day (old route).
  function comparison(date, queue, result, now) {
    const previous = addDays(date, -1), h = history(previous, now, ''), w = dayWindow(date), prev = dayWindow(previous);
    let cutoff = prev.operatingEnd, currentCutoff = w.operatingEnd;
    if (now >= w.start && now < w.operatingEnd) {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)), v = k => p.find(x => x.type === k).value;
      cutoff = cairoClockWindow(Number(v('hour')) < 9 ? date : previous, v('hour') + ':' + v('minute') + ':' + v('second')).start; currentCutoff = now;
    }
    const before = (rows, end) => operatingCalls(rows).filter(c => { const t = cairoClockWindow(c.date, c.start); return (!queue || c.queue === queue) && t && t.start < end; });
    return { date: previous, cutoff: iso(cutoff), available: !!h.report && !!result.historyReport, previous: h.report ? historyMetrics(before(h.records, cutoff)) : null,
      current: result.historyReport ? historyMetrics(before(result.historyRecords, currentCutoff)) : null, missingDates: h.report?.missingCalendarDates || [] };
  }

  app.operationsData = data;

  app.route('GET', '/api/operations', async ctx => {
    app.requireAdmin(ctx);
    const q = ctx.query, date = q.date || businessDay(ctx.now);
    if (!validDate(date) || date > businessDay(ctx.now)) fail(400, 'invalid_date');
    if (q.saved !== undefined) {
      const r = db.prepare('SELECT * FROM saved_reports WHERE id = ? AND date = ?').get(String(q.saved), date);
      if (!r) fail(404, 'report_not_found');
      return { id: r.id, businessDate: r.date, createdAt: iso(r.created_at), filters: r.filters, payload: r.payload };
    }
    const extension = q.extension || '', queue = q.queue || '', section = q.section || '';
    if (extension && !/^\d{1,10}$/.test(extension)) fail(400, 'invalid_extension');
    if (queue && !/^\d{1,10}$/.test(queue)) fail(400, 'invalid_queue');
    if (['followup', 'reports', 'audit', 'health'].includes(section)) {
      const w = dayWindow(date), rv = section === 'followup' ? reviews(date) : [], rp = section === 'reports' ? reports(date) : [], au = section === 'audit' ? audit(w) : [];
      const c = section === 'health' ? connections(w) : { rows: [], truncated: false };
      return { section, date, profileExtension: extension, queueFilter: queue, generatedAt: iso(ctx.now), profiles: [], calls: [], sessions: [], states: [], historyRecords: [], handovers: [],
        customers: [], breakOverlaps: [], queueSamples: [], coverage: { unknownSeconds: null, missingDates: [] }, reviews: rv.slice(0, 500), reports: rp.slice(0, 50), audit: au.slice(0, 500),
        connections: c.rows, truncated: { reviews: rv.length > 500, reports: rp.length > 50, audit: au.length > 500, connections: c.truncated } };
    }
    const result = { ...await app.heavy('operationsData', date, extension, queue, ctx.now), section };
    if (q.compare === '1') result.comparison = comparison(date, queue, result, ctx.now);
    return result;
  });

  app.route('POST', '/api/operations', async ctx => {
    const who = app.requireAdmin(ctx, 'write');
    const b = ctx.body;
    if (!validDate(b.date) || b.date > businessDay(ctx.now)) fail(400, 'invalid_date');
    if (b.action === 'review') {
      if (typeof b.reference !== 'string' || !b.reference || b.reference.length > 180 || typeof b.title !== 'string' || !b.title || b.title.length > 200 || !STATUSES.includes(b.status)
        || typeof b.note !== 'string' || b.note.length > 2000 || typeof b.owner !== 'string' || b.owner.length > 100 || (b.employeeId != null && !Number.isSafeInteger(b.employeeId))) fail(400, 'invalid_fields');
      const existing = db.prepare('SELECT * FROM reviews WHERE date = ? AND reference = ?').get(b.date, b.reference);
      if (existing && b.expectedUpdatedAt !== iso(existing.updated_at)) fail(409, 'review_changed_reload');
      const id = existing?.id || crypto.randomUUID(), changedAt = Math.max(ctx.now, existing ? existing.updated_at + 1 : 0);
      db.prepare(`INSERT INTO reviews (id, date, reference, employee_id, title, owner, status, note, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(date, reference) DO UPDATE SET title = excluded.title, owner = excluded.owner, status = excluded.status, note = excluded.note,
        employee_id = excluded.employee_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .run(id, b.date, b.reference, b.employeeId ?? null, b.title, b.owner, b.status, b.note, changedAt, who.name);
      app.audit('review_updated', b.employeeId ?? null, { actor: who.name, date: b.date, status: b.status, owner: b.owner, note: b.note, title: b.title, reference: b.reference });
      return { ok: true, id };
    }
    if (b.action === 'snapshot') {
      if (b.employeeId != null && (!Number.isSafeInteger(b.employeeId) || b.employeeId < 1) || b.extension != null && (typeof b.extension !== 'string' || b.extension && !/^\d{1,10}$/.test(b.extension))) fail(400, 'invalid_fields');
      const queue = typeof b.queue === 'string' ? b.queue : '';
      if (queue && !/^\d{1,10}$/.test(queue)) fail(400, 'invalid_queue');
      const result = await app.heavy('operationsData', b.date, b.extension || '', queue, ctx.now), id = crypto.randomUUID();
      const filters = { employeeId: b.employeeId ?? null, extension: b.extension || '', queue, source: 'operations', phoneMasked: !!b.phoneMasked, generalMetricsScope: queue ? 'request_type' : 'whole_service' };
      const payload = JSON.stringify({ date: result.date, generatedAt: result.generatedAt, historyReport: result.historyReport, coverage: result.coverage, rules: result.rules,
        profiles: result.profiles.filter(p => !b.employeeId || p.id === b.employeeId), buckets: result.buckets, wait: result.wait, attribution: result.attribution?.summary, reviews: result.reviews });
      if (payload.length > 400000) fail(422, 'report_too_large');
      db.prepare('INSERT INTO saved_reports (id, date, created_at, filters, payload) VALUES (?,?,?,?,?)').run(id, b.date, ctx.now, JSON.stringify(filters), payload);
      app.audit('report_saved', null, { actor: who.name, ...filters, reference: id });
      return { ok: true, id };
    }
    fail(400, 'invalid_action');
  });
}

module.exports = { setup };
