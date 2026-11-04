// Isolated Cloudflare staging shell. No API data operations until cutover approval.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return Response.json({ ok: true, stage: 'cloudflare-migration', databaseConfigured: !!env.DB });
    }
    return Response.json({ error: 'staging_locked' }, { status: 403 });
  },
};
