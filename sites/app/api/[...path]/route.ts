// مرصد الأداء — every /api/* request goes to the server in lib/marsad (Fetch API, D1 database "DB").
import { env, waitUntil } from 'cloudflare:workers';
// @ts-ignore — plain JavaScript modules
import { buildCore } from '../../../lib/marsad/core.js';
// @ts-ignore
import { d1Adapter } from '../../../lib/marsad/db.js';

type Env = { DB: unknown; MARSAD_SECRET?: string; MARSAD_ADMIN_PASSWORD?: string; TELEGRAM_API?: string };
let app: { fetch(request: Request, options: { waitUntil(p: Promise<unknown>): void }): Promise<Response> } | null = null;

function server() {
  const e = env as unknown as Env;
  if (!e.DB) throw new Error('D1 binding "DB" is missing');
  // No secret is required: without MARSAD_SECRET the server creates its own and keeps it in the database.
  app ??= buildCore(d1Adapter(e.DB), {
    secret: e.MARSAD_SECRET || undefined,
    adminPassword: e.MARSAD_ADMIN_PASSWORD || undefined,
    telegramApi: e.TELEGRAM_API || undefined,
    telegramTimer: 'requests',
    allowedOrigins: ['https://karim87nu-create.github.io'],
  });
  return app!;
}

async function handle(request: Request): Promise<Response> {
  try {
    return await server().fetch(request, { waitUntil: (p: Promise<unknown>) => waitUntil(p.catch(() => {})) });
  } catch (error) {
    console.error('marsad_unhandled', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
