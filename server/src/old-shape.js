'use strict';
// Presents this server's events in the shape the old server stored them in call_events,
// so the old logic in src/legacy-logic runs unchanged.
const { iso } = require('./time');
const { canonicalCallId } = require('./legacy-logic/dashboard-logic');

const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

// Old payload: the event fields plus employeeId and sessionId (inner payload under .payload).
function oldPayload(e) {
  const stored = parse(e.payload);
  if (stored.employeeId !== undefined && stored.sessionId !== undefined) return { ...stored, sessionId: String(e.session_id), employeeId: e.employee_id };
  return { state: e.state, callId: e.call_id, phone: e.phone, queue: e.queue, payload: stored, employeeId: e.employee_id, sessionId: String(e.session_id) };
}

const presenceEvent = e => ({ id: e.id, eventType: e.event_type, extension: e.extension, occurredAt: iso(e.occurred_at), payload: JSON.stringify(oldPayload(e)) });

const dashboardEvent = (e, names) => ({
  id: e.id, eventType: e.event_type, callId: e.call_id ? canonicalCallId(String(e.call_id)) : null, agentName: names.get(e.employee_id)?.name || '',
  extension: e.extension, phone: e.phone, callType: ['incoming', 'outgoing'].includes(e.call_type) ? e.call_type : null,
  occurredAt: iso(e.occurred_at), durationSeconds: e.duration_seconds ?? 0, payload: JSON.stringify(oldPayload(e)),
});

const historyCall = r => ({ queue: r.queue, accountId: r.accountName, accountName: r.accountName, date: r.date, start: r.start || '', end: r.end || '',
  durationSeconds: r.durationSeconds, waitSeconds: r.waitSeconds, phone: r.phone, status: r.status });

module.exports = { oldPayload, presenceEvent, dashboardEvent, historyCall, parse };
