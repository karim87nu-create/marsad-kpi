# Firefox 2.5.28 — verified reliability fixes

- Preserve the existing employee sign-in, extension ownership and break UI.
- Keep a stable first-party UTC/monotonic anchor per context.
- Persist employee/native evidence before cold-clock I/O; retain original identity and source times.
- Require confirmation of the latest known native state before suppressing fallback.
- Quarantine permanent invalid native captures without deleting their evidence or blocking later captures; retry authentication/rate-limit/server failures.
- Isolate active collector quota from retained previous-owner captures.
- Settle permanent employee-event rejections without re-enqueue/archive races.
- Reconcile changed native call IDs as observed calls without inventing starts, ends or durations.
- Remove oversized native form HTML from call event payloads while retaining parsed call identity and an explicit omitted-markup marker.
- Persist logout evidence before requesting session closure. An authoritative server session logout remains independent of delayed client evidence.
- Preserve live-tab sessions across a background reload; distinguish the browser's actual startup event.

Companion server fixes accept valid delayed break ends without treating them as fresh live readiness, and allow retrying an unconsumed cancelled extra-break confirmation only within the original supervisor approval deadline. No schema migrations or historical-data rewrites.

Unchanged permissions, SSE/native break transport and break UI files. This source ZIP is unsigned; Mozilla signing is required before Firefox distribution. No claim of zero bugs or measured Firefox CPU/memory profiling.
