# 2.5.21 — server-anchored employee event time

- Anchor new employee events to the first-party HTTPS response Date, then advance with Firefox's monotonic clock. No extra periodic clock requests: existing API responses refresh the anchor.
- Acquire a fresh anchor on initialization/navigation before restoring the employee session. Unsynchronized observations are preserved for review, not labelled as confirmed live events.
- Preserve original local capture time in eventClock diagnostics. Offline events retain their original session and event time; never re-date historical/rejected events.
- Use the same clock for new call/break timers and server-issued break permission deadlines.
- Restored state without the new time basis retains identity but treats old call/break start times as unverified rather than inventing a duration.
- Keep backend time guards, KPI calculations, authentication, extension ownership and employee data unchanged.
- Version and event clientVersion are both 2.5.21. This archive is unsigned until Mozilla signs it; never publish it as an automatic update before signing.
