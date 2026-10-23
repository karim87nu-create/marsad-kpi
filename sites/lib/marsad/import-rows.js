// One-time move from the old system on any engine (D1 included). The admin page converts the old database
// file in the browser (import-convert.js) and sends the converted rows here in chunks, with the main password.
// Rows keep their ids and go in with INSERT OR IGNORE, so a move that stopped half way can simply be run again.
import { IMPORT_TABLES } from './import-convert.js';

const NAME = /^[a-z_]{1,40}$/;
// D1 takes at most 100 bound values per statement and a limited number of statements per request.
const PARAMS = 100, STATEMENTS = 40;
const rowsPerStatement = columns => Math.max(1, Math.floor(PARAMS / columns));
const MAX_ROWS = 1000;

function setup(app) {
  const { db, fail } = app;
  const empty = async () => !await db.prepare('SELECT 1 FROM events LIMIT 1').get() && !await db.prepare('SELECT 1 FROM employees LIMIT 1').get();
  const opened = async () => (await db.prepare("SELECT value FROM settings WHERE key = 'import_open'").get())?.value || null;

  app.route('GET', '/api/import-old', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const open = await opened();
    return { available: !!open || await empty(), resume: !!open };
  });

  app.route('POST', '/api/import-old/rows', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    if (who.id !== 0) fail(403, 'النقل بالباسورد الرئيسي بس');
    const b = ctx.body || {};
    if (b.action === 'begin') {
      const open = await opened();
      if (!open && !await empty()) fail(409, 'السيرفر فيه بيانات بالفعل؛ النقل بيتعمل مرة واحدة على سيرفر فاضي');
      if (!open) await db.prepare("INSERT INTO settings (key, value) VALUES ('import_open', ?)").run(String(ctx.now));
      return { ok: true, resumed: !!open };
    }
    if (!await opened()) fail(409, 'النقل مش مفتوح؛ ابدأه من الأول');
    if (b.action === 'rows') {
      const { table, columns, rows } = b;
      if (!IMPORT_TABLES.includes(table)) fail(400, 'جدول غير معروف');
      if (!Array.isArray(columns) || !columns.length || columns.length > 40 || !columns.every(c => typeof c === 'string' && NAME.test(c))) fail(400, 'أعمدة غير صحيحة');
      if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail(400, 'صفوف غير صحيحة');
      for (const r of rows) if (!Array.isArray(r) || r.length !== columns.length || !r.every(v => v === null || typeof v === 'string' || typeof v === 'number')) fail(400, 'صف غير صحيح');
      if (!rows.length) return { ok: true, count: 0 };
      const per = rowsPerStatement(columns.length);
      if (rows.length > per * STATEMENTS) fail(400, 'دفعة كبيرة');
      const one = '(' + columns.map(() => '?').join(', ') + ')';
      const head = 'INSERT OR IGNORE INTO ' + table + ' (' + columns.join(', ') + ') VALUES ';
      const statements = [];
      for (let i = 0; i < rows.length; i += per) {
        const part = rows.slice(i, i + per);
        statements.push(db.prepare(head + part.map(() => one).join(', ')).bind(...part.flat()));
      }
      const results = await db.batch(statements);
      return { ok: true, count: rows.length, added: results.reduce((n, x) => n + (x.changes || 0), 0) };
    }
    if (b.action === 'finish') {
      await db.prepare("DELETE FROM settings WHERE key = 'import_open'").run();
      const report = b.report && typeof b.report === 'object' ? b.report : {};
      await app.audit('old_data_imported', null, { actor: who.name, ...Object.fromEntries(Object.entries(report).filter(([, v]) => typeof v === 'number')) });
      return { ok: true };
    }
    fail(400, 'action غير معروف');
  }, { limit: 8 * 1024 * 1024 });
}

export { setup, rowsPerStatement, STATEMENTS };
