// Copy the Marsad data from the ChatGPT site to the Cloudflare one (Karim 11-17), table by table, page by page.
// MODE=export (main password; everything, for the real move) or MODE=backup (no keys or hashes; for a trial copy).
// Env: FROM, TO (https://…), MARSAD_ADMIN_PASSWORD. Prints counts only, never values.
const { FROM, TO, MARSAD_ADMIN_PASSWORD: PW, MODE = 'export' } = process.env;
if (!FROM || !TO || !PW) { console.error('FROM, TO and MARSAD_ADMIN_PASSWORD are needed'); process.exit(1); }
const call = async (base, path, body, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': PW }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(path + ' ' + r.status + ' ' + (j.error || ''));
      return j;
    } catch (e) { if (i >= tries || / 4\d\d /.test(e.message + ' ')) throw e; await new Promise(r => setTimeout(r, 3000 * i)); }
  }
};
const src = MODE === 'backup' ? '/api/backup' : '/api/migrate/export';
const { tables } = await call(FROM, src, {});
console.log(tables.length + ' tables');
let failed = 0;
for (const table of tables) {
  let after = 0, n = 0, first = true;
  try {
    for (;;) {
      const page = await call(FROM, src, { table, after });
      // Pages of at most ~4 MB to the new server.
      let chunk = [], size = 0;
      const flush = async () => { if (!chunk.length && !first) return; await call(TO, '/api/migrate/import', { table, rows: chunk, reset: first }); first = false; n += chunk.length; chunk = []; size = 0; };
      for (const r of page.rows) { const s = JSON.stringify(r).length; if (size + s > 4e6 && chunk.length) await flush(); chunk.push(r); size += s; }
      await flush();
      if (page.next == null) break;
      after = page.next;
    }
    console.log('✔ ' + table + ': ' + n);
  } catch (e) { failed++; console.log('✖ ' + table + ' after ' + n + ' rows: ' + e.message); }
}
console.log(failed ? failed + ' tables failed' : 'all tables copied');
if (failed && MODE === 'export') process.exit(1);
