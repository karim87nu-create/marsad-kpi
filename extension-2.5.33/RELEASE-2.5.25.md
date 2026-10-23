# 2.5.25 — recover a stalled Arabicss source using its native fallback

- Live incident diagnostics confirmed the exact native agent source remained CONNECTING, with one retained stream, while KPI requests continued successfully. The cause of the server/browser request stall itself remains unknown.
- After the exact source remains CONNECTING for 35 continuous monotonic seconds, close it and switch once per document to Arabicss's own do_checkstatus long-poll branch. Do not construct a replacement EventSource or run an independent polling/retry loop.
- Restore the browser EventSource constructor after each synchronous native polling call; keep the native success/5-second failure callbacks responsible for subsequent requests.
- Bound fallback native XHR at 130 seconds to allow the existing approximately two-minute idle wait. Failures do not claim a ready state.
- Native session-error objects and login HTML must revoke the fallback transport's connected state; HTTP 200 alone is not state evidence.
- Accept real native responses and subsequent native state updates only. Preserve call/break/session guards, quota, approval, users and KPI calculations. Healthy SSE and intentionally closed sessions are not restarted.
- A successful deployment is not a verification of an installed Firefox session. Source is unsigned and requires Mozilla signing before automatic publication.
