'use strict';
const crypto = require('node:crypto');
const { RULES, businessDay, dayWindow, validDate, addDays, iso } = require('./time');
const { sha256, randomToken } = require('./security');
const A = require('./arabicss');

const TOKEN_MS = 24 * 3600000, REFRESH_MS = 30 * 24 * 3600000;
const LIVE_FRESH_MS = 15000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(app) {
  const { db, fail } = app;

  // ---------- collector credentials (token = "<expiry ms>.<random>") ----------
  function issueCollector(now) {
    const token = (now + TOKEN_MS) + '.' + randomToken(24), refresh = (now + REFRESH_MS) + '.' + randomToken(24);
    db.prepare('INSERT INTO collector_tokens (token_hash, refresh_hash, created_at, token_expires_at, refresh_expires_at) VALUES (?,?,?,?,?)')
      .run(sha256(token), sha256(refresh), now, now + TOKEN_MS, now + REFRESH_MS);
    return { token, refreshToken: refresh };
  }
  const collectorByToken = (token, now) => {
    const row = token && db.prepare('SELECT * FROM collector_tokens WHERE token_hash = ?').get(sha256(token));
    return row && !row.revoked_at && row.token_expires_at > now ? row : null;
  };
  const requireCollector = ctx => collectorByToken(ctx.header('x-history-token'), ctx.now) || fail(401, 'collector_token_invalid');

  // ---------- stored day reports (one Arabicss calendar date per report) ----------
  function storeReport(date, header, rows, { source, verified, expected, now }) {
    const fingerprint = sha256(JSON.stringify([header, rows]));
    const last = db.prepare('SELECT * FROM history_reports WHERE date = ? ORDER BY imported_at DESC, id DESC LIMIT 1').get(date);
    if (last && last.fingerprint === fingerprint) {
      db.prepare('UPDATE history_reports SET imported_at = ?, verified_total = MAX(verified_total, ?) WHERE id = ?').run(now, verified ? 1 : 0, last.id);
      return { id: last.id, duplicate: true };
    }
    // A shorter verified pull must not replace a longer one for a finished day (source hiccup).
    return db.transaction(() => {
      const r = db.prepare('INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)')
        .run(date, now, source, verified ? 1 : 0, expected ?? null, JSON.stringify(header), fingerprint);
      const add = db.prepare('INSERT INTO history_calls (report_id, idx, raw) VALUES (?,?,?)');
      rows.forEach((row, i) => add.run(r.lastInsertRowid, i, JSON.stringify(row)));
      // Keep only the newest copy of each calendar date.
      for (const old of db.prepare('SELECT id FROM history_reports WHERE date = ? AND id <> ?').all(date, r.lastInsertRowid)) {
        db.prepare('DELETE FROM history_calls WHERE report_id = ?').run(old.id);
        db.prepare('DELETE FROM history_reports WHERE id = ?').run(old.id);
      }
      cache.clear();
      return { id: Number(r.lastInsertRowid), duplicate: false };
    })();
  }

  // ---------- business day assembled from two calendar reports ----------
  const cache = new Map();
  function dayHistory(date, now) {
    const w = dayWindow(date), dates = [date, addDays(date, 1)];
    const reports = dates.map(d => db.prepare('SELECT * FROM history_reports WHERE date = ? ORDER BY imported_at DESC, id DESC LIMIT 1').get(d));
    const key = date + '|' + reports.map(r => r ? r.id + ':' + r.imported_at : '-').join('|');
    if (cache.has(key)) return cache.get(key);
    const records = [];
    reports.forEach((r, i) => {
      if (!r) return;
      const header = JSON.parse(r.header), map = A.mapHeader(header);
      for (const c of db.prepare('SELECT idx, raw FROM history_calls WHERE report_id = ? ORDER BY idx').all(r.id)) {
        const rec = A.toRecord(JSON.parse(c.raw), map, dates[i], records.length);
        const t = rec.startMs ?? rec.endMs;
        if (t == null ? i === 0 : t >= w.start && t < w.end) records.push({ ...rec, index: records.length, reportId: r.id });
      }
    });
    const missingCalendarDates = dates.filter((d, i) => !reports[i] && (i === 0 || now >= dayWindow(d).start - RULES.businessStartHour * 3600000));
    const s = A.summarize(records);
    const present = reports.filter(Boolean);
    const value = {
      key, records,
      report: present.length ? {
        id: date + ':' + present.map(r => r.id).join('-'), date, importedAt: iso(Math.max(...present.map(r => r.imported_at))),
        verifiedTotal: present.every(r => r.verified_total), missingCalendarDates, precision: records.some(r => r.precision === 'minute') ? 'minute' : 'second', ...s.report,
      } : null,
      queues: s.queues,
      missed: records.map(r => ({ r, c: A.classify(r) })).filter(x => x.c.abandoned).map(({ r, c }) => ({
        index: r.index, queue: r.queue, queueLabel: A.queueLabel(r.queue), date: r.date, start: r.start, end: r.end, phone: r.phone,
        waitSeconds: r.waitSeconds, classification: c.classification, precision: r.precision })),
    };
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
  }
  app.dayHistory = dayHistory;

  // ---------- employee states during a missed call ----------
  function stateAt(a, t) {
    const span = a.spans.find(s => s.start <= t && t < s.end);
    if (span) return { state: span.state === 'post_call' ? 'post_call' : span.state, since: span.start };
    if (a.session.revoked_at != null && t >= a.session.revoked_at) return { state: a.closure?.excluded ? 'shift_ended' : 'offline', since: a.session.revoked_at };
    return null;
  }

  function missedContext(day, rec) {
    const end = rec.endMs ?? rec.startMs, precision = rec.precision;
    const slack = precision === 'minute' ? 60000 : 1000;
    const entry = rec.waitSeconds != null && end != null ? end - rec.waitSeconds * 1000 : rec.startMs;
    const out = [];
    for (const [employeeId, list] of groupBy(day.analyzed, a => a.session.employee_id)) {
      const relevant = list.filter(a => a.session.issued_at <= end + slack);
      if (!relevant.length || end == null) continue;
      const a = relevant.sort((x, y) => y.session.issued_at - x.session.issued_at)[0];
      const atEnd = stateAt(a, end), atEntry = entry != null ? stateAt(a, entry) : null;
      const readySpan = entry != null && a.spans.find(s => s.state === 'ready' && s.start > entry && s.start <= end);
      const changed = precision === 'minute' && a.spans.some(s => s.start > end && s.start < end + slack);
      const e = a.employee || {};
      out.push({
        employeeId, name: e.name || '—', code: e.employee_code || '', extension: a.session.extension,
        queueEntryState: atEntry ? atEntry.state : 'unknown', state: changed ? 'uncertain' : atEnd ? atEnd.state : 'unknown',
        becameReadyDuringWait: !!readySpan, readyDuringWaitAt: readySpan ? iso(readySpan.start) : null,
        ringResult: ringProved(a, entry, end) ? 'proved' : 'unknown',
        stateStartedAt: atEnd ? iso(atEnd.since) : null, elapsedSeconds: atEnd ? Math.round((end - atEnd.since) / 1000) : null,
        elapsedMaxSeconds: atEnd && precision === 'minute' ? Math.round((end + slack - atEnd.since) / 1000) : null,
        durationBasis: atEnd ? (atEnd.since > a.session.issued_at ? 'recorded_start' : 'observed_since') : null,
        reason: a.closure ? a.closure.reason : atEnd ? 'recent_identity_event' : 'no_identity_events',
        evidenceAt: iso(Math.min(a.lastEvidence, end)),
      });
    }
    return {
      employees: out,
      timeWindow: { start: rec.start, end: rec.end || rec.start, precision },
      queueEntryWindow: entry != null ? { start: new Date(entry).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo' }), end: rec.end } : null,
      timeReference: 'Arabicss server clock (call) / Marsad clock (employee states)',
    };
  }

  // Ringing on this extension is only proven by an explicit source event for the call window.
  function ringProved(a, entry, end) {
    if (entry == null) return false;
    return a.events.some(e => e.event_type === 'heartbeat' && e.occurred_at >= entry - 2000 && e.occurred_at <= end + 2000 && /ringProof":"ring/.test(e.payload || ''));
  }

  const groupBy = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

  // ---------- attribution of answered history calls to employees ----------
  app.historyAttribution = function attribution(day, scope) {
    const h = dayHistory(day.date, day.now);
    if (!h.report) return null;
    const rows = [], recovered = [];
    let recoveredCount = 0, observed = 0, unattributed = 0;
    for (const r of h.records) {
      const c = A.classify(r);
      const base = { date: r.date, start: r.start, end: r.end, phone: r.phone, accountId: r.accountName, extension: r.extension };
      if (!c.answered) { rows.push({ ...base, employeeId: null, employeeName: null, reason: 'not_answered', included: false }); continue; }
      const t = r.startMs ?? r.endMs;
      let reason = null, match = null;
      if (!r.extension) reason = 'unverified_extension';
      else if (t == null) reason = 'uncertain_time';
      else {
        const slack = r.precision === 'minute' ? 60000 : 2000;
        const candidates = day.analyzed.filter(a => a.session.extension === r.extension && a.session.issued_at <= t + slack && (a.session.revoked_at ?? a.end) >= t - slack);
        const people = new Set(candidates.map(a => a.session.employee_id));
        if (!candidates.length) reason = 'no_session_at_call';
        else if (people.size > 1) reason = 'ambiguous_session';
        else {
          match = candidates[0];
          const seen = candidates.some(a => a.calls.some(x => Math.abs((x.startedAt ?? x.observedAt) - t) <= 120000 + slack && (!r.phone || !x.phone || String(x.phone).endsWith(String(r.phone).slice(-7)))));
          reason = seen ? 'already_observed' : r.durationSeconds == null ? 'missing_duration' : 'session_at_call';
        }
      }
      const include = reason === 'session_at_call';
      if (reason === 'already_observed') observed++;
      else if (include) recoveredCount++;
      else unattributed++;
      rows.push({ ...base, employeeId: match ? match.session.employee_id : null, employeeName: match ? match.employee?.name || null : null, reason, included: include });
      if (include && scope(match)) recovered.push({
        id: 'h:' + r.reportId + ':' + r.index, employeeId: match.session.employee_id, agentName: match.employee?.name || '', extension: r.extension,
        callType: 'incoming', phone: r.phone, queue: r.queue, callId: '', eventType: 'agentunlinked', startedAt: iso(t), occurredAt: iso(r.endMs ?? t),
        durationSeconds: r.durationSeconds, outsideHours: c.outside, attributionSource: 'history_session', startKnown: true,
      });
    }
    return {
      summary: { recovered: recoveredCount, alreadyObserved: observed, unattributedAnswered: unattributed },
      rows: rows.filter(x => !x.employeeId || scope({ session: { employee_id: x.employeeId, extension: x.extension } })),
      recoveredCalls: recovered,
    };
  };

  // ---------- live snapshots ----------
  const latestLive = () => db.prepare('SELECT * FROM live_snapshots ORDER BY observed_at DESC, id DESC LIMIT 1').get();
  app.latestLive = latestLive;

  function ingestLive(body, now) {
    const c = body.capture || {}, rows = body.rows;
    if (!UUID.test(String(c.id || '')) || c.kind !== 'native_report_snapshot') fail(400, 'invalid_capture');
    if (!Array.isArray(rows) || rows.length > 2000 || rows.some(r => !Array.isArray(r) || r.length !== 11 || r.some(v => typeof v !== 'string' || v.length > 200))) fail(400, 'invalid_live_snapshot');
    const observed = Date.parse(c.observedAt || '');
    if (c.timeBasis !== 'server-clock-v1' || !Number.isFinite(observed) || observed > now + 5000) fail(400, 'invalid_capture_time');
    const dup = db.prepare('SELECT * FROM live_snapshots WHERE capture_id = ?').get(c.id);
    if (dup) return { ok: true, duplicate: true, captureId: c.id, observedAt: iso(dup.observed_at), liveAccepted: false, liveReason: 'duplicate' };
    const prev = latestLive(), s = A.liveSummary(rows);
    db.prepare('INSERT INTO live_snapshots (capture_id, observed_at, received_at, changed, rows, waiting, active, longest_wait) VALUES (?,?,?,?,?,?,?,?)')
      .run(c.id, observed, now, c.changed ? 1 : 0, JSON.stringify(rows), s.waiting, s.active, s.longest);
    const superseded = prev && prev.observed_at > observed;
    const archived = now - observed > LIVE_FRESH_MS;
    return { ok: true, captureId: c.id, observedAt: iso(observed), liveAccepted: !superseded && !archived, archived, liveReason: superseded ? 'superseded' : archived ? 'stale' : 'accepted' };
  }

  // ---------- routes ----------
  app.route('POST', '/api/history', async ctx => {
    if (/spreadsheetml|octet-stream/.test(ctx.type)) return importWorkbook(ctx);
    let b;
    try { b = JSON.parse(ctx.raw.toString('utf8') || '{}'); } catch { fail(400, 'invalid_json'); }
    if (b.action === 'token') {
      app.requireAdmin(ctx, 'write');
      return issueCollector(ctx.now);
    }
    if (b.action === 'refresh') {
      const row = db.prepare('SELECT * FROM collector_tokens WHERE refresh_hash = ?').get(sha256(String(b.refreshToken || '')));
      if (!row || row.revoked_at || row.refresh_expires_at <= ctx.now) fail(401, 'collector_refresh_invalid');
      db.prepare('UPDATE collector_tokens SET revoked_at = ? WHERE id = ?').run(ctx.now, row.id);
      return issueCollector(ctx.now);
    }
    if (b.action === 'upgrade') {
      const row = requireCollector(ctx);
      db.prepare('UPDATE collector_tokens SET revoked_at = ? WHERE id = ?').run(ctx.now, row.id);
      return issueCollector(ctx.now);
    }
    if (b.action === 'revoke') {
      db.prepare('UPDATE collector_tokens SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL').run(ctx.now, sha256(String(b.refreshToken || '')));
      return { ok: true };
    }
    requireCollector(ctx);
    if (b.action === 'live') return ingestLive(b, ctx.now);
    if (!Array.isArray(b.rows) || b.rows.length < 1 || !validDate(b.reportDate)) fail(400, 'invalid_report');
    const [header, ...rows] = b.rows;
    if (!Array.isArray(header) || rows.some(r => !Array.isArray(r) || r.length !== header.length)) fail(400, 'invalid_report');
    if (Number(b.expectedCount) !== rows.length) fail(400, 'report_count_mismatch');
    const stored = storeReport(b.reportDate, header.map(String), rows.map(r => r.map(v => String(v ?? ''))), { source: 'collector', verified: true, expected: rows.length, now: ctx.now });
    return { ok: true, ...stored };
  }, { raw: true, limit: 8 * 1024 * 1024 });

  async function importWorkbook(ctx) {
    app.requireAdmin(ctx, 'write');
    if (ctx.raw.length > 2.5 * 1024 * 1024) fail(413, 'الملف أكبر من المسموح');
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(ctx.raw); } catch { fail(400, 'الملف ليس Excel صالحًا'); }
    const sheet = wb.worksheets[0];
    if (!sheet) fail(400, 'الملف فارغ');
    const values = [];
    sheet.eachRow({ includeEmpty: false }, row => values.push(row.values.slice(1).map(cell)));
    const h = values.findIndex(r => r.some(v => /call\s*date/i.test(v)));
    if (h < 0) fail(400, 'لم يتم العثور على عمود Call Date');
    const header = values[h], map = A.mapHeader(header), byDate = new Map();
    for (const r of values.slice(h + 1)) {
      const row = header.map((_, i) => r[i] ?? '');
      const date = A.normalizeDate(row[map.date]);
      if (!date) continue;
      row[map.date] = date;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    }
    if (!byDate.size) fail(400, 'لا توجد صفوف بتاريخ صالح');
    let duplicate = true;
    for (const [date, rows] of byDate) duplicate = storeReport(date, header, rows, { source: 'xlsx', verified: false, now: ctx.now }).duplicate && duplicate;
    const first = [...byDate.keys()].sort()[0];
    return { ok: true, date: first, duplicate, dates: [...byDate.keys()].sort() };
  }

  const cell = v => {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map(x => x.text).join('') ?? '');
    return String(v);
  };

  app.route('GET', '/api/history', ctx => {
    app.requireAdmin(ctx);
    const q = ctx.query, today = businessDay(ctx.now), date = q.date || today;
    if (!validDate(date)) fail(400, 'تاريخ غير صحيح');
    const h = dayHistory(date, ctx.now);
    const live = latestLive();
    const out = {
      report: h.report, queues: h.queues, missed: h.missed,
      live: live ? { observedAt: iso(live.observed_at), records: JSON.parse(live.rows) } : null,
    };
    if (q.reportId && h.report && q.reportId !== h.report.id) fail(409, 'وصل سجل أحدث؛ أعد فتح التفاصيل');
    if (q.missedIndex !== undefined) {
      const rec = h.records[Number(q.missedIndex)];
      if (!rec) fail(404, 'المكالمة غير موجودة في السجل');
      const day = app.dayData(date, ctx.now);
      return { call: { date: rec.date, start: rec.start, end: rec.end, phone: rec.phone, queue: rec.queue }, context: missedContext(day, rec) };
    }
    if (q.contexts === '1') {
      const day = app.dayData(date, ctx.now);
      return { contexts: h.missed.map(m => { const rec = h.records[m.index]; return { index: m.index, call: { date: rec.date, start: rec.start, end: rec.end, phone: rec.phone, queue: rec.queue }, context: missedContext(day, rec) }; }) };
    }
    if (q.all === '1') out.records = h.records.map(r => ({ queue: r.queue, accountName: r.accountName, date: r.date, start: r.start, end: r.end,
      durationSeconds: r.durationSeconds, waitSeconds: r.waitSeconds, phone: r.phone, status: r.status, outsideHours: A.classify(r).outside }));
    return out;
  });
}

module.exports = { setup };
