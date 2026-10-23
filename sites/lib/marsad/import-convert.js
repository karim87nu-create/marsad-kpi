// Converts a full copy of the old server's SQLite database (marsad-kpi-live.sqlite) into this server's tables.
// Both databases are synchronous handles with the better-sqlite3 API (better-sqlite3 in Node, a sql.js shim in
// the admin page), so this file has no Node-only import. The old database is only read.
// Passwords are copied as their original hashes; legacy.js verifies them on login.
import { liveSummary } from './arabicss.js';

const HEADER = ['Queue', 'Agent ID', 'Agent Name', 'Call Date', 'Start', 'End', 'Duration', 'Waiting', 'Phone', 'Status'];
const hms = s => (s == null ? '' : [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'));
const ms = v => (v == null ? null : typeof v === 'number' ? v : Date.parse(v));
const json = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const has = (db, table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);

function convertOld(target, old, { log = () => {}, now = Date.now() } = {}) {
  const report = { employees: 0, adminAccounts: 0, sessions: 0, events: 0, skippedEvents: 0, shiftDecisions: 0, historyDays: 0, liveSnapshots: 0, messages: 0, recipients: 0, reviews: 0, reports: 0, audit: 0 };
  if (target.prepare('SELECT COUNT(*) n FROM employees').get().n || target.prepare('SELECT COUNT(*) n FROM events').get().n)
    throw Error('target_not_empty: import into a fresh database only');

  target.transaction(() => {
    // ---- employees (same ids), old password hash kept as legacy_pin_hash ----
    for (const e of old.prepare('SELECT * FROM employees ORDER BY id').all()) {
      target.prepare('INSERT INTO employees (id, name, employee_code, legacy_pin_hash, active, created_at) VALUES (?,?,?,?,?,?)')
        .run(e.id, e.name, e.employee_code, e.pin_hash, e.active ? 1 : 0, ms(e.created_at) || now);
      report.employees++;
    }
    // ---- admin users (same ids), old hash verified on first login ----
    if (has(old, 'admin_accounts')) for (const a of old.prepare('SELECT * FROM admin_accounts ORDER BY id').all()) {
      target.prepare('INSERT INTO admin_accounts (id, name, role, password_hash, active, created_at) VALUES (?,?,?,?,?,?)')
        .run(a.id, a.name, a.role, a.password_hash, a.active ? 1 : 0, ms(a.created_at) || now);
      report.adminAccounts++;
    }
  })();
  log('employees ' + report.employees + ', admin users ' + report.adminAccounts);

  // ---- employee sessions: text ids → new integer ids ----
  const sessionMap = new Map();
  target.transaction(() => {
    const add = target.prepare('INSERT INTO employee_sessions (employee_id, device, extension, issued_at, bound_at, work_started_at, last_seen, expires_at, revoked_at, revoke_reason, client_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for (const s of old.prepare('SELECT * FROM employee_sessions ORDER BY issued_at, id').all()) {
      const r = add.run(s.employee_id, 'legacy:' + s.id, s.extension || '', s.issued_at, s.extension ? s.issued_at : null, null, s.last_seen, s.expires_at, s.revoked_at, s.reason, null);
      sessionMap.set(s.id, { id: Number(r.lastInsertRowid), employeeId: s.employee_id, extension: s.extension || '' });
      report.sessions++;
    }
  })();
  log('sessions ' + report.sessions);

  // ---- call events (streamed in batches; 280k rows) ----
  const addEvent = target.prepare(`INSERT OR IGNORE INTO events (session_id, employee_id, extension, event_type, event_key, occurred_at, received_at,
    duration_seconds, state, call_id, phone, queue, call_type, client_version, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const addShift = target.prepare('INSERT OR IGNORE INTO shift_decisions (request_id, employee_id, session_id, action, note, decided_at, decided_by) VALUES (?,?,?,?,?,?,?)');
  const firstWork = new Map(), lastClient = new Map();
  let batch = [];
  const flush = () => {
    target.transaction(rows => {
      for (const e of rows) {
        const p = json(e.payload);
        if (e.event_type === 'shift_include' || e.event_type === 'shift_exclude') {
          const s = sessionMap.get(p.targetSessionId);
          if (s) { addShift.run(e.event_key, s.employeeId, s.id, e.event_type === 'shift_include' ? 'include' : 'exclude', String(p.note || '—'), ms(e.occurred_at), p.actor?.name || 'legacy'); report.shiftDecisions++; }
          continue;
        }
        const s = sessionMap.get(p.sessionId);
        if (!s) { report.skippedEvents++; continue; }
        const at = ms(e.occurred_at);
        const state = p.state == null ? null : String(p.state).slice(0, 40);
        const r = addEvent.run(s.id, s.employeeId, e.extension, e.event_type, String(e.event_key).slice(0, 300), at, at,
          e.duration_seconds ?? null, state, e.call_id, e.phone, p.queue != null ? String(p.queue).slice(0, 20) : null, e.call_type, String(p.clientVersion || '').slice(0, 20), e.payload);
        if (r.changes) report.events++;
        if ((['ready', 'on_call'].includes(state) || ['agentlinked', 'call_observed'].includes(e.event_type)) && !firstWork.has(s.id)) firstWork.set(s.id, at);
        if (p.clientVersion) lastClient.set(s.id, String(p.clientVersion).slice(0, 20));
      }
    })(batch);
    batch = [];
  };
  let n = 0;
  for (const e of old.prepare('SELECT * FROM call_events ORDER BY id').iterate()) {
    batch.push(e);
    if (batch.length >= 5000) { flush(); log('events ' + (n += 5000)); }
  }
  if (batch.length) flush();
  target.transaction(() => {
    const set = target.prepare('UPDATE employee_sessions SET work_started_at = ?, client_version = COALESCE(?, client_version) WHERE id = ?');
    for (const s of sessionMap.values()) set.run(firstWork.get(s.id) ?? null, lastClient.get(s.id) ?? null, s.id);
  })();
  log('events ' + report.events + ' (skipped ' + report.skippedEvents + ')');

  // ---- Arabicss history: newest report per calendar date ----
  target.transaction(() => {
    const latest = old.prepare(`SELECT h.* FROM history_reports h WHERE h.id = (SELECT x.id FROM history_reports x WHERE x.report_date = h.report_date
      ORDER BY x.imported_at DESC, x.id DESC LIMIT 1) ORDER BY h.report_date`).all();
    for (const h of latest) {
      const calls = json(h.records);
      if (!Array.isArray(calls)) continue;
      const rep = target.prepare('INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)')
        .run(h.report_date, ms(h.imported_at), 'legacy:' + h.source, h.verified_total ? 1 : 0, h.row_count, JSON.stringify(HEADER), h.fingerprint);
      const add = target.prepare('INSERT INTO history_calls (report_id, idx, raw) VALUES (?,?,?)');
      calls.forEach((c, i) => add.run(rep.lastInsertRowid, i, JSON.stringify([c.queue, c.accountId, c.accountName, c.date, c.start, c.end, hms(c.durationSeconds), hms(c.waitSeconds), c.phone, c.status].map(v => String(v ?? '')))));
      report.historyDays++;
    }
  })();
  log('history days ' + report.historyDays);

  // ---- live queue captures and samples ----
  target.transaction(() => {
    const add = target.prepare('INSERT OR IGNORE INTO live_snapshots (capture_id, observed_at, received_at, changed, rows, waiting, active, longest_wait) VALUES (?,?,?,?,?,?,?,?)');
    if (has(old, 'queue_captures')) for (const c of old.prepare('SELECT * FROM queue_captures WHERE observed_at IS NOT NULL ORDER BY observed_at, id').iterate()) {
      const rows = json(c.records), list = Array.isArray(rows) ? rows : [];
      const s = liveSummary(list);
      report.liveSnapshots += add.run(c.id, ms(c.observed_at), ms(c.received_at), 1, JSON.stringify(list), s.waiting, s.active, s.longest).changes;
    }
    if (has(old, 'queue_observations')) for (const o of old.prepare('SELECT * FROM queue_observations ORDER BY observed_at').iterate())
      report.liveSnapshots += add.run('obs:' + o.observed_at, ms(o.observed_at), ms(o.observed_at), 1, '[]', o.waiting, o.active, o.longest_wait_seconds).changes;
  })();

  // ---- messages, follow-ups, saved reports, audit ----
  target.transaction(() => {
    if (has(old, 'admin_messages')) for (const m of old.prepare('SELECT * FROM admin_messages').all()) {
      target.prepare('INSERT INTO messages (id, title, message, priority, created_at, expires_at, created_by) VALUES (?,?,?,?,?,?,?)').run(m.id, m.title, m.message, m.priority, ms(m.created_at), ms(m.expires_at), 'legacy');
      report.messages++;
    }
    if (has(old, 'message_recipients')) for (const r of old.prepare('SELECT * FROM message_recipients').all()) {
      target.prepare('INSERT OR IGNORE INTO message_recipients (message_id, employee_id, delivered_at, acknowledged_at) VALUES (?,?,?,?)').run(r.message_id, r.employee_id, ms(r.delivered_at), ms(r.acknowledged_at));
      report.recipients++;
    }
    if (has(old, 'operation_reviews')) for (const r of old.prepare('SELECT * FROM operation_reviews').all()) {
      target.prepare('INSERT INTO reviews (id, date, reference, employee_id, title, owner, status, note, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(r.id, r.business_date, r.reference, r.employee_id, r.title, r.owner, r.status, r.note, ms(r.updated_at), 'legacy');
      report.reviews++;
    }
    if (has(old, 'operation_reports')) for (const r of old.prepare('SELECT * FROM operation_reports').all()) {
      target.prepare('INSERT INTO saved_reports (id, date, created_at, filters, payload) VALUES (?,?,?,?,?)').run(r.id, r.business_date, ms(r.created_at), r.filters, r.payload);
      report.reports++;
    }
    if (has(old, 'admin_audit')) for (const a of old.prepare('SELECT * FROM admin_audit ORDER BY id').iterate()) {
      const d = json(a.details);
      target.prepare('INSERT INTO audit (occurred_at, action, employee_id, details) VALUES (?,?,?,?)').run(ms(a.occurred_at), a.action, a.employee_id, JSON.stringify({ ...d, reference: a.reference || undefined, legacyId: a.id }));
      report.audit++;
    }
  })();
  log('done');
  return report;
}

// Tables the conversion fills, in an order that respects their references.
const IMPORT_TABLES = ['admin_accounts', 'employees', 'employee_sessions', 'events', 'shift_decisions', 'history_reports', 'history_calls', 'live_snapshots',
  'messages', 'message_recipients', 'reviews', 'saved_reports', 'audit'];

export { convertOld, IMPORT_TABLES, HEADER };
