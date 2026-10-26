// طلبات (Talabat Partner Hub): the extension on the Live Orders screen reports which orders it sees in which column
// (New / Accepted / Ready), signed in as the employee on that screen (desk session). The server keeps, per order:
// when it first appeared, when it showed as accepted and on whose screen, and when it left the screen.
// Only order numbers and columns are sent; nothing about the customer.
import { businessDay, iso, validDate } from './time.js';

const ACCEPT_ALERT_S = 90;
const COLUMN = { new: 'new', accepted: 'accepted', ready: 'ready' };

function setup(app) {
  const { db, fail } = app;

  app.route('POST', '/api/talabat/push', async ctx => {
    const s = await app.deskSession(ctx);
    if (s.desk !== 'talabat') fail(403, 'wrong_desk');
    const b = ctx.body || {}, account = String(b.account || '').slice(0, 120) || null;
    const list = (Array.isArray(b.orders) ? b.orders : []).slice(0, 200)
      .map(o => ({ id: String(o.id || '').replace(/\D/g, '').slice(0, 20), code: String(o.code || '').slice(0, 20), column: COLUMN[o.column] || null, store: o.store ? String(o.store).slice(0, 120) : null }))
      .filter(o => o.id.length >= 6 && o.column);
    const now = ctx.now, day = businessDay(now), writes = [];
    const seen = new Set(list.map(o => o.id));
    for (const o of list) {
      const acc = o.column === 'accepted';
      writes.push(db.prepare(`INSERT INTO talabat_orders (id, code, day, account, store, first_seen, new_seen, accepted_seen, accepted_by, accepted_session, ready_seen, last_seen, last_column)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET code = COALESCE(NULLIF(excluded.code, ''), talabat_orders.code), store = COALESCE(excluded.store, talabat_orders.store), account = COALESCE(talabat_orders.account, excluded.account),
          new_seen = COALESCE(talabat_orders.new_seen, excluded.new_seen),
          accepted_by = CASE WHEN talabat_orders.accepted_seen IS NULL THEN excluded.accepted_by ELSE talabat_orders.accepted_by END,
          accepted_session = CASE WHEN talabat_orders.accepted_seen IS NULL THEN excluded.accepted_session ELSE talabat_orders.accepted_session END,
          accepted_seen = COALESCE(talabat_orders.accepted_seen, excluded.accepted_seen),
          ready_seen = COALESCE(talabat_orders.ready_seen, excluded.ready_seen), last_seen = excluded.last_seen, last_column = excluded.last_column, gone_at = NULL`)
        .bind(o.id, o.code, day, account, o.store, now, o.column === 'new' ? now : null, acc ? now : null, acc ? s.employee_id : null, acc ? s.id : null, o.column === 'ready' ? now : null, now, o.column));
    }
    // Orders this screen showed before and no longer shows have left the live list.
    if (account) {
      const open = await db.prepare('SELECT id FROM talabat_orders WHERE account = ? AND gone_at IS NULL AND last_seen >= ?').all(account, now - 6 * 3600000);
      for (const r of open) if (!seen.has(r.id)) writes.push(db.prepare('UPDATE talabat_orders SET gone_at = ? WHERE id = ?').bind(now, r.id));
    }
    writes.push(db.prepare('UPDATE desk_sessions SET last_seen = ? WHERE id = ?').bind(now, s.id));
    await db.batch(writes);
    // An order still waiting in New for more than 90 seconds: one alert to the call center's online group.
    const waiting = await db.prepare("SELECT * FROM talabat_orders WHERE account IS ? AND last_column = 'new' AND accepted_seen IS NULL AND gone_at IS NULL AND new_seen <= ?").all(account, now - ACCEPT_ALERT_S * 1000);
    if (waiting.length) {
      const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
      let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
      const who = (await db.prepare('SELECT name FROM employees WHERE id = ?').get(s.employee_id))?.name || '';
      await db.batch(waiting.map(o => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target) VALUES (?,?,?,?,?,?,?)')
        .bind('talabat:accept:' + o.id, 'talabatAccept', s.employee_id, '⏰ أوردر طلبات مستني القبول من ' + Math.round((now - o.new_seen) / 1000) + ' ثانية — ' + (o.code ? '#' + o.code + ' ' : '') + o.id + (o.store ? '\n' + o.store : '') + (who ? '\nعلى شاشة: ' + who : ''), now, r.talabatAccept === false ? now : null, 'online')));
    }
    return { ok: true, serverNow: iso(now) };
  }, { limit: 128 * 1024 });

  app.route('GET', '/api/talabat/day', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare('SELECT t.*, e.name AS accepted_name FROM talabat_orders t LEFT JOIN employees e ON e.id = t.accepted_by WHERE t.day = ? ORDER BY t.first_seen').all(day);
    return { day, serverNow: iso(ctx.now), orders: rows.map(o => ({ id: o.id, code: o.code, account: o.account, store: o.store, firstSeen: iso(o.first_seen), newSeen: iso(o.new_seen),
      acceptedSeen: iso(o.accepted_seen), acceptSeconds: o.new_seen && o.accepted_seen ? Math.round((o.accepted_seen - o.new_seen) / 1000) : null, acceptedBy: o.accepted_name || null,
      readySeen: iso(o.ready_seen), goneAt: iso(o.gone_at), column: o.last_column })) };
  });
}

export { setup };
