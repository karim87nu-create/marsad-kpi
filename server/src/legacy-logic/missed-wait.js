// Transpiled unchanged from the old server's lib/missed-wait.ts — do not edit; it defines the old results.
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
var missed_wait_exports = {};
__export(missed_wait_exports, {
  missedWait: () => missedWait
});
module.exports = __toCommonJS(missed_wait_exports);
var import_shift_responsibility = require("./shift-responsibility.js");
const data = (e) => {
  try {
    return JSON.parse(e.payload);
  } catch {
    return {};
  }
};
const digits = (value) => String(value || "").replace(/\D/g, "");
function missedWait(call, employeeId, events, entry, end, state, shifts, uniqueRing = () => true) {
  const empty = { queueEntryState: "unknown", queueEntryExtension: "", queueEntryElapsedSeconds: null, queueEntryDurationBasis: "unavailable", queueMembership: "unknown", eligibleAtQueueEntry: false, eligibleDuringWait: false, readinessRestoredDuringWait: false, availableAtQueueEntry: false, becameReadyDuringWait: false, readyDuringWaitAt: null, waitTimeline: [], ringResult: "not_recorded", ringAt: null, ringExtension: "", ringDurationSeconds: null, ringDurationBasis: "unavailable" };
  if (!entry || !end) return empty;
  const valid = (e, at) => {
    const s = shifts ? (0, import_shift_responsibility.shiftAt)(shifts, employeeId, at) : null, p = data(e);
    return (!shifts || !!s) && (!s || !p.sessionId || p.sessionId === s.sessionId);
  };
  const operational = (e, at) => {
    if (!valid(e, at)) return "unknown";
    const owner = shifts ? (0, import_shift_responsibility.shiftAt)(shifts, employeeId, at) : null;
    if (owner?.excluded) return "shift_ended";
    const session = shifts?.sessions.find((s) => s.id === owner?.sessionId);
    if (session?.revokedAt !== null && session?.revokedAt !== void 0 && session.revokedAt <= at) return "unknown";
    const p = data(e), detail = p.payload || {};
    if (!/^\d{1,10}$/.test(e.extension) && state(e) === "logged_in") return "logged_in";
    if (at - Date.parse(e.occurredAt) > 9e4) return "unknown";
    if (!/^\d{1,10}$/.test(e.extension) && ["ready", "on_call", "break"].includes(state(e))) return "logged_in";
    if (detail.sourceConnection === "disconnected") return "unknown";
    return state(e);
  };
  const memberships = /* @__PURE__ */ new Map();
  for (const e of events) {
    const p = data(e), proof = p.payload?.evidence || p.evidence;
    if (!proof || proof.evidenceSource !== "issabel_eccp_sse" || !Array.isArray(proof.queues) || !proof.queues.every((q) => typeof q === "string" || typeof q === "number")) continue;
    if (!proof.queues.length && !/queue.*membership/i.test(String(proof.evidenceType || ""))) continue;
    if (!p.sessionId) continue;
    const key = p.sessionId + ":" + e.extension, list = memberships.get(key) || [];
    list.push({ at: Date.parse(e.occurredAt), queues: proof.queues.map(String), event: e });
    memberships.set(key, list);
  }
  const membership = (at, owner) => {
    if (!owner || !call.queue) return "unknown";
    const p = data(owner), list = memberships.get(p.sessionId + ":" + owner.extension) || [];
    let a = 0, b = list.length;
    while (a < b) {
      const m = a + b >>> 1;
      if (list[m].at <= at) a = m + 1;
      else b = m;
    }
    const snapshot = list[a - 1];
    return !snapshot || !valid(snapshot.event, at) ? "unknown" : snapshot.queues.includes(call.queue) ? "member" : "not_member";
  };
  let lo = 0, hi = events.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (Date.parse(events[mid].occurredAt) <= entry.start) lo = mid + 1;
    else hi = mid;
  }
  let last;
  for (let i = lo - 1; i >= 0; i--) {
    if (valid(events[i], entry.start)) {
      last = events[i];
      break;
    }
  }
  const during = events.slice(Math.max(0, lo - 1));
  let entryState = last ? operational(last, entry.start) : shifts && (0, import_shift_responsibility.shiftAt)(shifts, employeeId, entry.start)?.excluded ? "shift_ended" : shifts && !(0, import_shift_responsibility.shiftAt)(shifts, employeeId, entry.start) ? "no_session" : "unknown", ambiguous = false;
  for (const e of during) {
    const t = Date.parse(e.occurredAt);
    if (t > entry.end) break;
    if (t > entry.start && valid(e, t) && operational(e, t) !== entryState) ambiguous = true;
  }
  if (last && operational(last, entry.end) !== entryState) ambiguous = true;
  const queueMembership = membership(entry.start, last), result = { ...empty, queueEntryState: ambiguous ? "uncertain" : entryState, queueEntryExtension: last?.extension || "", queueMembership, availableAtQueueEntry: !ambiguous && entryState === "ready", eligibleAtQueueEntry: !ambiguous && entryState === "ready" && queueMembership === "member" && membership(entry.end, last) === "member" };
  let previous = entryState, previousExtension = last?.extension || "";
  result.waitTimeline.push({ at: new Date(entry.start).toISOString(), state: result.queueEntryState, extension: last?.extension || "" });
  const rings = [];
  let lastTime = last ? Date.parse(last.occurredAt) : entry.start;
  let lastNonReady = ["break", "on_call", "post_call", "logged_in", "offline", "shift_ended"].includes(entryState) ? entry.start : -Infinity;
  for (const e of during) {
    const t = Date.parse(e.occurredAt);
    if (t > end.end) break;
    if (t < entry.start || !valid(e, t)) continue;
    if (t - lastTime > 9e4 && !["offline", "shift_ended", "unknown", "no_session"].includes(previous) && !(previous === "logged_in" && !/^\d{1,10}$/.test(previousExtension))) {
      result.waitTimeline.push({ at: new Date(Math.max(entry.start, lastTime + 9e4)).toISOString(), state: "unknown", extension: e.extension });
      previous = "unknown";
    }
    lastTime = t;
    const next = operational(e, t);
    if (t > entry.end && t <= end.start && next === "ready" && membership(t, e) === "member") result.eligibleDuringWait = true;
    if (next !== previous || e.extension !== previousExtension) {
      result.waitTimeline.push({ at: e.occurredAt, state: next, extension: e.extension });
      if (t > entry.end && t <= end.start && next === "ready" && previous !== "ready") {
        if (t - lastNonReady <= 9e4 && !result.becameReadyDuringWait) {
          result.becameReadyDuringWait = true;
          result.readyDuringWaitAt = e.occurredAt;
        } else if (t - lastNonReady > 9e4) result.readinessRestoredDuringWait = true;
      }
      previous = next;
      previousExtension = e.extension;
    }
    if (["break", "on_call", "post_call", "logged_in", "offline", "shift_ended"].includes(next)) lastNonReady = t;
    const p = data(e), proof = p.payload?.evidence || p.evidence;
    if (t < entry.end || t > end.start || next === "shift_ended" || !proof || proof.evidenceSource !== "issabel_eccp_sse" || !proof.matchedAgentExtension || String(proof.agentExtension) !== e.extension || !/^\d{1,10}$/.test(e.extension) || !["ringing_on_this_extension", "ring_no_answer_on_this_extension"].includes(proof.ringProof)) continue;
    if (!digits(call.phone) || digits(proof.phone) !== digits(call.phone) || String(proof.queue) !== call.queue || !uniqueRing(t)) continue;
    rings.push(e);
  }
  if (end.start - lastTime > 9e4 && !["offline", "shift_ended", "unknown", "no_session"].includes(previous) && !(previous === "logged_in" && !/^\d{1,10}$/.test(previousExtension))) result.waitTimeline.push({ at: new Date(Math.max(entry.start, lastTime + 9e4)).toISOString(), state: "unknown", extension: previousExtension });
  const first = rings.find((e) => (data(e).payload?.evidence || data(e).evidence).ringProof === "ringing_on_this_extension");
  const finish = first && rings.find((e) => e.extension === first.extension && Date.parse(e.occurredAt) >= Date.parse(first.occurredAt) && (data(e).payload?.evidence || data(e).evidence).ringProof === "ring_no_answer_on_this_extension" && (data(e).payload?.evidence || data(e).evidence).callId && (data(e).payload?.evidence || data(e).evidence).callId === (data(first).payload?.evidence || data(first).evidence).callId);
  if (rings.length) {
    result.ringResult = "proved";
    result.ringAt = (first || rings[0]).occurredAt;
    result.ringExtension = (first || rings[0]).extension;
  }
  if (first && finish) {
    result.ringDurationSeconds = Math.max(0, Math.floor((Date.parse(finish.occurredAt) - Date.parse(first.occurredAt)) / 1e3));
    result.ringDurationBasis = "observed_interval";
  }
  const durationAt = (at, wanted, extension) => {
    const absent = { elapsedSeconds: null, durationBasis: "unavailable" };
    if (!["break", "on_call"].includes(wanted) || !/^\d{1,10}$/.test(extension)) return absent;
    let a = 0, b = events.length;
    while (a < b) {
      const m = a + b >>> 1;
      if (Date.parse(events[m].occurredAt) <= at) a = m + 1;
      else b = m;
    }
    const latest = events[a - 1];
    if (!latest || !valid(latest, at) || latest.extension !== extension || operational(latest, at) !== wanted) return absent;
    const owner = data(latest), ownerDetail = owner.payload || {}, callId = owner.callId || ownerDetail.callId;
    let start = Date.parse(latest.occurredAt), basis = "observed_since";
    for (let i = a - 1; i >= 0; i--) {
      const e = events[i], p = data(e), d = p.payload || {}, id = p.callId || d.callId;
      if (e.extension !== extension || p.sessionId !== owner.sessionId || state(e) !== wanted || wanted === "on_call" && callId && id && id !== callId) break;
      start = Date.parse(e.occurredAt);
      const raw = d[wanted === "break" ? "breakStartedAt" : "callStartedAt"] ?? p[wanted === "break" ? "breakStartedAt" : "callStartedAt"], recorded = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : NaN;
      if (Number.isFinite(recorded) && recorded > 0 && recorded <= Date.parse(e.occurredAt)) {
        start = recorded;
        basis = "recorded_start";
        break;
      }
      if (e.eventType === (wanted === "break" ? "break_start" : "agentlinked")) {
        basis = "recorded_start";
        break;
      }
    }
    const session = shifts?.sessions.find((s) => s.id === owner.sessionId);
    if (session) start = Math.max(start, session.issuedAt);
    return { elapsedSeconds: Math.max(0, Math.floor((at - start) / 1e3)), durationBasis: basis };
  };
  result.waitTimeline = result.waitTimeline.map((point) => ({ ...point, afterEntrySeconds: Math.max(0, Math.floor((Date.parse(point.at) - entry.start) / 1e3)), ...durationAt(Date.parse(point.at), point.state, point.extension) }));
  const initial = durationAt(entry.start, result.queueEntryState, result.queueEntryExtension);
  result.queueEntryElapsedSeconds = initial.elapsedSeconds;
  result.queueEntryDurationBasis = initial.durationBasis;
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  missedWait
});
