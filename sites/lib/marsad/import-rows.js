// Moving the old system's data in, on any engine (D1 included). The admin page converts the old database file
// in the browser (import-convert.js) and sends the converted rows here in chunks, with the main password.
// The conversion gives every row the same id each time, so the move can be repeated with a newer copy of the old
// database: rows that are already here are updated, rows that are missing are added. That stays possible until the
// first employee signs in on this server (a session that did not come from the old system); after that the
// old data could overwrite new work, so the move is closed.
import { IMPORT_TABLES } from './import-convert.js';

const NAME = /^[a-z_]{1,40}$/;
// D1 takes at most 100 bound values per statement and a limited number of statements per request.
const PARAMS = 100, STATEMENTS = 40;
const rowsPerStatement = columns => Math.max(1, Math.floor(PARAMS / columns));
const MAX_ROWS = 1000;

function setup(app) {
  const { db, fail } = app;
  const imported = async () => !!await db.prepare('SELECT 1 FROM employees LIMIT 1').get();
  const liveWork = async () => !!await db.prepare("SELECT 1 FROM employee_sessions WHERE device NOT LIKE 'legacy:%' LIMIT 1").get();

  app.route('GET', '/api/import-old', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const last = await db.prepare("SELECT occurred_at FROM audit WHERE action = 'old_data_imported' ORDER BY id DESC LIMIT 1").get();
    return { available: !await liveWork(), imported: await imported(), lastImportAt: last ? new Date(last.occurred_at).toISOString() : null };
  });

  app.route('POST', '/api/import-old/rows', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    if (who.id !== 0) fail(403, 'النقل بالباسورد الرئيسي بس');
    if (await liveWork()) fail(409, 'الموظفين بدأوا يشتغلوا على السيرفر الجديد؛ النقل من القديم اتقفل عشان مايكتبش فوق الشغل الجديد');
    const b = ctx.body || {};
    if (b.action === 'begin') return { ok: true, topUp: await imported() };
    if (b.action === 'rows') {
      const { table, columns, key, rows } = b;
      const okNames = (list, max) => Array.isArray(list) && list.length && list.length <= max && list.every(c => typeof c === 'string' && NAME.test(c));
      if (!IMPORT_TABLES.includes(table)) fail(400, 'جدول غير معروف');
      if (!okNames(columns, 40) || new Set(columns).size !== columns.length) fail(400, 'أعمدة غير صحيحة');
      if (!okNames(key, 4) || !key.every(k => columns.includes(k))) fail(400, 'مفتاح غير صحيح');
      if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail(400, 'صفوف غير صحيحة');
      for (const r of rows) if (!Array.isArray(r) || r.length !== columns.length || !r.every(v => v === null || typeof v === 'string' || typeof v === 'number')) fail(400, 'صف غير صحيح');
      if (!rows.length) return { ok: true, count: 0 };
      const per = rowsPerStatement(columns.length);
      if (rows.length > per * STATEMENTS) fail(400, 'دفعة كبيرة');
      if (table === 'audit') {
        // The old log has no ids of its own here (this server keeps writing its own log): each row carries its old id
        // in details.legacyId, and a row sent again replaces the earlier copy.
        if (columns.includes('id') || !columns.includes('details') || key.length !== 1 || key[0] !== 'details') fail(400, 'أعمدة السجل غير صحيحة');
        const at = columns.indexOf('details');
        const ids = rows.map(r => { try { return Number(JSON.parse(r[at]).legacyId); } catch { return NaN; } });
        if (!ids.every(Number.isSafeInteger)) fail(400, 'سجل من غير رقم قديم');
        const statements = [];
        for (let i = 0; i < ids.length; i += PARAMS) {
          const part = ids.slice(i, i + PARAMS);
          statements.push(db.prepare("DELETE FROM audit WHERE json_extract(details, '$.legacyId') IN (" + part.map(() => '?').join(', ') + ')').bind(...part));
        }
        const per = rowsPerStatement(columns.length), one = '(' + columns.map(() => '?').join(', ') + ')';
        for (let i = 0; i < rows.length; i += per) {
          const part = rows.slice(i, i + per);
          statements.push(db.prepare('INSERT INTO audit (' + columns.join(', ') + ') VALUES ' + part.map(() => one).join(', ')).bind(...part.flat()));
        }
        await db.batch(statements);
        return { ok: true, count: rows.length };
      }
      const rest = columns.filter(c => !key.includes(c));
      const one = '(' + columns.map(() => '?').join(', ') + ')';
      const head = 'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES ';
      const tail = ' ON CONFLICT (' + key.join(', ') + ') ' + (rest.length ? 'DO UPDATE SET ' + rest.map(c => c + ' = excluded.' + c).join(', ') : 'DO NOTHING');
      const statements = [];
      for (let i = 0; i < rows.length; i += per) {
        const part = rows.slice(i, i + per);
        statements.push(db.prepare(head + part.map(() => one).join(', ') + tail).bind(...part.flat()));
      }
      await db.batch(statements);
      return { ok: true, count: rows.length };
    }
    if (b.action === 'finish') {
      const report = b.report && typeof b.report === 'object' ? b.report : {};
      await app.audit('old_data_imported', null, { actor: who.name, ...Object.fromEntries(Object.entries(report).filter(([, v]) => typeof v === 'number')) });
      return { ok: true };
    }
    fail(400, 'action غير معروف');
  }, { limit: 8 * 1024 * 1024 });
}

export { setup, rowsPerStatement, STATEMENTS };
