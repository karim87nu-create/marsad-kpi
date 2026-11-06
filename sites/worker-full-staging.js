// Full Marsad Cloudflare migration rehearsal — isolated from production.
// NO production credentials, feeds, webhooks, notifications or employee accounts.
import { buildCore } from './lib/marsad/core.js';
import { d1Adapter } from './lib/marsad/db.js';

let app;
const response = (body, status=200) => Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const serve = env => {
  if (!env.DB) throw new Error('STAGING D1 binding DB is missing');
  app ??= buildCore(d1Adapter(env.DB), {
    telegramTimer: 'requests',
    allowedOrigins: [],
  });
  return app;
};
export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/health' || pathname === '/health') {
      return response({ok:!!env.DB,stage:'full-staging',code:'marsad-full-core',data:'synthetic-empty',production:false,liveWrites:false,sourceFeeds:false});
    }
    // A read-only isolated preview. No token- or admin-authenticated production traffic
    // must ever be directed here before an authorized data migration and cutover.
    if (!['GET','HEAD'].includes(request.method)) {
      return response({error:'full_staging_read_only',production:false},403);
    }
    if (!pathname.startsWith('/api/')) {
      return env.ASSETS?.fetch(request) || response({error:'asset_binding_missing'},503);
    }
    try {
      return await serve(env).fetch(request,{
        waitUntil: p => ctx.waitUntil(Promise.resolve(p).catch(e=>console.error('staging_task',String(e))))
      });
    } catch(e) {
      console.error('staging_core_error',e);
      return response({error:'staging_core_error'},500);
    }
  }
};