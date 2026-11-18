// الانتقال لـ Cloudflare من غير وقف الشغل (Karim 11-17). The main password only (not other admin accounts).
// export: every table page by page, as the database holds it (hashes and the server's own key included, so the
//   employees' passwords, the tokens of the cashier PC and the saved Telegram key keep working on the new server).
// import: the same pages written into this server; closed for good with «lock» once the move is done.
import { hashPassword, verifyPassword, sha256 } from './security.js';
import { parseJson } from './order-match.js';

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
    const info = await db.prepare(`PRAGMA table_info("${table}")`).all();
    const cols = new Set(info.map(c => c.name)), required = info.filter(c => c.notnull && c.dflt_value == null && !c.pk).map(c => c.name);
    const stmts = [];
    // This server's own main password and key stay unless the copy brings the old ones.
    if (reset) stmts.push(db.prepare(`DELETE FROM "${table}"` + (table === 'settings' ? " WHERE key NOT IN ('admin_hash', 'secret')" : '')).bind());
    for (let r of rows) {
      if (table === 'settings' && r.key === 'migration_locked') continue;
      const keys = Object.keys(r).filter(k => cols.has(k));
      // A column the backup leaves out (a password) but the table needs: a value that matches nothing, until adopted.
      for (const c of required) if (!keys.includes(c)) { keys.push(c); r = { ...r, [c]: '!' }; }
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

  // Keys and passwords follow to the Cloudflare copy (Karim 11-17/18: no publish, nothing typed by hand). Only where the
  // server is set to take them (adoptFrom): something this server doesn't know is checked once on the old server, with
  // a call that answers only that key or password and changes nothing there, and kept here if the old server takes it.
  const tried = new Map();
  const once = (k, now) => { if (now - (tried.get(k) || -Infinity) < 10 * 60000) return false; tried.set(k, now); if (tried.size > 500) tried.delete(tried.keys().next().value); return true; };
  const oldCall = async (path, init) => { try { const r = await fetch(app.config.adoptFrom + path, init); return { status: r.status, j: await r.json().catch(() => ({})) }; } catch { return { status: 0, j: {} }; } };
  const setS = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
  const getS = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const KEYS = [
    // header, setting, old call that answers only that key
    ['x-orders-token', 'orders_token_hash', t => ['/api/backup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-orders-token': t }, body: '{}' }]],
    ['x-apex-writer', 'apex_writer_token_hash', t => ['/api/apex-writer/customer-notes/pending', { method: 'POST', headers: { 'content-type': 'application/json', 'x-apex-writer': t }, body: '{}' }]],
    ['x-talabat-token', 'talabat_token_hash', t => ['/api/talabat/stock', { method: 'GET', headers: { 'x-talabat-token': t } }]],
  ];
  if (true) app.beforeRequest(async (now, request) => {
    if (!app.config.adoptFrom || !request?.headers) return;
    for (const [header, key, call] of KEYS) {
      const given = request.headers.get(header);
      if (!given || given.length > 200) continue;
      const h = sha256(given), cur = await getS(key);
      if (cur === h || (key === 'talabat_token_hash' && parseJson(await getS('talabat_token_extra'), []).includes(h))) continue;
      if (!once(header + h, now)) continue;
      const r = await oldCall(...call(given));
      if (r.status !== 200) continue;
      if (key === 'talabat_token_hash' && cur) await setS('talabat_token_extra', JSON.stringify([...parseJson(await getS('talabat_token_extra'), []), h].slice(-10)));
      else await setS(key, h);
      await app.audit('key_adopted', null, { actor: header });
    }
  });
  if (true) {
    app.adoptAdmin = async password => {
      if (!app.config.adoptFrom || !password || !once('a' + sha256(password), Date.now())) return null;
      const r = await oldCall('/api/admin-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', password }) });
      const who = r.status === 200 && r.j.identity;
      if (!who || !Number.isInteger(who.id)) return null;
      tried.delete('a' + sha256(password));
      if (who.id === 0) { if (await getS('admin_hash')) return null; await setS('admin_hash', await hashPassword(password)); app.config.adminPasswordHash = null; }
      else {
        const role = ['admin', 'supervisor', 'viewer'].includes(who.role) ? who.role : 'viewer';
        await db.prepare(`INSERT INTO admin_accounts (id, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)
          ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash`).run(who.id, String(who.name || 'حساب').slice(0, 80), role, await hashPassword(password), Date.now());
      }
      await app.audit('admin_adopted', null, { actor: who.name || null });
      return who.id === 0 ? { id: 0, name: who.name || 'المدير', role: 'admin' } : { id: who.id, name: who.name, role: who.role };
    };
    app.adoptPin = async pin => {
      if (!app.config.adoptFrom || !once('p' + sha256('pin:' + pin), Date.now())) return null;
      const r = await oldCall('/api/transfer/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
      return r.status === 200 && Number.isInteger(r.j.employee?.id) ? r.j.employee.id : null;
    };
    app.adoptCollector = async refreshToken => {
      if (!app.config.adoptFrom || !refreshToken || !once('c' + sha256(refreshToken), Date.now())) return false;
      const r = await oldCall('/api/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh', refreshToken }) });
      return r.status === 200 && !!r.j.token;
    };
  }

  // The move page (on the GitHub page) starts here: the old server's main password becomes this server's, once.
  app.route('POST', '/api/migrate/begin', async ctx => {
    if (!app.config.adoptFrom) fail(404, 'not_found');
    if (await locked()) fail(409, 'النقل اتقفل');
    const password = String(ctx.body?.password || '');
    const mine = await getS('admin_hash');
    if (mine) { if (!await verifyPassword(password, mine)) fail(401, 'كلمة المرور الرئيسية غلط'); return { ok: true }; }
    const who = await app.adoptAdmin(password);
    if (!who || who.id !== 0) fail(401, 'كلمة المرور الرئيسية غلط');
    return { ok: true };
  });

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
