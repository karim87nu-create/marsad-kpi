# Cloudflare migration staging (not production)

This branch contains an isolated Cloudflare Worker with three **synthetic** transfer orders. It is not a copy of the production Marsad backend or its live data. The Worker `marsad-kpi` is deployed from `sites/` on Cloudflare using a dedicated staging D1 database.

## Safety
- Current ChatGPT Sites production and its D1 are untouched by deploying this branch.
- Never connect Talabat, the website, APEX, browser extensions or Telegram to the staging URL.
- Only the fixed demo actions under `/api/demo-transfer/*` can change synthetic demo order states in staging D1; live business endpoints remain locked.
- No production data is copied automatically. Verify an authorized export, data compatibility and rollback plan before any cutover.
- This is NOT the final production configuration, and the main branch's real transfer-queue fix does not run here.

## Cloudflare GitHub build settings
- Repository: `karim87nu-create/marsad-kpi`
- Branch: `cloudflare-migration` (**not** `main`)
- Root directory: `/sites`
- Deploy command: `npx wrangler deploy`
- Build command: none
- Worker name in `wrangler.toml`: `marsad-kpi`
- Git build trigger: `Marsad staging (cloudflare-migration)`
- Cloudflare manual build passed on 2026-11-05. Automatic push builds were enabled on 2026-11-05; a GitHub push smoke test is required to verify the trigger.

## Validation
- `GET /api/health` should return HTTP 200 with `stage: cloudflare-migration`, `demoTransfer: true`, `liveTransfers: false`.
- `POST /api/orders/push` should return HTTP 403 `staging_locked`.
- `GET /api/demo-transfer/orders` should return only the three demo orders.
- Verify static assets and D1 binding before any data migration.
- Do not switch live integrations until the separate full production deployment and rollback plan have passed real-data verification.
