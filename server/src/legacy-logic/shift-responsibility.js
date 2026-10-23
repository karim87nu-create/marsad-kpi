// Transpiled unchanged from the old server's lib/shift-responsibility.ts — do not edit; it defines the old results.
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
var shift_responsibility_exports = {};
__export(shift_responsibility_exports, {
  loadShiftData: () => loadShiftData,
  shiftAt: () => shiftAt
});
module.exports = __toCommonJS(shift_responsibility_exports);
function data(e) {
  try {
    return JSON.parse(e.payload);
  } catch {
    return {};
  }
}
const exits = /* @__PURE__ */ new Set(["explicit_logout", "arabicss_logout", "arabicss_login_page", "extension_changed", "session_logout"]);
function shiftAt(input, employeeId, at) {
  const candidates = input.sessions.filter((s) => s.employeeId === employeeId && s.issuedAt <= at).sort((a, b) => b.issuedAt - a.issuedAt || b.id.localeCompare(a.id));
  const session = candidates.find((s) => s.revokedAt === null || s.revokedAt > at) || candidates[0];
  if (!session) return null;
  const adjustment = input.adjustments.filter((e) => data(e).targetSessionId === session.id && Number(data(e).effectiveAt) <= at).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id)[0];
  if (adjustment) {
    const p = data(adjustment);
    return { sessionId: session.id, extension: session.extension, excluded: adjustment.eventType === "shift_exclude", reason: adjustment.eventType === "shift_exclude" ? "admin_shift_excluded" : "admin_responsibility_included", effectiveAt: Number(p.effectiveAt), decidedAt: adjustment.occurredAt, note: String(p.note || "") };
  }
  if (session.revokedAt !== null && session.revokedAt <= at && exits.has(session.reason || "")) return { sessionId: session.id, extension: session.extension, excluded: true, reason: "logout_shift_ended", effectiveAt: session.revokedAt, decidedAt: new Date(session.revokedAt).toISOString() };
  return { sessionId: session.id, extension: session.extension, excluded: false, reason: session.revokedAt === null ? "session_in_progress" : "closure_uncertain", effectiveAt: session.issuedAt, decidedAt: null };
}
async function loadShiftData(db, from, to) {
  const sessions = (await db.prepare(`SELECT id,employee_id AS employeeId,extension,issued_at AS issuedAt,revoked_at AS revokedAt,reason FROM employee_sessions WHERE issued_at<=? AND (issued_at>=? OR id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER(PARTITION BY employee_id ORDER BY issued_at DESC,id DESC) rn FROM employee_sessions WHERE issued_at<?) WHERE rn=1)) ORDER BY issued_at LIMIT 5001`).bind(to, from, from).all()).results;
  if (sessions.length > 5e3) throw Error("shift_data_limit");
  const adjustments = (await db.prepare("SELECT id,event_type AS eventType,occurred_at AS occurredAt,payload FROM call_events WHERE event_type IN ('shift_include','shift_exclude') AND json_extract(payload,'$.targetSessionId') IN (SELECT id FROM employee_sessions WHERE issued_at<=?) ORDER BY occurred_at,id LIMIT 5001").bind(to).all()).results;
  if (adjustments.length > 5e3) throw Error("shift_adjustment_limit");
  return { sessions, adjustments };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadShiftData,
  shiftAt
});
