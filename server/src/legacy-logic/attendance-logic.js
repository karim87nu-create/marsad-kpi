// Bundled unchanged from the old server: lib/attendance-durations.ts, lib/operations-insights.ts, lib/break-accounting.ts, lib/history.ts, lib/live-presence-reconciliation.ts (+ their imports).
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// entry3.ts
var entry3_exports = {};
__export(entry3_exports, {
  attendanceData: () => attendanceData,
  attendanceTimeline: () => attendanceTimeline,
  canonicalBreaks: () => canonicalBreaks,
  historyMetrics: () => historyMetrics,
  operatingCalls: () => operatingCalls,
  operationsInsights: () => operationsInsights,
  reconcileBreakStates: () => reconcileBreakStates,
  reconcileLiveCallStates: () => reconcileLiveCallStates,
  sessionDurations: () => sessionDurations,
  stateDurations: () => stateDurations
});
module.exports = __toCommonJS(entry3_exports);

var eventPayload = (e) => {
  try {
    return JSON.parse(e.payload || "{}");
  } catch {
    return {};
  }
};

function sessionDurations(sessions, start, end, now) {
  return sessions.map((s) => {
    const closureKnown = s.revokedAt !== null && !["browser_restarted", "expired_or_disconnected", "employee_removed", "extension_restarted"].includes(s.reason || "");
    const running = s.revokedAt === null && s.expiresAt > now && now - s.lastSeen < 9e4;
    const through = closureKnown ? s.revokedAt : running ? now : Math.min(s.lastSeen, s.expiresAt, now);
    const workStart = !/^\d{1,10}$/.test(s.extension) ? null : s.workStartedAt === void 0 ? s.issuedAt : s.workStartedAt;
    return { ...s, identityAt: new Date(s.issuedAt).toISOString(), identityDelaySeconds: workStart === null ? null : Math.max(0, Math.floor((workStart - s.issuedAt) / 1e3)), closureKnown, running: running && now < end && workStart !== null, observedThrough: new Date(through).toISOString(), startedAt: new Date(workStart ?? s.issuedAt).toISOString(), endedAt: closureKnown ? new Date(s.revokedAt).toISOString() : null, durationSeconds: workStart === null ? 0 : Math.max(0, Math.floor((through - workStart) / 1e3)), daySeconds: workStart === null ? 0 : Math.max(0, Math.floor((Math.min(through, end) - Math.max(workStart, start)) / 1e3)), dayStart: start, dayEnd: end, durationComplete: closureKnown || running };
  });
}
function attendanceTimeline(events, sessions, now) {
  return events.filter((e) => !e.callId && e.eventType !== "heartbeat").map((e) => {
    const p = eventPayload(e), session = sessions.find((s) => s.id === p.sessionId);
    const linked = events.filter((x) => eventPayload(x).sessionId === p.sessionId && Date.parse(x.occurredAt) >= Date.parse(e.occurredAt));
    if (["session_login", "session_logout", "arabicss_logout"].includes(e.eventType) && session) return { eventId: e.id, durationSeconds: session.durationSeconds, durationKind: "session", complete: session.durationComplete, running: session.running, startedAt: session.startedAt };
    if (e.eventType === "break_end") return { eventId: e.id, durationSeconds: e.durationSeconds, durationKind: "break", complete: true, running: false };
    if (e.eventType === "break_start") {
      const end = linked.find((x) => x.eventType === "break_end" || x.eventType === "break_end_unknown");
      if (end) return { eventId: e.id, durationSeconds: end.eventType === "break_end" ? end.durationSeconds : null, durationKind: "break", complete: end.eventType === "break_end", running: false };
      return { eventId: e.id, durationSeconds: null, durationKind: "break", complete: false, running: false };
    }
    if (["break_observed", "break_end_unknown", "call_observed", "call_observed_end", "page_closed"].includes(e.eventType)) return { eventId: e.id, durationSeconds: null, durationKind: "unknown", complete: false, running: false };
    return { eventId: e.id, durationSeconds: null, durationKind: "transition", complete: true, running: false };
  });
}
function stateDurations(spans, sessions, start, end, now) {
  const rows = [];
  for (const s of sessions) {
    if (!/^\d{1,10}$/.test(s.extension) || s.workStartedAt === null) continue;
    const workStart = s.workStartedAt ?? s.issuedAt;
    const list = spans.filter((p) => p.sessionId === s.id).sort((a, b) => a.started - b.started), sessionEnd = Math.min(s.revokedAt ?? s.expiresAt, end, now);
    let cursor = Math.max(workStart, start);
    const add = (state, a, b, evidenceUntil = b) => {
      a = Math.max(a, start, workStart);
      b = Math.min(b, sessionEnd);
      if (b > a) rows.push({ employeeId: s.employeeId, extension: s.extension, state, startedAt: new Date(a).toISOString(), endedAt: new Date(b).toISOString(), durationSeconds: Math.floor((b - a) / 1e3), running: state !== "unknown" && s.revokedAt === null && s.expiresAt > now && now - s.lastSeen < 9e4 && b === now, evidenceUntil });
    };
    for (let i = 0; i < list.length; i++) {
      const p = list[i], next = list[i + 1], a = Math.max(p.started, start);
      const linked = next && next.state === p.state && ["break", "on_call"].includes(p.state);
      const b = Math.min(next?.started ?? sessionEnd, linked ? next.started : p.lastEvidence + 9e4, sessionEnd);
      if (a > cursor) add("unknown", cursor, a);
      add(p.state, a, b, linked ? next.started : p.lastEvidence + 9e4);
      cursor = Math.max(cursor, b);
    }
    if (cursor < sessionEnd) add("unknown", cursor, sessionEnd);
    if (s.revokedAt !== null) {
      const next = sessions.filter((x) => x.employeeId === s.employeeId && x.issuedAt > s.issuedAt).sort((a2, b2) => a2.issuedAt - b2.issuedAt)[0];
      const interrupted = ["tab_closed", "browser_restarted", "expired_or_disconnected", "extension_restarted", "unapproved_disconnect"].includes(s.reason || "");
      const a = Math.max(s.revokedAt, start), b = Math.min(next?.issuedAt ?? end, end, now);
      if (b > a) rows.push({ employeeId: s.employeeId, extension: s.extension, state: interrupted ? "unknown" : "offline", startedAt: new Date(a).toISOString(), endedAt: new Date(b).toISOString(), durationSeconds: Math.floor((b - a) / 1e3), running: false, evidenceUntil: b });
    }
  }
  return rows.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
async function attendanceData(db, start, end, now, employee, extension) {
  const sessions = (await db.prepare("SELECT id,employee_id AS employeeId,extension,issued_at AS issuedAt,last_seen AS lastSeen,expires_at AS expiresAt,revoked_at AS revokedAt,reason FROM employee_sessions WHERE issued_at<? AND COALESCE(revoked_at,expires_at)>? AND (?='' OR employee_id=?) AND (?='' OR extension=?) ORDER BY issued_at LIMIT 5001").bind(end, start, employee, Number(employee), extension, extension).all()).results;
  if (sessions.length > 5e3) throw Error("attendance_session_limit");
  const spans = (await db.prepare(`WITH raw AS (
 SELECT id,json_extract(payload,'$.sessionId') sessionId,json_extract(payload,'$.employeeId') employeeId,extension,CAST(strftime('%s',occurred_at) AS INTEGER)*1000 at,
 CASE WHEN event_type='heartbeat' THEN COALESCE(json_extract(payload,'$.state'),'unknown') WHEN event_type IN ('session_login','arabicss_login') THEN 'logged_in' WHEN event_type IN ('break_start','break_observed') THEN 'break' WHEN event_type IN ('agentlinked','call_observed') THEN 'on_call' WHEN event_type IN ('agentunlinked','call_observed_end') THEN 'post_call' WHEN event_type IN ('break_end','break_end_unknown') THEN 'ready' ELSE 'unknown' END state
 FROM call_events WHERE occurred_at>=? AND occurred_at<? AND event_type IN ('heartbeat','session_login','arabicss_login','break_start','break_observed','break_end','break_end_unknown','agentlinked','agentunlinked','call_observed','call_observed_end','page_closed') AND (?='' OR json_extract(payload,'$.employeeId')=?) AND (?='' OR extension=?)
 ), previous AS (SELECT *,LAG(state) OVER(PARTITION BY sessionId ORDER BY at,id) prevState,LAG(at) OVER(PARTITION BY sessionId ORDER BY at,id) prevAt FROM raw), numbered AS (SELECT *,SUM(CASE WHEN prevState IS NULL OR state<>prevState OR at-prevAt>=90000 THEN 1 ELSE 0 END) OVER(PARTITION BY sessionId ORDER BY at,id ROWS UNBOUNDED PRECEDING) grp FROM previous)
 SELECT sessionId,employeeId,extension,state,MIN(at) started,MAX(at) lastEvidence FROM numbered WHERE sessionId IS NOT NULL GROUP BY sessionId,grp,state ORDER BY started LIMIT 10001`).bind(new Date(start - 12 * 36e5).toISOString(), new Date(Math.min(end, now + 1)).toISOString(), employee, Number(employee), extension, extension).all()).results;
  if (spans.length > 1e4) throw Error("attendance_state_limit");
  for (const s of sessions) {
    const first = spans.filter((p) => p.sessionId === s.id && /^\d+$/.test(p.extension) && ["ready", "on_call"].includes(p.state) && p.started >= s.issuedAt && p.started < Math.min(s.revokedAt ?? s.expiresAt, now + 1)).sort((a, b) => a.started - b.started)[0];
    s.workStartedAt = first?.started ?? null;
  }
  return { sessions: sessionDurations(sessions, start, end, now), states: stateDurations(spans, sessions, start, end, now) };
}

var zone = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function localParts(time) {
  return Object.fromEntries(zone.formatToParts(time).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}
function cairoClockWindow(date, clock) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(clock.trim());
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]), second = Number(m[3] || 0);
  if (minute > 59 || second > 59 || (m[4] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (m[4]) hour = hour % 12 + (m[4].toUpperCase() === "PM" ? 12 : 0);
  const [y, mo, d] = date.split("-").map(Number), wall = Date.UTC(y, mo - 1, d, hour, minute, second);
  const candidates = /* @__PURE__ */ new Set();
  for (const shift of [-12, 0, 12]) {
    const probe = wall + shift * 36e5, p = localParts(probe), offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - probe;
    const candidate = wall - offset, q = localParts(candidate);
    if (q.year === y && q.month === mo && q.day === d && q.hour === hour && q.minute === minute && q.second === second) candidates.add(candidate);
  }
  if (!candidates.size) return null;
  const times = [...candidates];
  return { start: Math.min(...times), end: Math.max(...times) + (m[3] ? 999 : 59999), precision: m[3] ? "second" : "minute", ambiguous: times.length > 1 };
}

var shiftDate = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 864e5).toISOString().slice(0, 10);
function businessDateAt(at = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const value = (key) => parts.find((p) => p.type === key).value;
  const date = value("year") + "-" + value("month") + "-" + value("day");
  return Number(value("hour")) < 9 ? shiftDate(date, -1) : date;
}
function businessWindow(date) {
  const next = shiftDate(date, 1);
  const end = cairoClockWindow(next, "03:00:00").start;
  return { start: cairoClockWindow(date, "09:00:00").start, operatingEnd: end, end: cairoClockWindow(next, "09:00:00").start };
}
function historyBusinessTime(call) {
  const clock = cairoClockWindow(call.date, call.start) || cairoClockWindow(call.date, call.end);
  if (!clock) return { businessDate: call.date, outsideHours: null };
  const date = businessDateAt(new Date(clock.start)), window = businessWindow(date);
  return { businessDate: date, outsideHours: clock.start >= window.operatingEnd };
}

function queuePurpose(queue) {
  return { "0": "after_hours", "1": "order_request", "2": "order_followup", "3": "complaint" }[queue.trim().slice(-1)] || "unknown";
}
function operatingCalls(calls) {
  return calls.filter((c) => historyBusinessTime(c).outsideHours !== true && ["order_request", "order_followup", "complaint"].includes(queuePurpose(c.queue)));
}
var SHORT_ABANDON_SECONDS = 7;
function isShortAbandon(c) {
  return c.status.toLowerCase() === "abandoned" && c.waitSeconds !== null && c.waitSeconds <= SHORT_ABANDON_SECONDS;
}
function historyMetrics(calls, threshold = 10) {
  const recordedCalls = calls.length, shortAbandoned = calls.filter(isShortAbandon).length;
  calls = calls.filter((c) => !isShortAbandon(c));
  const answered = calls.filter((c) => c.status.toLowerCase() === "success"), rawAbandoned = calls.filter((c) => c.status.toLowerCase() === "abandoned");
  const abandoned = rawAbandoned.filter((c) => c.waitSeconds !== null && c.waitSeconds > SHORT_ABANDON_SECONDS), unclassifiedAbandoned = rawAbandoned.filter((c) => c.waitSeconds === null).length;
  const unknown = calls.length - answered.length - rawAbandoned.length, waits = answered.map((c) => c.waitSeconds), durations = answered.map((c) => c.durationSeconds);
  const validWaits = waits.every((v) => v !== null), validDurations = durations.every((v) => v !== null);
  const within = answered.filter((c) => c.waitSeconds !== null && c.waitSeconds <= threshold).length;
  return { calls: calls.length, recordedCalls, shortAbandoned, shortAbandonSeconds: SHORT_ABANDON_SECONDS, unclassifiedAbandoned, answered: answered.length, abandoned: abandoned.length, unknownStatuses: unknown, asa: answered.length && validWaits ? waits.reduce((a, v) => a + v, 0) / answered.length : null, sla: !unknown && !unclassifiedAbandoned && validWaits && calls.length ? within / calls.length * 100 : null, abandonmentRate: !unknown && !unclassifiedAbandoned && calls.length ? abandoned.length / calls.length * 100 : null, meanCallSeconds: answered.length && validDurations ? durations.reduce((a, v) => a + v, 0) / answered.length : null, answeredWithinThreshold: within, slaThresholdSeconds: threshold, missingWaits: waits.filter((v) => v === null).length, unattributed: calls.length };
}

var overlap = (a, b, start, end) => Math.max(0, Math.min(b, end) - Math.max(a, start)) / 1e3;
var numberPhone = (v) => String(v || "").replace(/\D/g, "");
function operationsInsights(input, profileExtension = "") {
  const { date, staff, sessions, states, calls, events, history, now } = input, w = businessWindow(date), finish = Math.min(w.operatingEnd, now);
  const operating = operatingCalls(history), observedCalls = calls.filter((c) => !c.outsideHours && Date.parse(c.startedAt) >= w.start && Date.parse(c.startedAt) < w.operatingEnd);
  const clipped = states.map((s) => ({ ...s, seconds: overlap(Date.parse(s.startedAt), Date.parse(s.endedAt), w.start, finish) })).filter((s) => s.seconds > 0);
  const profiles = staff.map((e) => {
    const ss = sessions.filter((s) => s.employeeId === e.id && (!profileExtension || s.extension === profileExtension)), spans = clipped.filter((s) => s.employeeId === e.id && (!profileExtension || s.extension === profileExtension)), cc = observedCalls.filter((c) => c.employeeId === e.id && (!profileExtension || c.extension === profileExtension)), done = cc.filter((c) => c.eventType === "agentunlinked");
    const duration = (state) => Math.round(spans.filter((s) => s.state === state).reduce((n, s) => n + s.seconds, 0));
    const totals = input.breakTotals?.find((p) => p.employeeId === e.id), readySeconds = duration("ready"), callSeconds = duration("on_call"), breakSeconds = totals?.totalBreakSeconds ?? duration("break"), unknownSeconds = duration("unknown") + duration("break_unconfirmed");
    const transitions = ss.map((s) => {
      const after = events.filter((t) => t.employeeId === e.id && t.extension === s.extension && Date.parse(t.occurredAt) >= s.issuedAt && Date.parse(t.occurredAt) < Math.min(s.revokedAt ?? s.expiresAt, s.expiresAt));
      const binding = after.filter((t) => t.eventType === "session_login" && /^\d+$/.test(t.extension)).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))[0];
      const ready = states.filter((t) => t.employeeId === e.id && t.extension === s.extension && t.state === "ready" && Date.parse(t.startedAt) >= Math.max(s.issuedAt, binding ? Date.parse(binding.occurredAt) : s.issuedAt) && Date.parse(t.startedAt) < Math.min(s.revokedAt ?? s.expiresAt, s.expiresAt)).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))[0];
      return { sessionId: s.id, extension: s.extension, loginAt: new Date(s.issuedAt).toISOString(), boundAt: binding?.occurredAt || null, readyAt: ready?.startedAt || null, logoutAt: s.revokedAt ? new Date(s.revokedAt).toISOString() : null, delaySeconds: ready ? Math.max(0, Math.floor((Date.parse(ready.startedAt) - s.issuedAt) / 1e3)) : null };
    });
    const sessionSeconds = ss.reduce((n, s) => n + s.daySeconds, 0), knownSeconds = spans.filter((s) => !["unknown", "break_unconfirmed", "offline", "logged_in"].includes(s.state)).reduce((n, s) => n + s.seconds, 0), operatingSessionSeconds = ss.reduce((n, s) => n + (s.workStartedAt === null ? 0 : overlap(s.workStartedAt ?? s.issuedAt, Math.min(s.revokedAt ?? s.expiresAt, now), w.start, finish)), 0);
    return { ...e, sessionSeconds, operatingSessionSeconds, readySeconds, callSeconds, breakSeconds, completedBreakSeconds: totals?.completedBreakSeconds ?? spans.filter((s) => s.state === "break" && !s.running).reduce((n, s) => n + s.seconds, 0), ongoingBreakSeconds: totals?.ongoingBreakSeconds ?? spans.filter((s) => s.state === "break" && s.running).reduce((n, s) => n + s.seconds, 0), unknownSeconds, knownSeconds: Math.round(knownSeconds), observedPercent: operatingSessionSeconds ? Math.min(100, Math.round(knownSeconds / operatingSessionSeconds * 100)) : null, calls: cc.length, completed: done.length, inbound: cc.filter((c) => c.callType === "incoming").length, outbound: cc.filter((c) => c.callType === "outgoing").length, averageCallSeconds: done.length ? Math.round(done.reduce((n, c) => n + c.durationSeconds, 0) / done.length) : null, callsPerReadyHour: readySeconds ? Math.round(cc.length / (readySeconds / 3600) * 100) / 100 : null, occupancy: readySeconds + callSeconds ? Math.round(callSeconds / (readySeconds + callSeconds) * 1e4) / 100 : null, longCalls: done.filter((c) => c.durationSeconds > 240).length, callExcessSeconds: done.reduce((n, c) => n + Math.max(0, c.durationSeconds - 240), 0), breakRemainingSeconds: Math.max(0, 1800 - breakSeconds), breakExcessSeconds: Math.max(0, breakSeconds - 1800), breakIntervals: spans.filter((s) => s.state === "break").length, transitions, smallSample: cc.length < 10 || readySeconds + callSeconds < 3600 };
  });
  const buckets = [];
  for (let start = w.start; start < w.operatingEnd; start += 18e5) {
    const end = Math.min(start + 18e5, w.operatingEnd), elapsed = Math.max(0, Math.min(now, end) - start) / 1e3;
    const source = operating.filter((c) => {
      const t = cairoClockWindow(c.date, c.start);
      return t && t.start >= start && t.start < end;
    });
    const m = historyMetrics(source);
    const readyAgentSeconds = clipped.filter((s) => s.state === "ready").reduce((n, s) => n + overlap(Date.parse(s.startedAt), Date.parse(s.endedAt), start, Math.min(now, end)), 0), onCallSeconds = clipped.filter((s) => s.state === "on_call").reduce((n, s) => n + overlap(Date.parse(s.startedAt), Date.parse(s.endedAt), start, Math.min(now, end)), 0);
    buckets.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), future: elapsed === 0, received: input.hasHistory ? m.calls : null, recorded: input.hasHistory ? source.length : null, shortAbandoned: input.hasHistory ? m.shortAbandoned : null, answered: input.hasHistory ? m.answered : null, answeredWithinThreshold: input.hasHistory ? m.answeredWithinThreshold : null, abandoned: input.hasHistory ? m.abandoned : null, asa: m.asa, sla: m.sla, readyAgentMinutes: Math.round(readyAgentSeconds / 60), averageReadyEmployees: elapsed ? Math.round(readyAgentSeconds / elapsed * 100) / 100 : null, onCallAgentMinutes: Math.round(onCallSeconds / 60), totalWaitSeconds: input.hasHistory ? source.filter((c) => !isShortAbandon(c)).reduce((n, c) => n + (c.waitSeconds ?? 0), 0) : null, unknownWaitCalls: input.hasHistory ? source.filter((c) => !isShortAbandon(c) && c.waitSeconds == null).length : null, observedCoverageOnly: true });
  }
  const breaks = clipped.filter((s) => s.state === "break"), times = [...new Set(breaks.flatMap((s) => [Math.max(w.start, Date.parse(s.startedAt)), Math.min(finish, Date.parse(s.endedAt))]))].sort((a, b) => a - b), breakOverlaps = [];
  for (let i = 0; i < times.length - 1; i++) {
    const a = times[i], b = times[i + 1], employees = [...new Set(breaks.filter((s) => Date.parse(s.startedAt) <= a && Date.parse(s.endedAt) >= b).map((s) => s.employeeId))];
    if (employees.length > 1 && b > a) breakOverlaps.push({ startedAt: new Date(a).toISOString(), endedAt: new Date(b).toISOString(), employeeIds: employees, seconds: Math.floor((b - a) / 1e3), readyEmployeeIds: [...new Set(clipped.filter((s) => s.state === "ready" && Date.parse(s.startedAt) <= a && Date.parse(s.endedAt) >= b).map((s) => s.employeeId))] });
  }
  const customers = /* @__PURE__ */ new Map();
  for (const c of history) {
    const phone = numberPhone(c.phone);
    if (!phone) continue;
    const t = cairoClockWindow(c.date, c.start) || cairoClockWindow(c.date, c.end);
    if (!t) continue;
    const at = new Date(t.start).toISOString(), p = customers.get(phone) || { phone: c.phone, calls: 0, answered: 0, abandoned: 0, employees: /* @__PURE__ */ new Set(), firstAt: at, lastAt: at };
    p.calls++;
    if (c.status.toLowerCase() === "success") p.answered++;
    if (c.status.toLowerCase() === "abandoned") p.abandoned++;
    if (at < p.firstAt) p.firstAt = at;
    if (at > p.lastAt) p.lastAt = at;
    customers.set(phone, p);
  }
  for (const c of calls) {
    const p = customers.get(numberPhone(c.phone));
    if (p) p.employees.add(c.employeeId);
  }
  const handovers = [];
  const extMap = /* @__PURE__ */ new Map();
  for (const s of sessions) {
    if (!s.extension) continue;
    const a = extMap.get(s.extension) || [];
    a.push(s);
    extMap.set(s.extension, a);
  }
  for (const [extension, list] of extMap) {
    list.sort((a, b) => a.issuedAt - b.issuedAt);
    for (let i = 1; i < list.length; i++) {
      const before = list[i - 1], after = list[i];
      if (before.employeeId === after.employeeId) continue;
      handovers.push({ extension, previousEmployeeId: before.employeeId, nextEmployeeId: after.employeeId, previousLogoutAt: before.revokedAt ? new Date(before.revokedAt).toISOString() : null, nextLoginAt: new Date(after.issuedAt).toISOString(), gapSeconds: before.revokedAt ? Math.round((after.issuedAt - before.revokedAt) / 1e3) : null });
    }
  }
  const counted = operating.filter((c) => !isShortAbandon(c)), totalWait = counted.reduce((n, c) => n + (c.waitSeconds ?? 0), 0), missingWait = counted.filter((c) => c.waitSeconds === null).length;
  return { operatingWindow: { start: new Date(w.start).toISOString(), end: new Date(w.operatingEnd).toISOString() }, profiles, buckets, breakOverlaps, customers: [...customers.values()].map((c) => ({ ...c, employeeIds: [...c.employees], employees: void 0 })).sort((a, b) => b.calls - a.calls), handovers, wait: { totalSeconds: input.hasHistory ? totalWait : null, unknownCalls: input.hasHistory ? missingWait : null }, coverage: { hasHistory: input.hasHistory, historyVerified: input.historyVerified, missingDates: input.missingDates, statesRecorded: states.length, unknownSeconds: Math.round(clipped.filter((s) => ["unknown", "break_unconfirmed"].includes(s.state)).reduce((n, s) => n + s.seconds, 0)), notProofOfCompleteDay: true }, rules: { slaSeconds: 10, shortAbandonSeconds: 7, callAlertSeconds: 240, breakPeriodSeconds: 900, breakBudgetSeconds: 1800, businessStart: "09:00", operatingEnd: "03:00", businessEnd: "09:00", timezone: "Africa/Cairo" } };
}

function canonicalBreaks(periods, start, end) {
  const rows = periods.map((p) => ({ ...p, a: Math.max(start, Date.parse(p.startedAt)), b: Math.min(end, Date.parse(p.endedAt)) })).filter((p) => p.employeeId && p.b > p.a).sort((x, y) => x.employeeId - y.employeeId || x.extension.localeCompare(y.extension) || x.a - y.a);
  const result = [];
  for (const p of rows) {
    const last = result.at(-1);
    if (last && last.employeeId === p.employeeId && last.extension === p.extension && p.a < last.b) {
      last.b = Math.max(last.b, p.b);
      last.running = last.running || p.running;
      last.completedBreak = last.completedBreak && p.completedBreak;
    } else result.push({ ...p });
  }
  return result.map((p) => ({ ...p, state: "break", startedAt: new Date(p.a).toISOString(), endedAt: new Date(p.b).toISOString(), durationSeconds: Math.floor((p.b - p.a) / 1e3), evidenceUntil: p.evidenceUntil ?? p.b }));
}
function reconcileBreakStates(states, breaks) {
  const result = [];
  for (const s of states) {
    let pieces = [[Date.parse(s.startedAt), Date.parse(s.endedAt)]];
    for (const p of breaks.filter((p2) => p2.employeeId === s.employeeId && p2.extension === s.extension)) {
      const a = Date.parse(p.startedAt), b = Date.parse(p.endedAt);
      pieces = pieces.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([u, v]) => v > u));
    }
    for (const [a, b] of pieces) result.push({ ...s, state: s.state === "break" ? "break_unconfirmed" : s.state, startedAt: new Date(a).toISOString(), endedAt: new Date(b).toISOString(), durationSeconds: Math.floor((b - a) / 1e3), running: s.running && b === Date.parse(s.endedAt) });
  }
  return [...result, ...breaks].sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt));
}

var LIVE_SNAPSHOT_MAX_AGE_MS = 3e4;
var ACTIVE_SESSION_MAX_AGE_MS = 5 * 6e4;
function reconcileLiveCallStates(presence, snapshot, now = Date.now()) {
  if (!snapshot) return presence;
  const observedAt = Date.parse(snapshot.observedAt), age = now - observedAt;
  if (!Number.isFinite(observedAt) || age < 0 || age >= LIVE_SNAPSHOT_MAX_AGE_MS) return presence;
  let rows;
  try {
    rows = JSON.parse(snapshot.records);
  } catch {
    return presence;
  }
  if (!Array.isArray(rows)) return presence;
  const liveExtensions = /* @__PURE__ */ new Set();
  for (const value of rows) {
    if (!Array.isArray(value) || !/^live call$/i.test(String(value[10] || "").trim())) continue;
    const extension = String(value[1] || "").trim();
    if (/^\d{1,10}$/.test(extension)) liveExtensions.add(extension);
  }
  if (!liveExtensions.size) return presence;
  let changed = false;
  const result = presence.map((person) => {
    const extension = String(person.extension || "").trim();
    if (!liveExtensions.has(extension) || person.expiresAt <= now || now - person.lastSeen < 0 || now - person.lastSeen >= ACTIVE_SESSION_MAX_AGE_MS) return person;
    const owners = presence.filter((other) => String(other.extension || "").trim() === extension && other.expiresAt > now && now - other.lastSeen >= 0 && now - other.lastSeen < ACTIVE_SESSION_MAX_AGE_MS);
    if (owners.length !== 1 || owners[0].employeeId !== person.employeeId) return person;
    if (person.state === "on_call") return person;
    changed = true;
    return { ...person, state: "on_call", evidenceAt: snapshot.observedAt, startedAt: null, elapsedSeconds: null, callId: "", phone: "", callType: "", queue: "" };
  });
  return changed ? result : presence;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  attendanceData,
  attendanceTimeline,
  canonicalBreaks,
  historyMetrics,
  operatingCalls,
  operationsInsights,
  reconcileBreakStates,
  reconcileLiveCallStates,
  sessionDurations,
  stateDurations
});
