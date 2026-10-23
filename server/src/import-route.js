'use strict';
// One-time move from the old system: the main admin password uploads the old database file
// (marsad-kpi-live.sqlite from the ChatGPT export) into an empty server.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { importOldDatabase } = require('./import-old-db');

function setup(app) {
  const { db, fail } = app;
  const empty = () => !db.prepare('SELECT 1 FROM events LIMIT 1').get() && !db.prepare('SELECT 1 FROM employees LIMIT 1').get();
  app.route('GET', '/api/import-old', ctx => { app.requireAdmin(ctx, 'admin'); return { available: empty() }; });
  app.route('POST', '/api/import-old', async ctx => {
    const who = app.requireAdmin(ctx, 'admin');
    if (who.id !== 0) fail(403, 'الاستيراد بالباسورد الرئيسي بس');
    if (!empty()) fail(409, 'السيرفر فيه بيانات بالفعل؛ الاستيراد بيتعمل مرة واحدة على سيرفر فاضي');
    // The file (hundreds of MB) goes straight to disk next to the database.
    const file = path.join(path.dirname(app.config.databasePath && app.config.databasePath !== ':memory:' ? app.config.databasePath : os.tmpdir() + '/x'), 'marsad-import-' + Date.now() + '.sqlite');
    // The page compresses it first (gzip), which makes the upload about ten times smaller.
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(file), source = ctx.header('x-compressed') === 'gzip' ? ctx.req.pipe(zlib.createGunzip()) : ctx.req;
      source.pipe(out); out.on('finish', resolve); out.on('error', reject); source.on('error', reject); ctx.req.on('error', reject);
    });
    const head = Buffer.alloc(16), fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    if (head.toString('latin1') !== 'SQLite format 3\u0000') { fs.rmSync(file, { force: true }); fail(400, 'الملف مش قاعدة بيانات SQLite'); }
    try {
      const report = importOldDatabase(db, file, { now: ctx.now });
      app.audit('old_data_imported', null, { actor: who.name, ...report });
      return { ok: true, report };
    } catch (e) { fail(400, 'تعذر الاستيراد: ' + e.message); } finally { fs.rmSync(file, { force: true }); for (const x of ['-wal', '-shm']) fs.rmSync(file + x, { force: true }); }
  }, { stream: true });
}

module.exports = { setup };
