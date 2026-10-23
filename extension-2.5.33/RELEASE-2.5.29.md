# Firefox 2.5.29 — bounded live collection load

WITHDRAWN unsigned proposal. Superseded by 2.5.30 with independent polling; do not distribute this version.

- Avoid redundant Arabicss fallback reads while the current native source is active and its latest snapshot is durably pending upload. Pending delivery is not reported as confirmed live.
- Resume fallback after 15 seconds without valid native source updates, after an epoch change, or when the latest changed snapshot cannot be persisted.
- Retain independent upload retries and strict matching ACK freshness rules.
- Cache only one exact HTML response and its parsed rows; changed HTML is still parsed immediately. Disabled collection skips parsing.
- No changes to native report XHR, SSE, break controls, break policy, employee sessions, server data or user accounts.
- Requires Mozilla signing before installation or update distribution. A source ZIP is not a signed extension.
