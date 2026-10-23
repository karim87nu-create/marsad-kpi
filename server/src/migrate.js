'use strict';
// Copies data from the old Marsad server into this one, read-only on the old side.
// Uses only the old server's admin API (the same calls the admin page makes).
// Passwords cannot be read through the API: employees and admin users are copied
// without them, unless a database export with the original hashes is supplied later.
const { addDays, dayWindow, businessDay, validDate } = require('./time');

async function fetchOld({ baseUrl, adminPassword, from, to, fetchImpl = fetch, log = () => {} }) {
  const get = async path => {
    const r = await fetchImpl(baseUrl + path, { headers: { 'x-admin-password': adminPassword }, cache: 'no-store' });
    const text = await r.text();
    if (!r.ok) throw Error(path + ' → ' + r.status + ' ' + text.slice(0, 200));
    return JSON.parse(text);
  };
  let token = adminPassword;
  try {
    const r = await fetchImpl(baseUrl + '/api/admin-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', password: adminPassword }) });
    if (r.ok) token = (await r.json()).token || adminPassword;
  } catch {}
  adminPassword = token;
  const out = { fetchedAt: new Date().toISOString(), baseUrl, employees: await get('/api/employees'), days: [] };
  try { out.adminAccess = await get('/api/admin-access'); } catch (e) { out.adminAccessError = e.message; }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    log('day ' + d);
    const day = { date: d };
    try { day.dashboard = await get('/api/dashboard?' + new URLSearchParams({ date: d, attendance: '1', all: '1' })); } catch (e) { day.dashboardError = e.message; }
    try { day.history = await get('/api/history?' + new URLSearchParams({ date: d, all: '1' })); } catch (e) { day.historyError = e.message; }
    try { day.messages = await get('/api/messages?' + new URLSearchParams({ date: d })); } catch (e) { day.messagesError = e.message; }
    try { day.operations = await get('/api/operations?' + new URLSearchParams({ date: d })); } catch (e) { day.operationsError = e.message; }
    out.days.push(day);
  }
  return out;
}

// Writes a fetched export into the new database. Safe to run again: existing rows are kept.
function applyExport(db, data, { now = Date.now() } = {}) {
  const report = { employees: 0, adminAccounts: 0, sessions: 0, events: 0, historyDays: 0, messages: 0, reviews: 0, skipped: [] };
  db.exec('CREATE TABLE IF NOT EXISTS legacy_archive (key TEXT PRIMARY KEY, saved_at INTEGER NOT NULL, json TEXT NOT NULL)');
  const archive = db.prepare('INSERT OR REPLACE INTO legacy_archive (key, saved_at, json) VALUES (?,?,?)');
  archive.run('export:' + data.fetchedAt, now, JSON.stringify(data));      // nothing is lost even if a field is not mapped

  db.transaction(() => {
    // ---- employees: same ids, names, codes, active flag; no password yet ----
    const idMap = new Map();
    const all = [...(data.employees?.employees || []), ...(data.employees?.archivedEmployees || [])];
    for (const e of all) {
      const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(e.id) || db.prepare('SELECT id FROM employees WHERE employee_code = ? AND deleted_at IS NULL').get(e.employeeCode);
      if (existing) { idMap.set(e.id, existing.id); continue; }
      const deleted = e.historyOnly || (!e.active && /محذوف/.test(e.name || ''));
      db.prepare('INSERT INTO employees (id, name, employee_code, active, created_at, deleted_at) VALUES (?,?,?,?,?,?)')
        .run(e.id, String(e.name || '').replace(/ — محذوف$/, ''), String(e.employeeCode || 'legacy-' + e.id), e.active ? 1 : 0, now, e.historyOnly ? now : null);
      idMap.set(e.id, e.id);
      report.employees++;
    }
    // ---- admin users: names and roles, disabled until a password is set ----
    for (const a of data.adminAccess?.accounts || []) {
      if (db.prepare('SELECT 1 FROM admin_accounts WHERE name = ? AND deleted_at IS NULL').get(a.name)) continue;
      db.prepare("INSERT INTO admin_accounts (name, role, password_hash, active, created_at) VALUES (?,?,'!needs-password',0,?)").run(a.name, a.role, now);
      report.adminAccounts++;
    }

    // ---- per day: sessions, state spans, breaks, calls rebuilt as events ----
    const ms = v => (typeof v === 'number' ? v : Date.parse(v || ''));
    const addEvent = db.prepare(`INSERT OR IGNORE INTO events (session_id, employee_id, extension, event_type, event_key, occurred_at, received_at, duration_seconds, state, call_id, phone, queue, call_type, client_version, payload)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const sessionIds = new Map();
    for (const day of data.days || []) {
      const d = day.dashboard;
      if (d?.attendance) for (const s of d.attendance.sessions || []) {
        const key = 'legacy:' + s.id;
        if (sessionIds.has(key)) continue;
        const employeeId = idMap.get(s.employeeId) ?? s.employeeId;
        if (!db.prepare('SELECT 1 FROM employees WHERE id = ?').get(employeeId)) { report.skipped.push('session for unknown employee ' + s.employeeId); continue; }
        const issued = ms(s.issuedAt ?? s.startedAt), end = ms(s.revokedAt ?? s.endedAt ?? s.observedThrough);
        if (!Number.isFinite(issued)) continue;
        const revoked = Number.isFinite(end) && !s.running ? end : null;
        const seen = db.prepare('SELECT id FROM employee_sessions WHERE device = ?').get(key);
        if (seen) { sessionIds.set(key, { id: seen.id, employeeId, extension: String(s.extension || ''), issued, end: revoked ?? end }); continue; }
        const r = db.prepare('INSERT INTO employee_sessions (employee_id, device, extension, issued_at, bound_at, work_started_at, last_seen, expires_at, revoked_at, revoke_reason, client_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(employeeId, key, String(s.extension || ''), issued, s.extension ? issued : null, s.workStartedAt == null ? null : ms(s.workStartedAt),
            Number.isFinite(end) ? end : issued, revoked ?? issued + 18 * 3600000, revoked ?? now, revoked ? (s.closeReason || 'legacy_import') : 'legacy_import', 'legacy');
        sessionIds.set(key, { id: Number(r.lastInsertRowid), employeeId, extension: String(s.extension || ''), issued, end: revoked ?? end });
        report.sessions++;
      }
      const sessionAt = (employeeId, extension, t) => [...sessionIds.values()].find(x => x.employeeId === (idMap.get(employeeId) ?? employeeId) && (!extension || x.extension === String(extension)) && t >= x.issued - 1000 && t <= (x.end ?? Infinity) + 1000);
      const put = (s, type, t, extra = {}) => {
        const r = addEvent.run(s.id, s.employeeId, s.extension, type, 'legacy:' + type + ':' + t + ':' + (extra.key || ''), t, now, extra.duration ?? null, extra.state ?? null,
          extra.callId ?? null, extra.phone ?? null, extra.queue ?? null, extra.callType ?? null, 'legacy', JSON.stringify({ legacy: true }));
        if (r.changes) report.events++;
      };
      for (const st of d?.attendance?.states || []) {
        const t = ms(st.startedAt), s = sessionAt(st.employeeId, st.extension, t);
        if (!s || !Number.isFinite(t)) continue;
        if (['ready', 'on_call', 'unknown'].includes(st.state)) put(s, 'heartbeat', t, { state: st.state });
        else if (st.state === 'break_unconfirmed') put(s, 'break_observed', t, { state: 'break' });
        // Keep the state alive across its whole span (the engine treats >90s of silence as a gap).
        const end = ms(st.endedAt);
        if (st.state !== 'unknown' && Number.isFinite(end)) for (let x = t + 60000; x < end; x += 60000) put(s, 'heartbeat', x, { state: st.state === 'break_unconfirmed' ? 'break' : st.state });
      }
      for (const b of d?.completedBreaks || []) {
        const a = ms(b.startedAt), z = ms(b.endedAt), s = sessionAt(b.employeeId, b.extension, a);
        if (!s) continue;
        put(s, 'break_start', a, { state: 'break' });
        for (let x = a + 60000; x < z; x += 60000) put(s, 'heartbeat', x, { state: 'break' });
        put(s, 'break_end', z, { state: 'ready', duration: Math.round((z - a) / 1000) });
      }
      for (const c of d?.calls || []) {
        if (c.attributionSource === 'history_session') continue;    // rebuilt from the Arabicss history instead
        const a = ms(c.startedAt), s = sessionAt(c.employeeId, c.extension, a);
        if (!s || !Number.isFinite(a)) continue;
        const callId = c.callId || 'legacy-' + c.id;
        put(s, 'agentlinked', a, { key: callId, state: 'on_call', callId, phone: c.phone, queue: c.queue, callType: c.callType });
        if (c.eventType === 'agentunlinked') put(s, 'agentunlinked', ms(c.occurredAt), { key: callId, state: 'ready', callId, duration: c.durationSeconds });
      }

      // ---- Arabicss history for the day (raw rows, re-parsed by this server) ----
      const records = day.history?.records;
      if (Array.isArray(records) && records.length && !db.prepare('SELECT 1 FROM history_reports WHERE date = ?').get(day.date)) {
        const header = ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status'];
        const dur = v => (v == null ? '' : String(v));
        const byDate = new Map();
        for (const r of records) { const k = r.date || day.date; if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push([r.queue, r.accountName, k, r.start, r.end, dur(r.durationSeconds), dur(r.waitSeconds), r.phone, r.status].map(v => String(v ?? ''))); }
        for (const [date, rows] of byDate) {
          if (db.prepare('SELECT 1 FROM history_reports WHERE date = ?').get(date)) continue;
          const rep = db.prepare('INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)')
            .run(date, ms(day.history.report?.importedAt) || now, 'legacy', day.history.report?.verifiedTotal ? 1 : 0, rows.length, JSON.stringify(header), 'legacy:' + date);
          rows.forEach((row, i) => db.prepare('INSERT INTO history_calls (report_id, idx, raw) VALUES (?,?,?)').run(rep.lastInsertRowid, i, JSON.stringify(row)));
          report.historyDays++;
        }
      }

      // ---- messages and follow-ups ----
      for (const m of day.messages?.messages || []) {
        if (!db.prepare('SELECT 1 FROM messages WHERE id = ?').get(m.id)) {
          db.prepare('INSERT INTO messages (id, title, message, priority, created_at, expires_at, created_by) VALUES (?,?,?,?,?,?,?)').run(m.id, m.title, m.message, m.priority, ms(m.created_at), ms(m.expires_at), 'legacy');
          report.messages++;
        }
        if (m.employee_id && db.prepare('SELECT 1 FROM employees WHERE id = ?').get(idMap.get(m.employee_id) ?? m.employee_id))
          db.prepare('INSERT OR IGNORE INTO message_recipients (message_id, employee_id, delivered_at, acknowledged_at) VALUES (?,?,?,?)')
            .run(m.id, idMap.get(m.employee_id) ?? m.employee_id, m.delivered_at ? ms(m.delivered_at) : null, m.acknowledged_at ? ms(m.acknowledged_at) : null);
      }
      for (const r of day.operations?.reviews || []) {
        const res = db.prepare('INSERT OR IGNORE INTO reviews (id, date, reference, employee_id, title, owner, status, note, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(r.id, day.date, r.reference, r.employeeId ?? null, r.title, r.owner || '', r.status, r.note || '', ms(r.updatedAt) || now, 'legacy');
        report.reviews += res.changes;
      }
      archive.run('day:' + day.date, now, JSON.stringify(day));
    }
  })();
  return report;
}

function defaultRange(now = Date.now(), days = 60) {
  const to = businessDay(now);
  return { from: addDays(to, -(days - 1)), to };
}

module.exports = { fetchOld, applyExport, defaultRange, validDate, dayWindow };
