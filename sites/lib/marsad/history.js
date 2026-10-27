import { RULES, businessDay, dayWindow, validDate, addDays, iso } from './time.js';
import { sha256, randomToken } from './security.js';
import * as A from './arabicss.js';
import { readSheet } from './xlsx-read.js';

const TOKEN_MS = 24 * 3600000, REFRESH_MS = 30 * 24 * 3600000;
const LIVE_FRESH_MS = 15000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(app) {
  const { db, fail } = app;

  // ---------- collector credentials (token = "<expiry ms>.<random>") ----------
  async function issueCollector(now) {
    const token = (now + TOKEN_MS) + '.' + randomToken(24), refresh = (now + REFRESH_MS) + '.' + randomToken(24);
    await db.prepare('INSERT INTO collector_tokens (token_hash, refresh_hash, created_at, token_expires_at, refresh_expires_at) VALUES (?,?,?,?,?)')
      .run(sha256(token), sha256(refresh), now, now + TOKEN_MS, now + REFRESH_MS);
    return { token, refreshToken: refresh };
  }
  const collectorByToken = async (token, now) => {
    const row = token && await db.prepare('SELECT * FROM collector_tokens WHERE token_hash = ?').get(sha256(token));
    return row && !row.revoked_at && row.token_expires_at > now ? row : null;
  };
  const requireCollector = async ctx => (await collectorByToken(ctx.header('x-history-token'), ctx.now)) || fail(401, 'collector_token_invalid');

  // ---------- stored day reports (one Arabicss calendar date per report) ----------
  async function storeReport(date, header, rows, { source, verified, expected, now }) {
    const fingerprint = sha256(JSON.stringify([header, rows]));
    const last = await db.prepare('SELECT * FROM history_reports WHERE date = ? ORDER BY imported_at DESC, id DESC LIMIT 1').get(date);
    if (last && last.fingerprint === fingerprint) {
      await db.prepare('UPDATE history_reports SET imported_at = ?, verified_total = MAX(verified_total, ?) WHERE id = ?').run(now, verified ? 1 : 0, last.id);
      return { id: last.id, duplicate: true };
    }
    // A partial upload (e.g. an Excel file of half a day) never replaces a fuller report of the same date.
    if (last && !verified) {
      const had = (await db.prepare('SELECT COUNT(*) n FROM history_calls WHERE report_id = ?').get(last.id)).n;
      if (rows.length < had) fail(409, 'الملف فيه ' + rows.length + ' مكالمة بس، والمحفوظ لنفس اليوم ' + had + ' مكالمة؛ متغيرش');
    }
    // Publish header and calls atomically. Keep previous versions as evidence; readers select the latest.
    const writes = [db.prepare('INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)')
      .bind(date, now, source, verified ? 1 : 0, expected ?? null, JSON.stringify(header), fingerprint)];
    for (let i = 0; i < rows.length; i += 20) {
      const part = rows.slice(i, i + 20);
      writes.push(db.prepare('INSERT INTO history_calls (report_id,idx,raw) VALUES ' + part.map(() => '((SELECT id FROM history_reports WHERE date=? AND fingerprint=? ORDER BY id DESC LIMIT 1),?,?)').join(','))
        .bind(...part.flatMap((row,k) => [date,fingerprint,i+k,JSON.stringify(row)])));
    }
    const result = await db.batch(writes), id = Number(result[0].lastInsertRowid);
    cache.clear();
    return { id, duplicate: false };
  }

  // ---------- business day assembled from two calendar reports ----------
  const cache = new Map();
  async function dayHistory(date, now) {
    const w = dayWindow(date), dates = [date, addDays(date, 1)];
    const reports = await Promise.all(dates.map(d => db.prepare('SELECT * FROM history_reports WHERE date = ? ORDER BY imported_at DESC, id DESC LIMIT 1').get(d)));
    const key = date + '|' + reports.map(r => r ? r.id + ':' + r.imported_at : '-').join('|');
    if (cache.has(key)) return cache.get(key);
    const records = [];
    const calls = await Promise.all(reports.map(r => r ? db.prepare('SELECT idx, raw FROM history_calls WHERE report_id = ? ORDER BY idx').all(r.id) : []));
    reports.forEach((r, i) => {
      if (!r) return;
      const header = JSON.parse(r.header), map = A.mapHeader(header);
      for (const c of calls[i]) {
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
        verifiedTotal: present.every(r => r.verified_total) && !missingCalendarDates.length, missingCalendarDates, precision: records.some(r => r.precision === 'minute') ? 'minute' : 'second', ...s.report,
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

  // ---------- live snapshots ----------
  const latestLive = () => db.prepare('SELECT * FROM live_snapshots ORDER BY observed_at DESC, id DESC LIMIT 1').get();
  app.latestLive = latestLive;

  async function ingestLive(body, now) {
    const c = body.capture || {}, rows = body.rows;
    if (!UUID.test(String(c.id || '')) || c.kind !== 'native_report_snapshot') fail(400, 'invalid_capture');
    if (!Array.isArray(rows) || rows.length > 2000 || rows.some(r => !Array.isArray(r) || r.length !== 11 || r.some(v => typeof v !== 'string' || v.length > 200))) fail(400, 'invalid_live_snapshot');
    const observed = Date.parse(c.observedAt || '');
    if (c.timeBasis !== 'server-clock-v1' || !Number.isFinite(observed) || observed > now + 5000) fail(400, 'invalid_capture_time');
    const dup = await db.prepare('SELECT * FROM live_snapshots WHERE capture_id = ?').get(c.id);
    if (dup) return { ok: true, duplicate: true, captureId: c.id, observedAt: iso(dup.observed_at), liveAccepted: false, liveReason: 'duplicate' };
    const prev = await latestLive(), s = A.liveSummary(rows);
    await db.prepare('INSERT OR IGNORE INTO live_snapshots (capture_id, observed_at, received_at, changed, rows, waiting, active, longest_wait) VALUES (?,?,?,?,?,?,?,?)')
      .run(c.id, observed, now, c.changed ? 1 : 0, JSON.stringify(rows), s.waiting, s.active, s.longest);
    const superseded = prev && prev.observed_at > observed;
    const archived = now - observed > LIVE_FRESH_MS;
    return { ok: true, captureId: c.id, observedAt: iso(observed), liveAccepted: !superseded && !archived, archived, liveReason: superseded ? 'superseded' : archived ? 'stale' : 'accepted' };
  }

  // ---------- routes ----------
  app.route('POST', '/api/history', async ctx => {
    if (/spreadsheetml|octet-stream/.test(ctx.type)) return importWorkbook(ctx);
    let b;
    try { b = JSON.parse(new TextDecoder().decode(ctx.raw) || '{}'); } catch { fail(400, 'invalid_json'); }
    if (b.action === 'token') {
      await app.requireAdmin(ctx, 'write');
      return issueCollector(ctx.now);
    }
    if (b.action === 'refresh') {
      const row = await db.prepare('SELECT * FROM collector_tokens WHERE refresh_hash = ?').get(sha256(String(b.refreshToken || '')));
      if (!row || row.revoked_at || row.refresh_expires_at <= ctx.now) fail(401, 'collector_refresh_invalid');
      const u = await db.prepare('UPDATE collector_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(ctx.now, row.id);
      if (!u.changes) fail(401, 'collector_refresh_invalid');
      return issueCollector(ctx.now);
    }
    if (b.action === 'upgrade') {
      const row = await requireCollector(ctx);
      await db.prepare('UPDATE collector_tokens SET revoked_at = ? WHERE id = ?').run(ctx.now, row.id);
      return issueCollector(ctx.now);
    }
    if (b.action === 'revoke') {
      await db.prepare('UPDATE collector_tokens SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL').run(ctx.now, sha256(String(b.refreshToken || '')));
      return { ok: true };
    }
    await requireCollector(ctx);
    if (b.action === 'live') return ingestLive(b, ctx.now);
    if (b.action === 'status') {
      // What the collector PC last saw (its own errors included), for the system page.
      const st = b.state && typeof b.state === 'object' ? b.state : {};
      const clip = v => v == null ? null : String(v).slice(0, 400);
      const value = { receivedAt: iso(ctx.now), version: clip(st.version), lastHistory: clip(st.lastHistory), historyError: clip(st.historyError), liveError: clip(st.liveError),
        historyDays: Array.isArray(st.historyDays) ? st.historyDays.slice(0, 10).map(clip) : [] };
      await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('collector_status', JSON.stringify(value));
      return { ok: true };
    }
    if (!Array.isArray(b.rows) || b.rows.length < 1 || !validDate(b.reportDate)) fail(400, 'invalid_report');
    const [header, ...rows] = b.rows;
    if (!Array.isArray(header) || rows.some(r => !Array.isArray(r) || r.length !== header.length)) fail(400, 'invalid_report');
    if (Number(b.expectedCount) !== rows.length) fail(400, 'report_count_mismatch');
    const stored = await storeReport(b.reportDate, header.map(String), rows.map(r => r.map(v => String(v ?? ''))), { source: 'collector', verified: true, expected: rows.length, now: ctx.now });
    return { ok: true, ...stored };
  }, { raw: true, limit: 8 * 1024 * 1024 });

  async function importWorkbook(ctx) {
    await app.requireAdmin(ctx, 'write');
    if (ctx.raw.length > 2.5 * 1024 * 1024) fail(413, 'الملف أكبر من المسموح');
    let values;
    try { values = await readSheet(ctx.raw); } catch { fail(400, 'الملف ليس Excel صالحًا'); }
    if (!values.length) fail(400, 'الملف فارغ');
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
    for (const [date, rows] of byDate) duplicate = (await storeReport(date, header, rows, { source: 'xlsx', verified: false, now: ctx.now })).duplicate && duplicate;
    const first = [...byDate.keys()].sort()[0];
    return { ok: true, date: first, duplicate, dates: [...byDate.keys()].sort() };
  }

  app.route('GET', '/api/history', async ctx => {
    await app.requireAdmin(ctx);
    const q = ctx.query, today = businessDay(ctx.now), date = q.date || today;
    if (!validDate(date)) fail(400, 'تاريخ غير صحيح');
    const latest = await latestLive();
    const live = latest ? { observedAt: iso(latest.observed_at), stale: ctx.now - latest.observed_at > 30000, records: JSON.parse(latest.rows) } : null;
    // The admin page asks for this every second on the live view: only the live snapshot (as the old server did).
    if (q.live === '1' && q.missedIndex === undefined && q.contexts !== '1' && q.all !== '1')
      return { live, report: null, reports: [], queues: [], missed: [], records: [], liveOnly: true };
    const h = await dayHistory(date, ctx.now);
    const out = {
      report: h.report, queues: h.queues, missed: h.missed,
      live,
    };
    if (q.reportId && h.report && q.reportId !== h.report.id) fail(409, 'وصل سجل أحدث؛ أعد فتح التفاصيل');
    if (q.all === '1') out.records = h.records.map(r => ({ queue: r.queue, accountName: r.accountName, date: r.date, start: r.start, end: r.end,
      durationSeconds: r.durationSeconds, waitSeconds: r.waitSeconds, phone: r.phone, status: r.status, outsideHours: A.classify(r).outside }));
    return out;
  });
}

export { setup };
