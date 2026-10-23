# Firefox 2.5.31 — one-second, single-source live reader

Supersedes unsigned 2.5.29 and 2.5.30 proposals. Only distribute this release after Mozilla signing.

- Direct live scheduler interval is 1000ms, with one in-flight reader. Slow PHP requests, history reads and network conditions can delay actual responses; there is no hard one-second freshness guarantee.
- Disable report-page bridge registration and ignore messages from old injected report scripts surviving an upgrade. New report snapshots have only one extension source: direct polling. Employee agent-console SSE/break transport is unchanged.
- Route direct snapshots through the existing durable outbox, preserving original capture IDs and monotonic-backed timestamps. A slow upload no longer blocks subsequent source reads.
- Deduplicate unchanged state and ticking duration/waiting counters. Persist/dispatch state changes immediately; retain a classified unchanged-source health snapshot every ten seconds, not a fabricated business transition.
- Independent source polling does not wait for page activity or server ACK. Storage failures are reported, not treated as successful capture. Existing outbox quotas and upload retry backoff remain.
- Keep one exact-HTML parse cache and collector history/live source serialization. No new permissions, employee/break policy changes, user changes or backend-data edits.
- One-second polling can add Arabicss load. No real Firefox profile was available; these changes do not promise zero slowness or universal absence of duplicate network delivery under lost ACKs. Retries retain capture IDs for server-side deduplication.
