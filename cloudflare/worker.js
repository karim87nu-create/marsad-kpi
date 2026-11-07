// مرصد الدهان على حساب Cloudflare بتاع الشركة (Karim 07-11: الانتقال من ChatGPT Sites).
// Same server code as the ChatGPT site (sites/lib/marsad), same D1 database shape: /api/* goes to the server,
// everything else is the static pages in sites/public (admin, transfer).
import { buildCore } from '../sites/lib/marsad/core.js';
import { d1Adapter } from '../sites/lib/marsad/db.js';

let app = null;
function server(env) {
  if (!env.DB) throw new Error('D1 binding "DB" is missing');
  app ??= buildCore(d1Adapter(env.DB), {
    secret: env.MARSAD_SECRET || undefined,
    adminPassword: env.MARSAD_ADMIN_PASSWORD || undefined,
    telegramApi: env.TELEGRAM_API || undefined,
    openaiKey: env.OPENAI_API_KEY || undefined,
    telegramTimer: 'requests',
    allowedOrigins: ['https://karim87nu-create.github.io'],
  });
  return app;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname === '/health') {
      try {
        return await server(env).fetch(request, { waitUntil: p => ctx.waitUntil(Promise.resolve(p).catch(() => {})) });
      } catch (error) {
        console.error('marsad_unhandled', error);
        return Response.json({ error: 'server_error' }, { status: 500 });
      }
    }
    if (url.pathname === '/') return Response.redirect(url.origin + '/admin/', 302);
    return env.ASSETS.fetch(request);
  },
};
