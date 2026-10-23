# 2.5.19

- Includes 2.5.18 native login/shift handoff correction.
- Require confirmed idle readiness for availability; waiting/held snapshots cannot falsely report ready or finish a held call.
- Promote the actual agent SSE stream from lifecycle evidence, preserving original handlers, reconnection and cleanup without opening extra streams.
- Require explicit successful agentLogout responses; failures and empty responses cannot clear employee identity.
- Preserve failed break action messages through successful status polling and explain extension binding failures.
- Separate newly rejected replay events from preserved cumulative review totals.
- No deletion or modification of production employees, histories, breaks, collector credentials or database schema.
- Requires Mozilla signing before update-feed publication. Browser/hardware performance and long-offline queue growth still require live profiling; this release does not claim that every possible hang is eliminated.
