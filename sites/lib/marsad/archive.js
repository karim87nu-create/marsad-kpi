// تنظيف وأرشيف (Karim 07-11: «مع الوقت الأحداث متتمليش… ونسخ احتياطية معانا للي هيتمسح»).
// The database only grows: the call-center events alone were about 500 MB. Old rows are made small here, never lost:
// the monitor on the cashier PC downloads what will be removed, writes it to its own archive files, and only then
// tells the server to remove it. Reports keep working: an old event keeps every column the day reports read
// (type, time, call, phone, queue, duration); only its raw body is dropped, except the call id that reports use.
import { sha256 } from './security.js';

const DAY = 86400000;
const KEEP_EVENT_BODY_DAYS = 60;   // raw event bodies newer than this stay as they are
const KEEP_TELEGRAM_DAYS = 45;     // sent Telegram messages older than this are archived and removed
const KEEP_AUDIT_DAYS = 90;
const PAGE = 500;

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const auth = async ctx => {
    const hash = await setting('orders_token_hash'), given = ctx.header('x-orders-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح مرصد الأوردرات غير صحيح');
  };
  const ids = b => (Array.isArray(b?.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, PAGE);

  // What can be archived, oldest first, page by page (after = the last id of the previous page).
  const KINDS = {
    events: {
      cutoff: now => now - KEEP_EVENT_BODY_DAYS * DAY,
      list: (after, cutoff) => db.prepare(`SELECT id, session_id, employee_id, event_type, occurred_at, call_id, payload, extra FROM events
        WHERE id > ? AND occurred_at < ? AND (extra IS NOT NULL OR length(COALESCE(payload, '')) > 120) ORDER BY id LIMIT ${PAGE}`).all(after, cutoff),
      // Keep the row and every column reports read; the raw body becomes the call id alone (or nothing).
      done: (list, cutoff) => db.prepare(`UPDATE events SET extra = NULL, payload = CASE
          WHEN event_type IN ('call_observed', 'call_observed_end') AND json_valid(payload)
            THEN json_object('callId', COALESCE(json_extract(payload, '$.callId'), json_extract(payload, '$.payload.callId'), call_id))
          ELSE NULL END
        WHERE id IN (${list.map(() => '?').join(',')}) AND occurred_at < ?`).run(...list, cutoff),
    },
    telegram_log: {
      cutoff: now => now - KEEP_TELEGRAM_DAYS * DAY,
      list: (after, cutoff) => db.prepare(`SELECT * FROM telegram_log WHERE id > ? AND created_at < ? ORDER BY id LIMIT ${PAGE}`).all(after, cutoff),
      done: (list, cutoff) => db.prepare(`DELETE FROM telegram_log WHERE id IN (${list.map(() => '?').join(',')}) AND created_at < ?`).run(...list, cutoff),
    },
    audit: {
      cutoff: now => now - KEEP_AUDIT_DAYS * DAY,
      list: (after, cutoff) => db.prepare(`SELECT * FROM audit WHERE id > ? AND occurred_at < ? ORDER BY id LIMIT ${PAGE}`).all(after, cutoff),
      done: (list, cutoff) => db.prepare(`DELETE FROM audit WHERE id IN (${list.map(() => '?').join(',')}) AND occurred_at < ?`).run(...list, cutoff),
    },
  };

  app.route('POST', '/api/archive/next', async ctx => {
    await auth(ctx);
    const k = KINDS[String(ctx.body?.kind || '')];
    if (!k) return { kinds: Object.keys(KINDS) };
    const after = Math.max(0, Number(ctx.body?.after) || 0), cutoff = k.cutoff(ctx.now);
    const rows = await k.list(after, cutoff);
    return { kind: ctx.body.kind, cutoff, rows, next: rows.length === PAGE ? rows[rows.length - 1].id : null };
  });
  // Only after the PC wrote the page to its archive file.
  app.route('POST', '/api/archive/done', async ctx => {
    await auth(ctx);
    const k = KINDS[String(ctx.body?.kind || '')];
    if (!k) fail(400, 'invalid_kind');
    const list = ids(ctx.body);
    if (!list.length) return { changed: 0 };
    const r = await k.done(list, k.cutoff(ctx.now));
    return { changed: r.changes || 0 };
  });

  // The cashier PC says how its nightly copy went, so a copy that stops is heard on Telegram (system-watch.js).
  app.route('POST', '/api/archive/status', async ctx => {
    await auth(ctx);
    const b = ctx.body || {}, out = {};
    const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
    const freeGb = Number.isFinite(Number(b.freeGb)) ? Math.round(Number(b.freeGb) * 10) / 10 : null;
    if (b.backup && typeof b.backup === 'object') {
      const old = JSON.parse(await setting('backup_status') || '{}') || {};
      const ok = b.backup.ok === true;
      out.backup = { at: ctx.now, ok, okAt: ok ? ctx.now : old.okAt || null, error: ok ? null : String(b.backup.error || 'غير معروف').slice(0, 300),
        tables: Number(b.backup.tables) || null, freeGb };
      await put('backup_status', out.backup);
    }
    if (b.archive && typeof b.archive === 'object') {
      out.archive = { at: ctx.now, pages: Number(b.archive.pages) || 0, upToDate: b.archive.upToDate === true, error: b.archive.error ? String(b.archive.error).slice(0, 300) : null, freeGb };
      await put('archive_status', out.archive);
    }
    return { ok: true, ...out };
  });

  // Pure caches: the transfer page's saved day builds older than three days are not needed by anyone.
  app.afterRequest(now => {
    if (now - (app._cacheSweep || 0) < 6 * 3600000) return;
    app._cacheSweep = now;
    const old = new Date(now - 3 * DAY + 2 * 3600000).toISOString().slice(0, 10);
    return db.prepare('DELETE FROM transfer_cache WHERE day < ?').run(old).catch(() => {});
  });
}

export { setup, KEEP_EVENT_BODY_DAYS, KEEP_TELEGRAM_DAYS, KEEP_AUDIT_DAYS };
