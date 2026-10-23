// Bundled unchanged from the old server: lib/history-attribution.ts, lib/dashboard-metrics.ts, lib/break-accounting.ts (+ their imports).
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

// ../../tmp/claude-0/-home-claude/66ae02ab-9384-5439-93fd-24e40bb7e404/scratchpad/entry.ts
var entry_exports = {};
__export(entry_exports, {
  canonicalBreaks: () => canonicalBreaks,
  canonicalCallId: () => canonicalCallId,
  dashboardMetrics: () => dashboardMetrics,
  enrichHistoryCalls: () => enrichHistoryCalls,
  eventPayload: () => eventPayload,
  reconcileHistory: () => reconcileHistory
});
module.exports = __toCommonJS(entry_exports);

// ../../mnt/user-data/uploads/Downloads/marsad-kpi-live-full-2026-10-23/source/lib/missed-context.ts
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

// ../../mnt/user-data/uploads/Downloads/marsad-kpi-live-full-2026-10-23/source/lib/business-day.ts
var shiftDate = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 864e5).toISOString().slice(0, 10);

// ../../mnt/user-data/uploads/Downloads/marsad-kpi-live-full-2026-10-23/source/lib/history.ts
function queuePurpose(queue) {
  return { "0": "after_hours", "1": "order_request", "2": "order_followup", "3": "complaint" }[queue.trim().slice(-1)] || "unknown";
}

// ../../mnt/user-data/uploads/Downloads/marsad-kpi-live-full-2026-10-23/source/lib/dashboard-metrics.ts
var eventPayload = (e) => {
  try {
    return JSON.parse(e.payload || "{}");
  } catch {
    return {};
  }
};
var employeeId = (e) => Number(eventPayload(e).employeeId) || null;
var canonicalCallId = (id) => id.match(/(?:incoming-q\d+-|outgoing-)?(\d+)$/)?.[1] || id;
function dashboardMetrics(events) {
  const relevant = events.filter((e) => employeeId(e)), groups = /* @__PURE__ */ new Map();
  for (const e of relevant.filter((e2) => e2.callId && ["agentlinked", "agentunlinked"].includes(e2.eventType))) {
    const key = employeeId(e) + ":" + e.extension + ":" + canonicalCallId(e.callId);
    const list = groups.get(key) || [];
    list.push(e);
    groups.set(key, list);
  }
  const calls = [...groups.values()].map((list) => {
    list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id - b.id);
    const ends = list.filter((e2) => e2.eventType === "agentunlinked"), e = ends.at(-1) || list.at(-1);
    const started = list.find((c) => c.eventType === "agentlinked")?.occurredAt || new Date(Date.parse(e.occurredAt) - e.durationSeconds * 1e3).toISOString();
    return { ...e, startedAt: started, callId: canonicalCallId(e.callId), employeeId: employeeId(e), waitSeconds: null, state: eventPayload(e).state || null, attributionSource: eventPayload(e).attributionSource || "extension", timePrecision: eventPayload(e).timePrecision || "second" };
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
  const timeline = relevant.filter((e) => !e.callId && e.eventType !== "heartbeat").map((e) => ({ ...e, employeeId: employeeId(e), state: eventPayload(e).state || null }));
  const performance = /* @__PURE__ */ new Map();
  for (const e of relevant) {
    const id = employeeId(e), p = performance.get(id) || { employeeId: id, employee: e.agentName || "", calls: 0, inbound: 0, outbound: 0, answered: 0, talk: 0, avgHandleTime: 0, breakSeconds: 0, unknownBreaks: 0, firstLogin: null, lastLogout: null };
    if (e.eventType === "session_login" && /^\d+$/.test(e.extension || "") && (!p.firstLogin || e.occurredAt < p.firstLogin)) p.firstLogin = e.occurredAt;
    if (["session_logout", "arabicss_logout"].includes(e.eventType) && (!p.lastLogout || e.occurredAt > p.lastLogout)) p.lastLogout = e.occurredAt;
    if (e.eventType === "break_end") p.breakSeconds += e.durationSeconds;
    if (e.eventType === "break_end_unknown") p.unknownBreaks++;
    performance.set(id, p);
  }
  for (const c of calls) {
    const p = performance.get(c.employeeId);
    p.calls++;
    if (c.callType === "incoming") p.inbound++;
    else if (c.callType === "outgoing") p.outbound++;
    if (c.eventType === "agentunlinked") {
      p.answered++;
      p.talk += c.durationSeconds;
    }
  }
  for (const p of performance.values()) p.avgHandleTime = p.answered ? Math.round(p.talk / p.answered) : 0;
  const ended = calls.filter((e) => e.eventType === "agentunlinked");
  return {
    calls,
    timeline: timeline.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id),
    performance: [...performance.values()],
    summary: {
      calls: calls.length,
      answered: ended.filter((c) => c.callType === "incoming").length,
      completed: ended.length,
      openCalls: calls.length - ended.length,
      inbound: calls.filter((c) => c.callType === "incoming").length,
      outbound: calls.filter((c) => c.callType === "outgoing").length,
      aht: ended.length ? Math.round(ended.reduce((sum, e) => sum + e.durationSeconds, 0) / ended.length) : 0,
      totalBreak: [...performance.values()].reduce((n, p) => n + p.breakSeconds, 0),
      unknownBreaks: [...performance.values()].reduce((n, p) => n + p.unknownBreaks, 0),
      legacyUnattributed: events.filter((e) => !employeeId(e)).length
    }
  };
}

// ../../mnt/user-data/uploads/Downloads/marsad-kpi-live-full-2026-10-23/source/lib/history-attribution.ts
var phone = (s) => String(s || "").replace(/\D/g, "");
function clocks(c) {
  const a = cairoClockWindow(c.date, c.start);
  let b = cairoClockWindow(c.date, c.end);
  if (!a || !b || a.ambiguous || b.ambiguous) return null;
  if (b.end < a.start) b = cairoClockWindow(shiftDate(c.date, 1), c.end);
  if (!b || b.ambiguous || b.start - a.end > 12 * 36e5 || b.end < a.start) return null;
  return { start: a.start, end: b.end, precision: a.precision === "minute" || b.precision === "minute" ? "minute" : "second" };
}
function reconcileHistory(records, live, sessions, evidence = [], now = Date.now()) {
  const byPhone = /* @__PURE__ */ new Map(), byExtension = /* @__PURE__ */ new Map();
  for (const [j, l] of live.entries()) {
    if (l.callType !== "incoming" || !phone(l.phone)) continue;
    const k = phone(l.phone), list = byPhone.get(k) || [];
    list.push({ j, start: Date.parse(l.startedAt), end: Date.parse(l.occurredAt) });
    byPhone.set(k, list);
  }
  for (const list of byPhone.values()) list.sort((a, b) => a.start - b.start);
  for (const s of sessions) {
    const list = byExtension.get(s.extension) || [];
    list.push(s);
    byExtension.set(s.extension, list);
  }
  const owners = /* @__PURE__ */ new Map();
  for (const e of evidence) {
    if (!e.employeeId || !e.sessionId || !Number.isFinite(Date.parse(e.occurredAt))) continue;
    const list = owners.get(e.extension) || [];
    list.push(e);
    owners.set(e.extension, list);
  }
  for (const list of owners.values()) list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const limited = /* @__PURE__ */ new Set();
  const timing = records.map(clocks), edges = records.map((c, i) => {
    const t = timing[i];
    if (c.status.toLowerCase() !== "success" || !t || !phone(c.phone)) return [];
    const list = byPhone.get(phone(c.phone)) || [];
    let lo = 0, hi = list.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (list[mid].start <= t.end) lo = mid + 1;
      else hi = mid;
    }
    const matches = [];
    let checked = 0;
    for (let j = lo - 1; j >= 0; j--) {
      const e = list[j];
      if (e.start < t.start - 12 * 36e5) break;
      if (++checked > 200) {
        limited.add(i);
        return [];
      }
      if (e.end >= t.start) matches.push(e.j);
    }
    return matches;
  });
  const rawReverse = /* @__PURE__ */ new Map();
  for (const e of edges) for (const j of e) rawReverse.set(j, (rawReverse.get(j) || 0) + 1);
  const conflicting = /* @__PURE__ */ new Set();
  edges.forEach((e, i) => {
    if (e.length === 1 && rawReverse.get(e[0]) === 1 && live[e[0]].extension !== records[i].accountId) conflicting.add(records[i].accountId);
  });
  const verified = /* @__PURE__ */ new Set();
  edges.forEach((e, i) => {
    if (!conflicting.has(records[i].accountId) && e.some((j) => live[j].extension === records[i].accountId)) verified.add(records[i].accountId);
  });
  for (const s of sessions) if (/^\d{1,10}$/.test(s.extension) && Number.isFinite(s.boundAt) && !conflicting.has(s.extension)) verified.add(s.extension);
  const incompleteByExtension = /* @__PURE__ */ new Map();
  for (const [j, l] of live.entries()) if (!phone(l.phone) || !l.callType) {
    const list = incompleteByExtension.get(l.extension) || [];
    list.push({ j, start: Date.parse(l.startedAt) });
    incompleteByExtension.set(l.extension, list);
  }
  for (const list of incompleteByExtension.values()) list.sort((a, b) => a.start - b.start);
  for (const [i, c] of records.entries()) {
    const t = timing[i];
    if (edges[i].length || c.status.toLowerCase() !== "success" || !t || t.precision !== "second" || !verified.has(c.accountId)) continue;
    const list = incompleteByExtension.get(c.accountId) || [];
    let lo = 0, hi = list.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (list[mid].start < t.start - 2e3) lo = mid + 1;
      else hi = mid;
    }
    const candidates = [];
    let checked = 0;
    for (let k = lo; k < list.length && list[k].start <= t.start + 2e3; k++) {
      if (++checked > 200) {
        limited.add(i);
        break;
      }
      const l = live[list[k].j];
      if ((!l.callType || l.callType === "incoming") && (!phone(l.phone) || phone(l.phone) === phone(c.phone))) candidates.push(list[k].j);
    }
    if (!limited.has(i)) edges[i] = candidates;
  }
  edges.forEach((e, i) => {
    if (verified.has(records[i].accountId)) edges[i] = e.filter((j) => live[j].extension === records[i].accountId);
  });
  const reverse = /* @__PURE__ */ new Map();
  for (const e of edges) for (const j of e) reverse.set(j, (reverse.get(j) || 0) + 1);
  const signatures = /* @__PURE__ */ new Map();
  for (const c of records) {
    const key = JSON.stringify(c);
    signatures.set(key, (signatures.get(key) || 0) + 1);
  }
  const details = [];
  const recovered = [], rows = records.map((c, i) => {
    const base = { index: i, accountId: c.accountId, phone: c.phone, date: c.date, start: c.start, end: c.end, employeeId: null, employeeName: null, extension: null, source: "history", reason: "not_answered", included: false };
    if (c.status.toLowerCase() !== "success") return base;
    if (timing[i] && timing[i].start > now + 5e3) return { ...base, reason: "source_time_future" };
    if (limited.has(i)) return { ...base, reason: "matching_limit" };
    if (edges[i].length) {
      const unique = edges[i].length === 1 && reverse.get(edges[i][0]) === 1, l = live[edges[i][0]], sameOwner = verified.has(c.accountId) && edges[i].every((j) => live[j].employeeId === l.employeeId && live[j].extension === l.extension);
      const t2 = timing[i], end2 = t2 ? t2.end - (t2.precision === "minute" ? 59999 : 999) : NaN;
      if (unique && verified.has(c.accountId) && l.extension === c.accountId && t2?.precision === "second" && signatures.get(JSON.stringify(c)) === 1 && Math.abs(Date.parse(l.startedAt) - t2.start) <= 2e3)
        details.push({ callId: l.callId, employeeId: l.employeeId, extension: l.extension, phone: c.phone, waitSeconds: c.waitSeconds !== null && Number.isFinite(c.waitSeconds) && c.waitSeconds >= 0 ? c.waitSeconds : null, start: new Date(t2.start).toISOString(), end: new Date(end2).toISOString(), durationSeconds: c.durationSeconds, status: c.status });
      const completion = unique && l.eventType === "agentlinked" && verified.has(c.accountId) && l.extension === c.accountId && t2?.precision === "second" && signatures.get(JSON.stringify(c)) === 1 && c.durationSeconds !== null && Number.isInteger(c.durationSeconds) && c.durationSeconds >= 0 && Math.abs(Date.parse(l.startedAt) - t2.start) <= 2e3 && end2 >= Date.parse(l.startedAt) && Math.abs((end2 - t2.start) / 1e3 - c.durationSeconds) <= 2;
      if (completion) {
        recovered.push({
          id: -(i + 20001),
          eventType: "agentunlinked",
          callId: l.callId,
          agentName: l.agentName,
          extension: l.extension,
          phone: l.phone || c.phone,
          callType: l.callType || "incoming",
          occurredAt: new Date(end2).toISOString(),
          durationSeconds: c.durationSeconds,
          payload: JSON.stringify({ ...eventPayload(l), employeeId: l.employeeId, attributionSource: "history_completion", historyAccountId: c.accountId, timePrecision: "second", historyStartAt: new Date(t2.start).toISOString(), historyEndAt: new Date(end2).toISOString(), outsideOperating: queuePurpose(c.queue) === "after_hours" })
        });
        return { ...base, employeeId: l.employeeId, employeeName: l.agentName, extension: l.extension, reason: "completed_from_history", included: false };
      }
      return { ...base, employeeId: unique || sameOwner ? l.employeeId : null, employeeName: unique || sameOwner ? l.agentName : null, extension: unique || sameOwner ? l.extension : null, reason: unique ? "already_observed" : sameOwner ? "observed_owner" : "possible_duplicate", included: false };
    }
    const t = timing[i];
    if (!t) return { ...base, reason: "uncertain_time" };
    if ((signatures.get(JSON.stringify(c)) || 0) > 1) return { ...base, reason: "identical_source_rows" };
    if (/^\d{1,10}$/.test(c.accountId) && !verified.has(c.accountId) && !conflicting.has(c.accountId) && !byExtension.has(c.accountId)) return { ...base, reason: "missing_extension_identity" };
    if (!/^\d{1,10}$/.test(c.accountId) || !verified.has(c.accountId)) return { ...base, reason: "unverified_extension" };
    if (c.durationSeconds === null || c.durationSeconds < 0) return { ...base, reason: "missing_duration" };
    const pool = byExtension.get(c.accountId) || [];
    if (pool.length > 200) return { ...base, reason: "matching_limit" };
    const candidates = pool.filter((s2) => Math.max(s2.issuedAt, s2.boundAt) <= t.start && Math.min(s2.expiresAt, s2.lastSeen + 9e4, s2.revokedAt ?? Infinity) > t.end);
    let s = candidates[0], bridged = false, attributionMethod = "session_at_call";
    if (candidates.length > 1) return { ...base, reason: "ambiguous_session" };
    if (!s) {
      const list = owners.get(c.accountId) || [];
      let lo = 0, hi = list.length;
      while (lo < hi) {
        const mid = lo + hi >>> 1;
        if (Date.parse(list[mid].occurredAt) <= t.start) lo = mid + 1;
        else hi = mid;
      }
      const beforeIndex = lo - 1, before = list[beforeIndex];
      lo = 0;
      hi = list.length;
      while (lo < hi) {
        const mid = lo + hi >>> 1;
        if (Date.parse(list[mid].occurredAt) < t.end) lo = mid + 1;
        else hi = mid;
      }
      const afterIndex = lo, after = list[afterIndex];
      const technical = (e) => ["tab_closed", "browser_restarted", "extension_restarted"].includes(e.state || "");
      if (before && after && t.start - Date.parse(before.occurredAt) <= 15 * 6e4 && Date.parse(after.occurredAt) - t.end <= 15 * 6e4) {
        const a = Date.parse(before.occurredAt), b = Date.parse(after.occurredAt);
        if (afterIndex - beforeIndex > 200) return { ...base, reason: "matching_limit" };
        const between = list.slice(beforeIndex, afterIndex + 1);
        const competing = pool.some((x) => x.employeeId !== before.employeeId && x.employeeId !== after.employeeId && Math.max(x.issuedAt, x.boundAt) < t.end && Math.min(x.expiresAt, x.lastSeen + 9e4, x.revokedAt ?? Infinity) > t.start);
        const anchor = pool.find((x) => x.id === before.sessionId && x.employeeId === before.employeeId && x.extension === c.accountId && Math.max(x.issuedAt, x.boundAt) <= a && x.expiresAt > a);
        const resume = pool.find((x) => x.id === after.sessionId && x.employeeId === after.employeeId && x.extension === c.accountId && Math.max(x.issuedAt, x.boundAt) <= b && x.expiresAt > b);
        if (before.employeeId === after.employeeId) {
          const consistent = !competing && between.every((e) => e.employeeId === before.employeeId && (!["session_logout", "arabicss_logout", "page_closed"].includes(e.eventType) || technical(e)));
          if (consistent && anchor && resume) {
            s = anchor;
            bridged = true;
            attributionMethod = "same_owner_boundaries";
          }
        } else {
          const cleanHandover = t.precision === "second" && !competing && between.length === 2 && between[0] === before && between[1] === after;
          if (cleanHandover && anchor && resume) {
            s = resume;
            bridged = true;
            attributionMethod = "after_owner_handover";
          }
        }
      }
      if (!s) return { ...base, reason: "no_session_at_call" };
    }
    if (!s.name) return { ...base, reason: "missing_identity" };
    const end = new Date(t.end - (t.precision === "minute" ? 59999 : 999)).toISOString(), start = new Date(t.start).toISOString(), callId = "history:" + JSON.stringify(c) + ":!";
    const payload = JSON.stringify({ employeeId: s.employeeId, sessionId: s.id, attributionSource: "history_session", attributionMethod, historyAccountId: c.accountId, timePrecision: t.precision, outsideOperating: queuePurpose(c.queue) === "after_hours" });
    recovered.push(
      { id: -(i + 1), eventType: "agentlinked", callId, agentName: s.name, extension: s.extension, phone: c.phone, callType: "incoming", occurredAt: start, durationSeconds: 0, payload },
      { id: -(i + 10001), eventType: "agentunlinked", callId, agentName: s.name, extension: s.extension, phone: c.phone, callType: "incoming", occurredAt: end, durationSeconds: c.durationSeconds, payload }
    );
    return { ...base, employeeId: s.employeeId, employeeName: s.name, extension: s.extension, reason: bridged ? attributionMethod : "session_at_call", included: true };
  });
  return { events: recovered, rows, details, summary: { recovered: rows.filter((r) => r.included).length, completedFromHistory: rows.filter((r) => r.reason === "completed_from_history").length, alreadyObserved: rows.filter((r) => ["already_observed", "completed_from_history"].includes(r.reason)).length, unattributedAnswered: rows.filter((r, i) => records[i].status.toLowerCase() === "success" && r.employeeId === null).length } };
}
function enrichHistoryCalls(calls, details) {
  const byKey = new Map(details.map((d) => [JSON.stringify([d.employeeId, d.extension, d.callId]), d]));
  return calls.map((c) => {
    const d = byKey.get(JSON.stringify([c.employeeId, c.extension, c.callId]));
    return d ? { ...c, phone: c.phone || d.phone, callType: c.callType || "incoming", waitSeconds: d.waitSeconds, historyDetails: { ...d, source: "arabicss_history" } } : c;
  });
}

// ../../mnt/user-data/uploads/Downloads/marsad-kpi-live-full-2026-10-23/source/lib/break-accounting.ts
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canonicalBreaks,
  canonicalCallId,
  dashboardMetrics,
  enrichHistoryCalls,
  eventPayload,
  reconcileHistory
});
