# 2.5.24 — native SSE state reconciliation

- Reconcile tracked source flags with the native EventSource readyState in the existing snapshot tick. An OPEN source no longer remains disconnected merely because the hook missed the open callback.
- CONNECTING and CLOSED remain disconnected; cached idle DOM fields do not override the native connection state.
- When Arabicss exposes its exact current stream, obsolete streams with the same URL cannot mask that current stream's failure.
- Clean closed references even when closure occurs outside the wrapped close method.
- Include bounded source diagnostics (native readyState, retained stream count, source selection) in existing snapshots; no URL, credential, new requests, reconnect timer or additional EventSource.
- Preserve break authorization, accounting, authentication, user records and KPI logic.

The regression is reproduced in a controlled test. It is not a claim that the user's Firefox incident has been directly observed or that every native/network outage is resolved. A genuine source outage still prevents an unconfirmed break start.

Unsigned source for Mozilla signing; never publish as a signed device update.
