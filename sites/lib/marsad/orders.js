// مرصد الأوردرات: the monitor on the restaurant PC reads Apex (read-only) and pushes a summary of the
// operating day here every few seconds. The admin page shows it; its alerts go out through the appropriate
// department group, including replies when an alert changes state (each kind can be switched off from the Telegram settings).
import { businessDay, dayWindow, isOperating, iso, validDate } from './time.js';
import { sha256, randomToken } from './security.js';

const KINDS = ['ordersLate', 'ordersCancel', 'ordersDiscount', 'ordersEntry', 'ordersEntryLate', 'ordersStale'];
const STALE_MS = 3 * 60000, CHECK_MS = 60000;
// Which group: delays leaving the branch and cancellations after the pilot took the order go to the branch managers.
const BRANCH_KINDS = new Set(['ordersLate']);

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
      .bind(a.key, a.kind, null, a.text, now, a.replyTo || null, on(a.kind) || a.replyTo ? null : now, a.target || (BRANCH_KINDS.has(a.kind) ? 'branches' : 'online'))));
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
    const alerts = [];
    // Persist each alert's last state per Apex day. A retry must not create a second reply.
    const stateKey = 'orders_alert_states:' + b.day;
    let states = {}; try { states = JSON.parse(await setting(stateKey) || '{}'); } catch {}
    const rows = name => Array.isArray(b[name]) ? b[name] : [];
    const orderNo = a => String(a.orderNo ?? a.orderId ?? (/^(?:late|del|disc|pay|entry|duplicate|cancel):([0-9]+)(?::|$)/.exec(String(a.key))?.[1] || ''));
    for (const a of (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 50)) {
      if (!a || !KINDS.includes(a.kind) || a.kind === 'ordersStale' || !a.key || !a.text) continue;
      const key = 'orders:' + b.day + ':' + String(a.key).slice(0, 80), text = String(a.text).slice(0, 3500);
      const old = states[key], no = orderNo(a);
      const cancellation = rows('cancels').find(o => String(o.no) === no);
      const target = BRANCH_KINDS.has(a.kind) || a.kind === 'ordersCancel' && cancellation && (cancellation.out || cancellation.pilot) ? 'branches' : 'online';
      const status = String(a.status || 'active').slice(0,80);
      const version = sha256(JSON.stringify([status, text]));
      if (!old) {
        if (status === 'resolved') continue; // No original warning to answer.
        alerts.push({ key, kind: a.kind, text, target });
        states[key] = { no, kind: a.kind, text, status, version, target };
      } else if (old.version !== version) {
        // Explicit state changes, including corrected entry errors, answer the original alert.
        // A changing duration in text alone is not a new state.
        if (old.status !== status || a.changed === true) alerts.push({ key: 'state:' + key + ':' + ((old.sequence || 0) + 1), kind: old.kind,
          text, replyTo: key, target: old.target });
        states[key] = { ...old, status, version, text, sequence: (old.sequence || 0) + (old.status !== status || a.changed === true ? 1 : 0) };
      }
    }
    for (const [key, old] of Object.entries(states)) {
      if (old.status === 'resolved' || !old.no) continue;
      const out = rows('lateOut').find(o => String(o.no) === old.no && o.out);
      const cancel = rows('cancels').find(o => String(o.no) === old.no);
      let text = null;
      if (old.kind === 'ordersLate' && (out || cancel)) text = cancel ? '🔄 أوردر ' + old.no + ' اتلغى بعد تنبيه تأخير الخروج.' : '✅ أوردر ' + old.no + ' خرج مع الطيار بعد تنبيه التأخير — وقت الخروج: ' + out.out;
      // Only a complete issues snapshot can prove that a recorded entry issue disappeared.
      if (old.kind === 'ordersEntry' && Array.isArray(b.issues) && Number.isInteger(b.totals?.issues) && b.totals.issues === b.issues.length &&
          old.observedIssue && !b.issues.some(o => String(o.no) === old.no)) text = '✅ أوردر ' + old.no + ': مشكلة الضرب لم تعد موجودة في قراءة Apex الكاملة.';
      if (old.kind === 'ordersEntry' && rows('issues').some(o => String(o.no) === old.no)) old.observedIssue = true;
      if (text) { alerts.push({ key: 'resolved:' + key + ':' + ((old.sequence || 0) + 1), kind: old.kind, text, replyTo: key, target: old.target }); old.status = 'resolved'; old.sequence = (old.sequence || 0) + 1; }
    }
    // The monitor was reported stopped: say it is back, as a reply to that alert.
    if (previous) {
      const gone = await db.prepare('SELECT key FROM telegram_log WHERE key = ?').get('orders:stale:' + previous);
      if (gone) alerts.push({ key: 'resolved:' + gone.key, kind: 'ordersStale', replyTo: gone.key,
        text: '✅ مرصد الأوردرات رجع يشتغل — كان واقف ' + Math.round((ctx.now - previous) / 60000) + ' دقيقة' });
    }
    await queue(alerts, ctx.now);
    await put(stateKey, JSON.stringify(states));
    return { ok: true, serverNow: iso(ctx.now) };
  }, { limit: 1024 * 1024 });

  // ---- the admin page ----
  app.route('GET', '/api/orders/live', async ctx => {
    await app.requireAdmin(ctx);
    // day=latest: the day the monitor pushed last (Apex closes its day on its own clock, not at 9 ص).
    const latest = ctx.query.day === 'latest' ? (await db.prepare('SELECT day FROM orders_days ORDER BY received_at DESC LIMIT 1').get())?.day : null;
    const day = latest || (validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now));
    const row = await db.prepare('SELECT data, received_at FROM orders_days WHERE day = ?').get(day);
    const w = dayWindow(day);
    const alerts = (await db.prepare("SELECT kind, text, created_at, sent_at, error FROM telegram_log WHERE kind LIKE 'orders%' AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 300").all(w.start, w.end))
      .map(r => ({ kind: r.kind, text: r.text, at: iso(r.created_at), sent: !!r.sent_at && !r.error }));
    const last = Number(await setting('orders_last_push')) || null;
    let data = null; try { data = row ? JSON.parse(row.data) : null; } catch {}
    return { day, data, receivedAt: iso(row?.received_at), lastPush: iso(last), ageSeconds: last ? Math.round((ctx.now - last) / 1000) : null,
      linked: !!await setting('orders_token_hash'), alerts, apexNames: app.apexNameMap ? await app.apexNameMap() : {}, serverNow: iso(ctx.now) };
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
