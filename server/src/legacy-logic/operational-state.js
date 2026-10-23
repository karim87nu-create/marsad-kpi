// Transpiled unchanged from the old server's lib/operational-state.ts — do not edit; it defines the old results.
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
var operational_state_exports = {};
__export(operational_state_exports, {
  operationalState: () => operationalState
});
module.exports = __toCommonJS(operational_state_exports);
function operationalState(eventType, p, extension) {
  const d = p.payload && typeof p.payload === "object" ? p.payload : {};
  if (["session_logout", "arabicss_logout"].includes(eventType)) return ["tab_closed", "browser_restarted", "extension_restarted", "unapproved_disconnect"].includes(String(p.state)) ? "unknown" : "offline";
  if (eventType === "page_closed") return "unknown";
  if (!/^\d{1,10}$/.test(extension) && ["heartbeat", "session_login", "arabicss_login"].includes(eventType)) return "logged_in";
  let state = ["break_start", "break_observed"].includes(eventType) ? "break" : ["agentlinked", "call_observed"].includes(eventType) ? "on_call" : eventType === "heartbeat" ? String(p.state || "unknown") : ["break_end", "break_end_unknown", "agentunlinked", "call_observed_end"].includes(eventType) ? "post_call" : ["session_login", "arabicss_login"].includes(eventType) ? "logged_in" : "unknown";
  if (["ready", "on_call", "break"].includes(state) && !/^\d{1,10}$/.test(extension)) return "logged_in";
  if (d.sourceConnection !== void 0 && d.sourceConnection !== "connected") return "unknown";
  if (state === "ready" && (d.waitingOrHeld === true || d.availabilityAtThisMoment === false)) state = "unknown";
  return state;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  operationalState
});
