// نسخة احتياطية يومية (Karim 01-11): the monitor on the cashier PC downloads every table once a day (page by page) and
// keeps the last 14 days there. Keys, password hashes and tokens are never in it.
import { sha256 } from './security.js';

const SECRET = /hash|token|secret|password|site_wc|seal|cred/i;
const PAGE = 2000;

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const auth = async ctx => {
    if (ctx.header('x-admin-password')) { await app.requireAdmin(ctx, 'admin'); return; }
    const hash = await setting('orders_token_hash'), given = ctx.header('x-orders-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح مرصد الأوردرات غير صحيح');
  };
  const tables = async () => (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all())
    .map(r => r.name).filter(n => !SECRET.test(n));
  app.route('POST', '/api/backup', async ctx => {
    await auth(ctx);
    const list = await tables();
    const table = String(ctx.body?.table || '');
    if (!table) return { tables: list };
    if (!list.includes(table)) fail(400, 'invalid_table');
    const after = Number(ctx.body?.after) || 0;
    const rows = await db.prepare(`SELECT rowid AS _rowid, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`).all(after);
    const clean = table === 'settings' ? rows.filter(r => !SECRET.test(String(r.key || ''))) : rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET.test(k))));
    return { table, rows: clean, next: rows.length === PAGE ? rows[rows.length - 1]._rowid : null };
  });
}

export { setup };
