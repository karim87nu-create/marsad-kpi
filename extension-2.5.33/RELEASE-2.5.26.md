# 2.5.26 — connection ownership and shift handoff hardening

- Keep healthy native SSE. Recover a continuously stuck native source using Arabicss's supplied long-poll implementation, not a second invented network client.
- Single-flight native fallback with a one-second minimum between request starts. Native five-second failure retry remains; rapid empty responses or repeated initialization cannot produce parallel polls or a 1ms request flood.
- Stop fallback on a confirmed native logout or ERROR_SESSION. Invalid response/session error/login HTML never confirms readiness.
- Ignore events from obsolete same-URL streams when Arabicss has selected a different exact current source.
- Capture pre-event native state before XHR callbacks; keep a per-source SSE state cursor. Native handler ordering and multi-event batches cannot misclassify a real break start as a pre-existing break.
- Ignore registration and break-action results from the previous employee session after shift handoff. Show immediate start-check feedback; neither a permit nor a request is reported as an actual break.
- Native break/unbreak/logout XHR receives a 20-second deadline when no native deadline exists. Break action attempt/response/failure gets explicit feedback but never fabricates a break start/end or retries a state-changing request automatically.
- Reject stale collector credential refresh results after Stop/rebinding.
- Before requesting a regular/approved break permit, await server acceptance of the actual current ready-state event. Recheck identity/extension/readiness afterward; readiness delivery failures or incoming calls never open the native break dialog.
- Retain existing break policy, signed identity checks, offline event preservation, timeline and server-clock basis. No database/user/accounting edits.
- Tests execute actual extension functions and native Arabicss polling with mocked network/DOM. They do not prove an installed Firefox session; this unsigned source requires Mozilla signing and live verification.
