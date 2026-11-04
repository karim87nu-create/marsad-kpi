// Cloudflare Workers entrypoint for a separate, read-only migration staging environment.
// Do not connect production collectors or configure Telegram until cutover is approved.
import { buildCore } from './lib/marsad/core.js';
import { d1Adapter } from './lib/marsad/db.js';

let cachedApp;
let cachedDb;
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return Response.json({ ok: true, stage: 'cloudflare-migration' });
    }
    // Hard safety gate: the staging deployment cannot process writes or external events.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return Response.json({ error: 'staging_read_only' }, { status: 403 });
    }
    if (!env.DB) return Response.json({ error: 'missing_d1_binding' }, { status: 503 });
    try {
      if (!cachedApp || cachedDb !== env.DB) {
        cachedDb = env.DB;
        cachedApp = buildCore(d1Adapter(env.DB), {
          secret: env.MARSAD_SECRET || undefined,
          adminPassword: env.MARSAD_ADMIN_PASSWORD || undefined,
          telegramTimer: 'requests',
          allowedOrigins: [],
        });
      }
      return await cachedApp.fetch(request, {
        waitUntil: p => ctx.waitUntil(Promise.resolve(p).catch(error => console.error('background_error', error))),
      });
    } catch (error) {
      console.error('marsad_cloudflare_error', error);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  },
};
