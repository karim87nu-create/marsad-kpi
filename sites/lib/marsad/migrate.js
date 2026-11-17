// الانتقال لـ Cloudflare من غير وقف الشغل (Karim 11-17). The main password only (not other admin accounts).
// export: every table page by page, as the database holds it (hashes and the server's own key included, so the
//   employees' passwords, the tokens of the cashier PC and the saved Telegram key keep working on the new server).
// import: the same pages written into this server; closed for good with «lock» once the move is done.
import { hashPassword } from './security.js';

const PAGE = 1000;
const SKIP = /^(sqlite_|_cf_|d1_)/;

function setup(app) {
  const { db, fail } = app;
  const master = async ctx => { const who = await app.requireAdmin(ctx, 'admin'); if (who.id !== 0) fail(403, 'بكلمة المرور الرئيسية بس'); return who; };
  const tables = async () => (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).map(r => r.name).filter(n => !SKIP.test(n));
  const columns = async t => (await db.prepare(`PRAGMA table_info("${t}")`).all()).map(c => c.name);

  app.route('POST', '/api/migrate/export', async ctx => {
    await master(ctx);
    const list = await tables(), table = String(ctx.body?.table || '');
    if (!table) return { tables: list };
    if (!list.includes(table)) fail(400, 'invalid_table');
    const rows = await db.prepare(`SELECT rowid AS _rowid, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`).all(Number(ctx.body?.after) || 0);
    return { table, rows, next: rows.length === PAGE ? rows[rows.length - 1]._rowid : null };
  });

  const locked = async () => !!(await db.prepare("SELECT value FROM settings WHERE key = 'migration_locked'").get())?.value;
  async function write(table, rows, reset) {
    if (!(await tables()).includes(table)) return 0;   // a table the new code no longer has
    const cols = new Set(await columns(table));
    const stmts = [];
    // This server's own main password and key stay unless the copy brings the old ones.
    if (reset) stmts.push(db.prepare(`DELETE FROM "${table}"` + (table === 'settings' ? " WHERE key NOT IN ('admin_hash', 'secret')" : '')).bind());
    for (const r of rows) {
      if (table === 'settings' && r.key === 'migration_locked') continue;
      const keys = Object.keys(r).filter(k => cols.has(k));
      const names = (r._rowid != null ? ['rowid'] : []).concat(keys);
      const vals = (r._rowid != null ? [r._rowid] : []).concat(keys.map(k => r[k] === undefined ? null : r[k]));
      stmts.push(db.prepare(`INSERT OR REPLACE INTO "${table}" (${names.map(n => '"' + n + '"').join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).bind(...vals));
    }
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    return rows.length;
  }

  // The new server pulls one page at a time from the old one (Karim 11-17: no keys to copy anywhere). Whoever
  // calls it types the old server's main password on the move page; the old server itself checks it, and once
  // this server has the copied main password it must match here too.
  const OLD = () => app.config.migrateFrom || 'https://marsad-v2.karim87nu.chatgpt.site';
  async function old(path, pw, body) {
    const r = await fetch(OLD() + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': pw }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  }
  app.route('POST', '/api/migrate/pull', async ctx => {
    if (await locked()) fail(409, 'النقل اتقفل');
    const pw = String(ctx.header('x-old-password') || '');
    if (!pw) fail(401, 'اكتب كلمة المرور الرئيسية');
    const mine = (await db.prepare("SELECT value FROM settings WHERE key = 'admin_hash'").get())?.value || app.config.adminPasswordHash;
    if (mine) await master({ ...ctx, header: n => n === 'x-admin-password' ? pw : ctx.header(n) });
    const b = ctx.body || {}, table = b.table ? String(b.table) : null;
    // The full copy when the old server has it, otherwise its daily backup (no passwords or keys).
    let path = '/api/migrate/export', r = await old(path, pw, table ? { table, after: b.after || 0 } : {});
    if (r.status === 404) { path = '/api/backup'; r = await old(path, pw, table ? { table, after: b.after || 0 } : {}); }
    if (r.status === 401 || r.status === 403) fail(401, 'كلمة المرور الرئيسية غلط');
    if (r.status !== 200) fail(502, 'السيرفر القديم رد بـ ' + r.status);
    // The full copy answers only the old main password: it becomes this server's main password too, when the old
    // server kept it in its settings (MARSAD_ADMIN_PASSWORD) and so the copy brings none.
    if (path === '/api/migrate/export' && !mine) {
      await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_hash', ?)").run(await hashPassword(pw));
      app.config.adminPasswordHash = null;
    }
    if (!table) return { tables: r.j.tables || [], full: path === '/api/migrate/export' };
    const n = await write(table, r.j.rows || [], !b.after);
    return { table, rows: n, next: r.j.next ?? null, full: path === '/api/migrate/export' };
  }, { limit: 64 * 1024 });

  app.route('POST', '/api/migrate/import', async ctx => {
    await master(ctx);
    if (await locked()) fail(409, 'النقل اتقفل');
    const b = ctx.body || {}, table = String(b.table || '');
    if (!(await tables()).includes(table)) return { ok: true, skipped: table };
    const rows = Array.isArray(b.rows) ? b.rows : [];
    await write(table, rows, !!b.reset);
    return { ok: true, table, rows: rows.length };
  }, { limit: 30 * 1024 * 1024 });

  app.route('POST', '/api/migrate/lock', async ctx => {
    const who = await master(ctx);
    await db.prepare("INSERT INTO settings (key, value) VALUES ('migration_locked', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(ctx.now));
    await app.audit('migration_locked', null, { actor: who.name });
    return { ok: true };
  });
}

export { setup };
