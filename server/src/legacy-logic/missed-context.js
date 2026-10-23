// Transpiled unchanged from the old server's lib/missed-context.ts — do not edit; it defines the old results.
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
var missed_context_exports = {};
__export(missed_context_exports, {
  cairoClockWindow: () => cairoClockWindow,
  missedContext: () => missedContext,
  missedTimeWindows: () => missedTimeWindows,
  prepareMissedContext: () => prepareMissedContext,
  presenceEventState: () => presenceEventState
});
module.exports = __toCommonJS(missed_context_exports);
var import_shift_responsibility = require("./shift-responsibility.js");
var import_missed_wait = require("./missed-wait.js");
var import_operational_state = require("./operational-state.js");
const zone = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
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
function payload(e) {
  try {
    return JSON.parse(e.payload);
  } catch {
    return {};
  }
}
function state(e) {
  return (0, import_operational_state.operationalState)(e.eventType, payload(e), e.extension);
}
function presenceEventState(e) {
  return state(e);
}
function missedTimeWindows(call) {
  const start = cairoClockWindow(call.date, call.start), hasWait = call.waitSeconds !== null && call.waitSeconds >= 0;
  let end = cairoClockWindow(call.date, call.end);
  if (start && end && end.end < start.start) {
    const next = new Date(Date.parse(call.date + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
    end = cairoClockWindow(next, call.end);
  }
  const derived = !end && start && hasWait && call.status.toLowerCase() === "abandoned" ? { ...start, start: start.start + call.waitSeconds * 1e3, end: start.end + call.waitSeconds * 1e3 } : null;
  const window = end || derived || start;
  const queueEntryWindow = hasWait ? call.status.toLowerCase() !== "abandoned" ? start : end ? { start: end.start - call.waitSeconds * 1e3, end: end.end - call.waitSeconds * 1e3 } : derived ? start : null : null;
  return { window, queueEntryWindow, timeReference: end ? "wait_end" : derived ? "wait_end_from_start" : start ? "record_start" : "unknown", waitEndDerived: !!derived };
}
function missedContext(call, employees, events, shifts, calls = []) {
  return prepareMissedContext(employees, events, shifts, calls)(call);
}
function prepareMissedContext(employees, events, shifts, calls = []) {
  const windows = calls.map((c) => ({ call: c, ...missedTimeWindows(c) }));
  const grouped = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.eventType.startsWith("shift_")) continue;
    const id = Number(payload(e).employeeId);
    if (!id || !Number.isFinite(Date.parse(e.occurredAt))) continue;
    const list = grouped.get(id) || [];
    list.push(e);
    grouped.set(id, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id - b.id);
  const relevant = (id, entry, end) => {
    const list = grouped.get(id) || [];
    const bound = (e, at) => {
      if (!/^\d{1,10}$/.test(e.extension) || ["offline", "shift_ended", "logged_in"].includes(state(e))) return false;
      if (!shifts) return at - Date.parse(e.occurredAt) <= 9e4;
      const owner = (0, import_shift_responsibility.shiftAt)(shifts, id, at), session = shifts.sessions.find((s) => s.id === owner?.sessionId);
      return !!session && !owner?.excluded && session.issuedAt <= at && (session.revokedAt === null || session.revokedAt > at) && (!payload(e).sessionId || payload(e).sessionId === session.id);
    };
    const prior = list.findLast((e) => Date.parse(e.occurredAt) <= entry);
    return !!prior && bound(prior, entry) || list.some((e) => {
      const t = Date.parse(e.occurredAt);
      return t > entry && t <= end && bound(e, t);
    });
  };
  return (call) => {
    const { window, queueEntryWindow, timeReference, waitEndDerived } = missedTimeWindows(call);
    const staff = employees.map((emp) => {
      const uniqueRing = (at) => !calls.length || windows.filter((w) => w.call.phone.replace(/\D/g, "") === call.phone.replace(/\D/g, "") && w.call.queue === call.queue && w.window && w.queueEntryWindow && at >= w.queueEntryWindow.start && at <= w.window.end).length === 1;
      const base = { employeeId: emp.id, name: emp.name, code: emp.employeeCode, relevantDuringWait: !!window && !!queueEntryWindow && Date.parse(emp.createdAt) <= window.end && relevant(emp.id, queueEntryWindow.start, window.end), ...(0, import_missed_wait.missedWait)(call, emp.id, Date.parse(emp.createdAt) > (window?.end ?? 0) ? [] : grouped.get(emp.id) || [], queueEntryWindow, window, state, shifts, uniqueRing) };
      if (!window) return { ...base, state: "unknown", reason: "missing_call_time", evidenceAt: null, extension: null };
      if (Date.parse(emp.createdAt) > window.end) return { ...base, state: "no_session", reason: "employee_created_later", evidenceAt: null, extension: null };
      const responsibility = shifts ? (0, import_shift_responsibility.shiftAt)(shifts, emp.id, window.start) : null, atEnd = shifts ? (0, import_shift_responsibility.shiftAt)(shifts, emp.id, window.end) : null;
      if (responsibility?.excluded !== atEnd?.excluded || responsibility?.sessionId !== atEnd?.sessionId) return { ...base, state: "uncertain", reason: "changed_within_time_window", evidenceAt: null, extension: null };
      if (responsibility?.excluded) return { ...base, state: "shift_ended", reason: responsibility.reason, evidenceAt: new Date(responsibility.effectiveAt).toISOString(), extension: responsibility.extension, excluded: true };
      const owner = shifts?.sessions.find((s) => s.id === responsibility?.sessionId);
      const list = (grouped.get(emp.id) || []).filter((e) => !responsibility || !payload(e).sessionId || payload(e).sessionId === responsibility.sessionId);
      let lo = 0, hi = list.length;
      while (lo < hi) {
        const mid = lo + hi >>> 1;
        if (Date.parse(list[mid].occurredAt) <= window.start) lo = mid + 1;
        else hi = mid;
      }
      const last = list[lo - 1];
      if (!last) return { ...base, state: shifts && !responsibility ? "no_session" : "unknown", reason: "no_identity_events", evidenceAt: null, extension: null };
      const current = state(last);
      let changed = false;
      if (current !== "offline" && owner?.revokedAt !== null && owner?.revokedAt !== void 0 && owner.revokedAt <= window.start) return { ...base, state: "unknown", reason: "missing_recent_presence", evidenceAt: last.occurredAt, extension: owner.extension };
      if (current === "logged_in" && !/^\d{1,10}$/.test(last.extension)) return { ...base, state: "logged_in", reason: "identity_without_extension", evidenceAt: last.occurredAt, extension: null };
      for (let i = lo; i < list.length && Date.parse(list[i].occurredAt) <= window.end; i++) if (state(list[i]) !== current) {
        changed = true;
        break;
      }
      const waitContext = base;
      if (changed) return { ...base, ...waitContext, state: "uncertain", reason: "changed_within_time_window", evidenceAt: last.occurredAt, extension: last.extension };
      if (current === "offline") {
        if (window.start - Date.parse(last.occurredAt) > 12 * 36e5) return { ...base, ...waitContext, state: "unknown", reason: "stale_logout", evidenceAt: last.occurredAt, extension: last.extension };
        return { ...base, ...waitContext, state: "offline", reason: responsibility?.reason === "admin_responsibility_included" ? "admin_responsibility_included" : "explicit_logout", evidenceAt: last.occurredAt, extension: last.extension };
      }
      if (window.end - Date.parse(last.occurredAt) > 9e4) {
        return { ...base, ...waitContext, state: "unknown", lastKnownState: current, reason: "missing_recent_presence", evidenceAt: last.occurredAt, extension: last.extension };
      }
      return { ...base, ...waitContext, state: current, reason: current === "unknown" ? "page_closed_or_unknown" : "recent_identity_event", evidenceAt: last.occurredAt, extension: last.extension };
    });
    const timedStaff = staff.map((person) => {
      const empty = { stateStartedAt: null, elapsedSeconds: null, elapsedMaxSeconds: null, durationBasis: "unavailable" };
      if (!window || !["break", "on_call"].includes(person.state) || !person.evidenceAt) return { ...person, ...empty };
      const list = grouped.get(person.employeeId) || [], last = list.findLast((e) => e.occurredAt === person.evidenceAt && e.extension === person.extension && state(e) === person.state);
      if (!last) return { ...person, ...empty };
      const session = payload(last).sessionId, lastPayload = payload(last), lastDetail = lastPayload.payload && typeof lastPayload.payload === "object" ? lastPayload.payload : {}, callId = lastPayload.callId || lastDetail.callId;
      let started = null, basis = "observed_since";
      const contiguous = [];
      for (let i = list.indexOf(last); i >= 0; i--) {
        const e = list[i], p = payload(e), detail = p.payload && typeof p.payload === "object" ? p.payload : {}, eventCallId = p.callId || detail.callId;
        if (e.extension !== last.extension || session && p.sessionId && session !== p.sessionId || state(e) !== person.state || person.state === "on_call" && callId && eventCallId && eventCallId !== callId) break;
        contiguous.push(e);
        const key = person.state === "break" ? "breakStartedAt" : "callStartedAt", raw = detail[key] ?? p[key];
        const timestamp = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : NaN;
        if (Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.parse(e.occurredAt) && timestamp <= window.start) {
          started = timestamp;
          basis = "recorded_start";
        }
        if (e.eventType === (person.state === "break" ? "break_start" : "agentlinked")) {
          started = Date.parse(e.occurredAt);
          basis = "recorded_start";
          break;
        }
      }
      if (started === null && contiguous.length) started = Date.parse(contiguous.at(-1).occurredAt);
      if (started === null) return { ...person, ...empty };
      return { ...person, stateStartedAt: new Date(started).toISOString(), elapsedSeconds: Math.max(0, Math.floor((window.start - started) / 1e3)), elapsedMaxSeconds: Math.max(0, Math.floor((window.end - started) / 1e3)), durationBasis: basis };
    });
    return { timeReference, waitEndDerived, timeWindow: window ? { start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString(), precision: window.precision, ambiguous: window.ambiguous } : null, queueEntryWindow: queueEntryWindow ? { start: new Date(queueEntryWindow.start).toISOString(), end: new Date(queueEntryWindow.end).toISOString(), precision: window?.precision || "unknown" } : null, employees: timedStaff, ringEvidenceAvailable: timedStaff.some((p) => p.ringResult === "proved"), queueMembershipAvailable: timedStaff.some((p) => p.queueMembership !== "unknown") };
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cairoClockWindow,
  missedContext,
  missedTimeWindows,
  prepareMissedContext,
  presenceEventState
});
