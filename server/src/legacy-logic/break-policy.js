// Bundled unchanged from the old server: lib/break-policy.ts (+ lib/business-day.ts).
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

// entry5.ts
var entry5_exports = {};
__export(entry5_exports, {
  breakGraceSeconds: () => breakGraceSeconds,
  breakPolicySnapshot: () => breakPolicySnapshot,
  regularBreakReasonId: () => regularBreakReasonId,
  regularBreakSeconds: () => regularBreakSeconds
});
module.exports = __toCommonJS(entry5_exports);

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

var regularBreakReasonId = "2";
var regularBreakLimit = 2;
var regularBreakSeconds = 15 * 60;
var regularBreakTotalSeconds = regularBreakLimit * regularBreakSeconds;
var breakGraceSeconds = 5 * 60;
function parsePayload(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function breakPolicySnapshot(db, employeeId, at = Date.now()) {
  const day = businessDateAt(new Date(at)), window = businessWindow(day), end = Math.min(at, window.operatingEnd);
  const rows = (await db.prepare(`SELECT event_type AS eventType,extension,occurred_at AS occurredAt,duration_seconds AS durationSeconds,payload
  FROM call_events WHERE json_extract(payload,'$.employeeId')=? AND event_type IN ('break_start','break_end','break_observed','break_end_unknown')
  AND occurred_at>=? AND occurred_at<=? ORDER BY occurred_at,id LIMIT 5001`).bind(employeeId, new Date(window.start).toISOString(), new Date(end).toISOString()).all()).results;
  if (rows.length > 5e3) throw Error("break_policy_limit");
  const open = /* @__PURE__ */ new Map(), periods = [];
  let unpairedEnds = 0;
  for (const row of rows) {
    const atMs = Date.parse(row.occurredAt), key = row.extension || "unknown", payload = parsePayload(row.payload);
    if (row.eventType === "break_start" || row.eventType === "break_observed") {
      if (open.has(key)) continue;
      const kind = payload.breakPolicyKind === "approved" ? "approved" : "regular";
      open.set(key, { startedAt: atMs, kind, estimated: row.eventType === "break_observed" || payload.breakPolicyEstimated === true });
      continue;
    }
    const active = open.get(key);
    if (!active) {
      if (row.eventType === "break_end" && row.durationSeconds > 0) unpairedEnds++;
      continue;
    }
    const duration = Math.max(0, Math.floor((atMs - active.startedAt) / 1e3)), minimum = active.estimated ? regularBreakSeconds : 0;
    periods.push({ startedAt: active.startedAt, endedAt: atMs, kind: active.kind, estimated: active.estimated, durationSeconds: Math.max(duration, minimum) });
    open.delete(key);
  }
  for (const active of open.values()) {
    const duration = Math.max(0, Math.floor((end - active.startedAt) / 1e3)), minimum = active.estimated ? regularBreakSeconds : 0;
    periods.push({ startedAt: active.startedAt, endedAt: end, kind: active.kind, estimated: active.estimated, durationSeconds: Math.max(duration, minimum) });
  }
  const legacyCount = unpairedEnds;
  const activeRegular = [...open.values()].some((p) => p.kind === "regular");
  const regularPeriods = periods.filter((p) => p.kind === "regular");
  const regularStarts = regularPeriods.length + legacyCount;
  const usedSeconds = regularPeriods.reduce((sum, p) => sum + p.durationSeconds, 0) + legacyCount * regularBreakSeconds;
  const remainingSeconds = Math.max(0, regularBreakTotalSeconds - usedSeconds);
  const firstSeconds = regularPeriods[0]?.durationSeconds || (legacyCount ? regularBreakSeconds : 0);
  const secondRemainingSeconds = Math.max(0, regularBreakSeconds - Math.max(0, firstSeconds - regularBreakSeconds));
  const secondBlocked = regularStarts >= 1 && (regularStarts >= regularBreakLimit || remainingSeconds <= 0);
  const nextAllowedSeconds = regularStarts === 0 ? Math.min(regularBreakSeconds + breakGraceSeconds, remainingSeconds) : regularStarts === 1 && !secondBlocked ? Math.min(secondRemainingSeconds, remainingSeconds) : 0;
  const regularAvailable = at < window.operatingEnd && regularStarts < regularBreakLimit && nextAllowedSeconds > 0;
  return { businessDate: day, startsUsed: regularStarts, usedSeconds, remainingSeconds, secondRemainingSeconds, secondBlocked, regularAvailable, requiresApproval: !regularAvailable, graceSeconds: breakGraceSeconds, nextAllowedSeconds, regularBreakLimit, regularBreakSeconds, regularBreakTotalSeconds, activeRegular, estimated: regularPeriods.some((p) => p.estimated) };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  breakGraceSeconds,
  breakPolicySnapshot,
  regularBreakReasonId,
  regularBreakSeconds
});
