// مرصد الأوردرات: the monitor on the restaurant PC reads Apex (read-only) and pushes a summary of the
// operating day here every few seconds. The admin page shows it; its alerts go out through the same
// Telegram group as the call-center alerts (each kind can be switched off from the Telegram settings).
import { businessDay, dayWindow, isOperating, iso, validDate } from './time.js';
import { sha256, randomToken } from './security.js';

const KINDS = ['ordersLate', 'ordersCancel', 'ordersDiscount', 'ordersEntry', 'ordersStale'];
const STALE_MS = 3 * 60000, CHECK_MS = 60000;
// Which group: delays leaving the branch and cancellations after the pilot took the order go to the branch managers.
const BRANCH_KINDS = new Set(['ordersLate', 'ordersCancel']);

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const rulesOn = async () => {
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
    return k => r[k] !== false;
  };
  const queue = async (alerts, now) => {
    if (!alerts.length) return;
    const on = await rulesOn();
    await db.batch(alerts.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target) VALUES (?,?,?,?,?,?,?,?)')
      .bind(a.key, a.kind, null, a.text, now, a.replyTo || null, on(a.kind) ? null : now, BRANCH_KINDS.has(a.kind) ? 'branches' : null)));
  };

  // ---- the monitor's key: made once from the admin page, kept only as a hash ----
  app.route('GET', '/api/orders/token', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const last = Number(await setting('orders_last_push')) || null;
    return { linked: !!await setting('orders_token_hash'), lastPush: iso(last) };
  });
  app.route('POST', '/api/orders/token', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const token = 'ord_' + randomToken(24);
    await put('orders_token_hash', sha256(token));
    await app.audit('orders_token_created', null, { actor: who.name });
    return { token };
  });

  // ---- the monitor pushes the day ----
  app.route('POST', '/api/orders/push', async ctx => {
    const hash = await setting('orders_token_hash'), given = ctx.header('x-orders-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح مرصد الأوردرات غير صحيح');
    const b = ctx.body;
    if (!validDate(String(b.day || ''))) fail(400, 'invalid_day');
    const data = JSON.stringify({ ...b, alerts: undefined });
    if (data.length > 900000) fail(413, 'payload_too_large');
    const previous = Number(await setting('orders_last_push')) || null;
    await db.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data, received_at = excluded.received_at')
      .run(b.day, data, ctx.now);
    await put('orders_last_push', ctx.now);
    const alerts = (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 50)
      .filter(a => a && KINDS.includes(a.kind) && a.kind !== 'ordersStale' && a.key && a.text)
      .map(a => ({ key: 'orders:' + b.day + ':' + String(a.key).slice(0, 80), kind: a.kind, text: String(a.text).slice(0, 3500) }));
    // The monitor was reported stopped: say it is back, as a reply to that alert.
    if (previous) {
      const gone = await db.prepare('SELECT key FROM telegram_log WHERE key = ?').get('orders:stale:' + previous);
      if (gone) alerts.push({ key: 'resolved:' + gone.key, kind: 'ordersStale', replyTo: gone.key,
        text: '✅ مرصد الأوردرات رجع يشتغل — كان واقف ' + Math.round((ctx.now - previous) / 60000) + ' دقيقة' });
    }
    await queue(alerts, ctx.now);
    return { ok: true, serverNow: iso(ctx.now) };
  }, { limit: 1024 * 1024 });

  // ---- the admin page ----
  app.route('GET', '/api/orders/live', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const row = await db.prepare('SELECT data, received_at FROM orders_days WHERE day = ?').get(day);
    const w = dayWindow(day);
    const alerts = (await db.prepare("SELECT kind, text, created_at, sent_at, error FROM telegram_log WHERE kind LIKE 'orders%' AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 300").all(w.start, w.end))
      .map(r => ({ kind: r.kind, text: r.text, at: iso(r.created_at), sent: !!r.sent_at && !r.error }));
    const last = Number(await setting('orders_last_push')) || null;
    let data = null; try { data = row ? JSON.parse(row.data) : null; } catch {}
    return { day, data, receivedAt: iso(row?.received_at), lastPush: iso(last), ageSeconds: last ? Math.round((ctx.now - last) / 1000) : null,
      linked: !!await setting('orders_token_hash'), alerts, serverNow: iso(ctx.now) };
  });

  // ---- the monitor stopped (someone closed it, the PC is off, the network is down) ----
  let lastCheck = 0;
  app.afterRequest(async now => {
    if (now - lastCheck < CHECK_MS) return;
    lastCheck = now;
    const last = Number(await setting('orders_last_push')) || null;
    if (!last || now - last < STALE_MS || !isOperating(now)) return;
    if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('orders:stale:' + last)) return;
    const at = new Date(last).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    await queue([{ key: 'orders:stale:' + last, kind: 'ordersStale', text: '⚠️ مرصد الأوردرات واقف من ' + at + ' (' + Math.round((now - last) / 60000) + ' دقيقة)\nاتأكد إن جهاز الكاشير شغال ومتوصل بالنت' }], now);
  });
}

export { setup, KINDS };
