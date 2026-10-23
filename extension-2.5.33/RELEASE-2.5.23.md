# 2.5.23 — consolidated lifecycle and fault review

Includes the server-anchored event clock (2.5.21) and late source/startup/logout fixes (2.5.22).

- Bound the entire fetch, including response-body download, by the existing 20-second deadline. Previously only response headers were bounded; a stalled body could keep an action busy indefinitely.
- Recheck collection ownership after asynchronous config reads, preventing two simultaneous live/history cycles.
- Guard history source/ingestion/checkpoint updates against explicit Stop and serialize checkpoint storage with collector state.
- Freeze new event capture time before waiting behind another event, so subsequent clock samples do not re-date it. Preserve original session/local time and historical queue timestamps.
- A blocked new duplicate identity cannot discard an older session's pending event.
- Keep all break quota/approval, attribution, authentication, user records, and source EventSource ownership rules unchanged. Do not fabricate readiness or logout on failures.
- Automated tests cover startup, native login/logout, late SSE/long-poll, source disconnection, duplicate injection/tab, switching extensions, offline replay/closure retry, clock jumps, break authorization/expiry/races, stalled response bodies, concurrent collectors and explicit Stop.

Unsigned complete source for Mozilla signing. No automatic feed update until the signed XPI is supplied. Passing automation is not a claim that every installed-device scenario has been observed.
