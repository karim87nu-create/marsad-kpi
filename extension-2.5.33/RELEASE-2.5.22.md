# 2.5.22 — source startup and logout confirmation

- Attach to Arabicss's existing evtSource if it opened before the hook; never create a second EventSource or reconnect Arabicss ourselves.
- Retain fresh anonymous source snapshots only in memory (5 seconds), and apply them after identity initialization only when the extension matches. Never attribute anonymous events or use stale readiness.
- Observe existing native checkStatus long-poll responses as well as SSE without additional network requests.
- Show native logout request progress/failure; dismiss the break overlay so native errors/navigation remain visible. End identity only on explicit successful logout, source logged-out, or the existing exact native login form.
- Remove old XHR observation listeners when reused. Keep one source snapshot timer and one attachment per stream.
- Retain 2.5.21 server-anchored clock and existing break approval/security rules. No database, user, KPI or attribution changes.
- Automated cases cover late injection, startup races, source dedup, native error/success, unknown/stale readiness, break and clock paths. Installed Firefox verification still requires a signed build.
