'use strict';
// "Who was available during this missed call" — uses the old server's own logic files
// (src/legacy-logic, transpiled unchanged from lib/*.ts) so results are identical.
// This module only reshapes this server's tables into the inputs that logic expects.
const { prepareMissedContext } = require('./legacy-logic/missed-context');
const { dayWindow, iso } = require('./time');
const { presenceEvent, historyCall } = require('./old-shape');

const OLD_EXIT = { manual: 'explicit_logout' };

function setup(app) {
  const { db } = app;

  // lib/shift-responsibility.ts loadShiftData(), read from this server's tables.
  app.oldShiftData = function shiftData(from, to) {
    const rows = db.prepare(`SELECT * FROM employee_sessions WHERE issued_at <= ? AND (issued_at >= ? OR id IN (
        SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY issued_at DESC, id DESC) rn FROM employee_sessions WHERE issued_at < ?) WHERE rn = 1))
      ORDER BY issued_at`).all(to, from, from);
    const sessions = rows.map(s => ({ id: String(s.id), employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, revokedAt: s.revoked_at ?? null, reason: OLD_EXIT[s.revoke_reason] || s.revoke_reason || null }));
    const byId = new Map(rows.map(s => [s.id, s]));
    const adjustments = db.prepare('SELECT * FROM shift_decisions ORDER BY decided_at, id').all().filter(d => byId.has(d.session_id) || db.prepare('SELECT 1 FROM employee_sessions WHERE id = ? AND issued_at <= ?').get(d.session_id, to))
      .map(d => ({ id: d.id, eventType: 'shift_' + d.action, occurredAt: iso(d.decided_at),
        payload: JSON.stringify({ targetSessionId: String(d.session_id), effectiveAt: (byId.get(d.session_id) || db.prepare('SELECT revoked_at FROM employee_sessions WHERE id = ?').get(d.session_id))?.revoked_at, note: d.note }) }));
    return { sessions, adjustments };
  };

  function inputs(date) {
    const w = dayWindow(date), from = w.start - 12 * 3600000, to = w.end;
    const employees = db.prepare('SELECT id, name, employee_code, created_at FROM employees').all()
      .map(e => ({ id: e.id, name: e.name, employeeCode: e.employee_code, createdAt: iso(e.created_at) }));
    const events = db.prepare('SELECT * FROM events WHERE occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at, id').all(from, to).map(presenceEvent);
    return { employees, events, shifts: app.oldShiftData(from, to) };
  }

  // Cached per day until a new event or a newer Arabicss report arrives.
  const cache = new Map();
  function cachedResolver(date, now) {
    const h = app.dayHistory(date, now), key = date + '|' + h.key + '|' + db.prepare('SELECT MAX(id) m FROM events').get().m + '|' + db.prepare('SELECT COUNT(*) n FROM shift_decisions').get().n;
    if (!cache.has(key)) { if (cache.size > 6) cache.delete(cache.keys().next().value); cache.set(key, { h, resolve: app.missedResolver(date, h.records) }); }
    return cache.get(key);
  }
  app.missedOne = (date, index, now = app.now()) => { const { h, resolve } = cachedResolver(date, now), rec = h.records[index]; return rec ? resolve(rec) : null; };
  app.missedAll = (date, now = app.now()) => { const { h, resolve } = cachedResolver(date, now); return { reportId: h.report?.id, contexts: h.missed.map(m => ({ index: m.index, ...resolve(h.records[m.index]) })) }; };

  // Returns resolve(record) → { call, context } for one data day.
  app.missedResolver = function missedResolver(date, records) {
    const { employees, events, shifts } = inputs(date);
    const calls = records.map(historyCall);
    const resolve = prepareMissedContext(employees, events, shifts, calls);
    return rec => ({ call: calls[rec.index], context: resolve(calls[rec.index]) });
  };
}

module.exports = { setup };
