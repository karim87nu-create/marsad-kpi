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
    const live = await liveWork();
    // available: the full move (empty server, or before the first sign-in here); backfill: bring in what is missing after that.
    return { available: !live, backfill: live && await imported(), imported: await imported(), lastImportAt: last ? new Date(last.occurred_at).toISOString() : null };
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

  // ---- After the switch: bring in what the old system recorded later, without touching new work ----
  // Old sessions are found by their device ('legacy:<old id>'), so their events are attached to the right session
  // here whatever its id; rows that are already here are left alone (sessions are updated: a session that was
  // still open at the first move has ended since). Days the new connector already collected keep its history.
  const BACKFILL = new Set(['employees', 'admin_accounts', 'employee_sessions', 'events', 'shift_decisions', 'live_snapshots', 'messages', 'message_recipients', 'reviews', 'saved_reports', 'audit']);
  const one = columns => '(' + columns.map(() => '?').join(', ') + ')';
  const insertIgnore = (table, columns, rows) => {
    const per = rowsPerStatement(columns.length), out = [];
    for (let i = 0; i < rows.length; i += per) { const part = rows.slice(i, i + per); out.push(db.prepare('INSERT OR IGNORE INTO ' + table + ' (' + columns.join(', ') + ') VALUES ' + part.map(() => one(columns)).join(', ')).bind(...part.flat())); }
    return out;
  };
  app.route('POST', '/api/import-old/backfill', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    if (who.id !== 0) fail(403, 'النقل بالباسورد الرئيسي بس');
    const b = ctx.body || {};
    if (b.action === 'status') {
      const r = await db.prepare("SELECT MAX(e.occurred_at) m FROM events e JOIN employee_sessions s ON s.id = e.session_id WHERE s.device LIKE 'legacy:%'").get();
      return { legacyThrough: r?.m ?? null };
    }
    if (b.action === 'finish') {
      const report = b.report && typeof b.report === 'object' ? b.report : {};
      await app.audit('old_data_backfilled', null, { actor: who.name, ...Object.fromEntries(Object.entries(report).filter(([, v]) => typeof v === 'number')) });
      return { ok: true };
    }
    if (b.action === 'history') {
      // One day of the old Arabicss history: { date, report: { imported_at, source, verified_total, expected_count, header, fingerprint }, calls: [raw] }
      const { date, report: r, calls } = b;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !r || !Array.isArray(calls) || calls.length > 5000 || !calls.every(c => typeof c === 'string')) fail(400, 'يوم غير صحيح');
      if (await db.prepare("SELECT 1 FROM history_reports WHERE date = ? AND source NOT LIKE 'legacy:%'").get(date)) return { ok: true, skipped: 'collected_here' };
      const source = 'legacy:' + String(r.source || '').replace(/^legacy:/, '');
      const statements = [
        db.prepare("DELETE FROM history_calls WHERE report_id IN (SELECT id FROM history_reports WHERE date = ? AND source LIKE 'legacy:%')").bind(date),
        db.prepare("DELETE FROM history_reports WHERE date = ? AND source LIKE 'legacy:%'").bind(date),
        db.prepare('INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)')
          .bind(date, Number(r.imported_at) || ctx.now, source, r.verified_total ? 1 : 0, r.expected_count ?? null, String(r.header || '[]'), String(r.fingerprint || '')),
      ];
      const per = Math.floor((PARAMS - 2) / 2);   // two values per call, plus the date and the source
      for (let i = 0; i < calls.length; i += per) {
        const part = calls.slice(i, i + per);
        statements.push(db.prepare('WITH v(idx, raw) AS (VALUES ' + part.map(() => '(?, ?)').join(', ') + ") INSERT INTO history_calls (report_id, idx, raw) SELECT (SELECT id FROM history_reports WHERE date = ? AND source = ? ORDER BY id DESC LIMIT 1), idx, raw FROM v")
          .bind(...part.flatMap((raw, k) => [i + k, raw]), date, source));
      }
      if (statements.length > STATEMENTS + 3 + 120) fail(400, 'يوم كبير');
      await db.batch(statements);
      return { ok: true, count: calls.length };
    }
    if (b.action !== 'rows') fail(400, 'action غير معروف');
    const { table, columns, rows } = b;
    if (!BACKFILL.has(table)) fail(400, 'جدول غير معروف');
    if (!Array.isArray(columns) || !columns.length || columns.length > 40 || !columns.every(c => typeof c === 'string' && NAME.test(c)) || new Set(columns).size !== columns.length) fail(400, 'أعمدة غير صحيحة');
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail(400, 'صفوف غير صحيحة');
    for (const r of rows) if (!Array.isArray(r) || r.length !== columns.length || !r.every(v => v === null || typeof v === 'string' || typeof v === 'number')) fail(400, 'صف غير صحيح');
    if (!rows.length) return { ok: true, count: 0 };
    let statements = [];
    if (table === 'employee_sessions') {
      if (columns.includes('id') || !columns.includes('device')) fail(400, 'أعمدة الجلسات غير صحيحة');
      const at = columns.indexOf('device'), rest = columns.filter(c => c !== 'device');
      if (rows.length > STATEMENTS / 2) fail(400, 'دفعة كبيرة');
      for (const r of rows) {
        if (!/^legacy:/.test(String(r[at]))) fail(400, 'جلسة مش من النظام القديم');
        const vals = rest.map(c => r[columns.indexOf(c)]);
        statements.push(db.prepare('UPDATE employee_sessions SET ' + rest.map(c => c + ' = ?').join(', ') + ' WHERE device = ?').bind(...vals, r[at]));
        statements.push(db.prepare('INSERT INTO employee_sessions (' + columns.join(', ') + ') SELECT ' + columns.map(() => '?').join(', ') + ' WHERE NOT EXISTS (SELECT 1 FROM employee_sessions WHERE device = ?)').bind(...r, r[at]));
      }
    } else if (table === 'events' || table === 'shift_decisions') {
      // 'device' stands for the session: replaced by this server's id of that old session.
      if (columns.includes('id') || columns.includes('session_id') || !columns.includes('device')) fail(400, 'أعمدة غير صحيحة');
      const at = columns.indexOf('device'), devices = [...new Set(rows.map(r => String(r[at])))];
      if (devices.length > PARAMS || !devices.every(d => /^legacy:/.test(d))) fail(400, 'جلسات غير صحيحة');
      const ids = new Map((await db.prepare('SELECT id, device FROM employee_sessions WHERE device IN (' + devices.map(() => '?').join(', ') + ')').all(...devices)).map(x => [x.device, x.id]));
      const cols = columns.map(c => c === 'device' ? 'session_id' : c);
      const mapped = rows.filter(r => ids.has(String(r[at]))).map(r => r.map((v, i) => i === at ? ids.get(String(v)) : v));
      statements = insertIgnore(table, cols, mapped);
    } else if (table === 'audit') {
      if (columns.includes('id') || !columns.includes('details')) fail(400, 'أعمدة السجل غير صحيحة');
      const at = columns.indexOf('details'), ids = rows.map(r => { try { return Number(JSON.parse(r[at]).legacyId); } catch { return NaN; } });
      if (!ids.every(Number.isSafeInteger)) fail(400, 'سجل من غير رقم قديم');
      for (let i = 0; i < ids.length; i += PARAMS) { const part = ids.slice(i, i + PARAMS); statements.push(db.prepare("DELETE FROM audit WHERE json_extract(details, '$.legacyId') IN (" + part.map(() => '?').join(', ') + ')').bind(...part)); }
      const per = rowsPerStatement(columns.length);
      for (let i = 0; i < rows.length; i += per) { const part = rows.slice(i, i + per); statements.push(db.prepare('INSERT INTO audit (' + columns.join(', ') + ') VALUES ' + part.map(() => one(columns)).join(', ')).bind(...part.flat())); }
    } else {
      if (table === 'live_snapshots' && columns.includes('id')) fail(400, 'أعمدة غير صحيحة');
      statements = insertIgnore(table, columns, rows);
    }
    if (statements.length > STATEMENTS + 20) fail(400, 'دفعة كبيرة');
    if (statements.length) await db.batch(statements);
    return { ok: true, count: rows.length };
  }, { limit: 8 * 1024 * 1024 });
}

export { setup, rowsPerStatement, STATEMENTS };
