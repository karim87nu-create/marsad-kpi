// One-time move from the old system (Node runner only): the main admin password uploads the old
// database file (marsad-kpi-live.sqlite from the ChatGPT export) into an empty server.
// On ChatGPT Sites the same conversion runs as scripts/old-to-sql.js, imported into D1 directly.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { importOldDatabase } from './import-old-db.js';

function setup(app) {
  const { db, fail } = app;
  const empty = async () => !await db.prepare('SELECT 1 FROM events LIMIT 1').get() && !await db.prepare('SELECT 1 FROM employees LIMIT 1').get();
  app.route('GET', '/api/import-old', async ctx => { await app.requireAdmin(ctx, 'admin'); return { available: await empty() }; });
  app.route('POST', '/api/import-old', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    if (who.id !== 0) fail(403, 'الاستيراد بالباسورد الرئيسي بس');
    if (!await empty()) fail(409, 'السيرفر فيه بيانات بالفعل؛ الاستيراد بيتعمل مرة واحدة على سيرفر فاضي');
    if (!db.raw) fail(400, 'الاستيراد من هنا متاح على سيرفر Node فقط');
    // The file (hundreds of MB) goes straight to disk next to the database.
    const dir = app.config.databasePath && app.config.databasePath !== ':memory:' ? path.dirname(app.config.databasePath) : os.tmpdir();
    const file = path.join(dir, 'marsad-import-' + Date.now() + '.sqlite');
    // The page compresses it first (gzip), which makes the upload about ten times smaller.
    const source = Readable.fromWeb(ctx.request.body);
    await pipeline(...(ctx.header('x-compressed') === 'gzip' ? [source, zlib.createGunzip()] : [source]), fs.createWriteStream(file));
    const head = Buffer.alloc(16), fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    if (head.toString('latin1') !== 'SQLite format 3\u0000') { fs.rmSync(file, { force: true }); fail(400, 'الملف مش قاعدة بيانات SQLite'); }
    try {
      const report = importOldDatabase(db.raw, file, { now: ctx.now });
      await app.audit('old_data_imported', null, { actor: who.name, ...report });
      return { ok: true, report };
    } catch (e) { fail(400, 'تعذر الاستيراد: ' + e.message); } finally { fs.rmSync(file, { force: true }); for (const x of ['-wal', '-shm']) fs.rmSync(file + x, { force: true }); }
  }, { stream: true });
}

export { setup };
