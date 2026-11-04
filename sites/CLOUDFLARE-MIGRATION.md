# Cloudflare migration staging (not production)

This branch contains a Cloudflare Worker entrypoint and an example Wrangler config. Nothing is deployed by these files.

## Safety
- Current ChatGPT Sites production and its D1 remain untouched.
- The Worker explicitly rejects non-GET/HEAD requests; do not connect Talabat, website, APEX, browser extensions, or Telegram to this staging URL.
- Create a NEW D1 database, then copy `wrangler.example.toml` to `wrangler.toml` and fill its ID. Do not commit secrets.
- No production data is copied automatically. Obtain an authorized verified export and validate it before planning cutover.
- This staging entrypoint is NOT the final production configuration.

## Cloudflare GitHub deployment settings
- Repository: karim87nu-create/marsad-kpi
- Branch: cloudflare-migration
- Root directory: sites
- Deploy command (after preparing wrangler.toml): npx wrangler deploy
- Build command: none
- Worker name: marsad-v2-cloud

## Validation
- GET /api/health should return HTTP 200 with stage cloudflare-migration.
- POST /api/orders/push should return HTTP 403 staging_read_only.
- Verify static /admin/ and /transfer/ assets and D1 binding before any data migration.
- Do not switch live integrations until explicit cutover plan and rollback are approved.
