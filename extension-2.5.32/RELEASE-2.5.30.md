# Firefox 2.5.30 — independent live collection

Supersedes the unsigned 2.5.29 proposal. Do not distribute 2.5.29.

- Restore independent direct live collection on the existing five-second scheduler, as in 2.5.11/18/25. A native page ACK, active page or pending upload cannot suppress it.
- Preserve single-flight protection: a slow source/upload is not multiplied into overlapping scheduled requests. Existing 20-second network timeouts and automatic subsequent attempts remain.
- Continue supplemental native transition capture and durable replay without awaiting the replay backlog before the direct source read.
- Keep one bounded exact HTML parse cache and skip parsing for disabled collection.
- Keep serialization of the collector's history/live PHP requests to avoid adding same-session overlapping requests. An in-progress request can delay the next read; the five-second schedule is not a guaranteed fresh result every five seconds.
- Break controls, policy, SSE, native page transport, users and stored server data are unchanged.
- Verified with automated regression tests, not a real Firefox CPU/network profile. This release does not prove that Arabicss itself will never be slow.
- Mozilla signing is required before deployment to devices.
