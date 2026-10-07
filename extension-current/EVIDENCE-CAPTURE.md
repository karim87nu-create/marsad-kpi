# Source evidence capture — 2.5.8

This upgrade preserves current KPI behavior and adds raw source evidence without inventing conclusions.

Captured when Issabel/Arabicss emits it: `pausestart`, `pauseend`, `queuemembership`, and `callprogress`.

Evidence uses the already-accepted `heartbeat` event type so existing state/KPI calculations are not changed. The real state stays on the heartbeat and the source record is stored under `payload.evidence`, including source/receipt timestamps, queue membership, call IDs, unique ID, agent channel, and raw fields.

A ring proof is set only when the source event itself names an agent channel whose extension matches the current employee extension.

This is source extracted from signed 2.5.7. Version 2.5.8 must not be placed in the auto-update manifest until a signed XPI is available.
