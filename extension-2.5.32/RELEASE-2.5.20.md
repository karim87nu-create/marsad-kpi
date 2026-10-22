# 2.5.20

- Recheck collector activation every 30 seconds with the current administration session; no recurring token issuance while access is valid.
- Recover missing collector configuration and expired/revoked collector credentials using an already authenticated administration tab.
- Make Sync Now explicitly resume a stopped collector and report actual live ingestion errors, rather than silently returning success.
- Preserve intentional Stop across background/browser restarts. Automatic activation cannot override it; explicit Sync Now resumes through an authenticated administration tab.
- Cancel late activation after Stop and revoke the newly issued collector credential. Keep passwords out of extension storage.
- No changes to employee identity, Arabicss SSE, break policy, KPI, attribution, production users or database.
- Unsigned source archive requires Mozilla signing before installation or device-update publication.
