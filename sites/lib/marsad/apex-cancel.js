// الإلغاء التلقائي على Apex (Karim 11-11: «اي كومنت يتبعت فيه لاغي لازم الاوردر يتمسح بعد ٥د بالظبط من السيستم تلقائي»).
// The cashier PC's monitor sends every order whose comment (its note or a message on it) says it is cancelled — «لاغي»
// written any way, «ملغي», «كنسل» — with when it first saw that. Five minutes after:
//  - the order is with a pilot already: never cancelled by itself; the branch and online groups are told;
//  - admin turned the automatic cancel on: the Apex writer cancels it the way Apex's own screen does (reason «بناء على طلب
//    العميل»), then both groups are told it was cancelled; anything the writer could not do comes back to a person;
//  - otherwise (off): both groups are told to cancel it on Apex.
// One decision per order; every step is kept (admin list).
import { businessDay, iso } from './time.js';
import { parseJson } from './order-match.js';

const WAIT_MS = 5 * 60000, REASON_NO = 6, REASON = 'بناء على طلب العميل';
const ST = { 1: 'الأوردر مش موجود على Apex (اتلغى أو اتمسح قبل كده)', 2: 'خرج مع الطيار قبل الإلغاء', 3: 'متسجل ملغي على Apex قبل كده', 4: 'فيه أصناف كومبو أو تعديلات — يتلغى بإيد' };

function setup(app) {
  const { db, fail } = app;
  const mode = async () => (await db.prepare("SELECT value FROM settings WHERE key = 'apex_auto_cancel'").get())?.value === 'on' ? 'on' : 'off';
  const tell = async (rows, now) => {
    if (!rows.length) return;
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get().catch(() => null);
    if (parseJson(c?.rules, {}).apexAutoCancel === false) return;
    await db.batch(rows.flatMap(r => [['branches', r.branch || null, ''], ['online', null, ':online']].map(([target, branch, sfx]) =>
      db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch) VALUES (?, 'apexAutoCancel', NULL, ?, ?, NULL, ?, ?)")
        .bind(r.key + sfx, r.text, now, target, branch))));
  };
  const head = r => '🖥️ Apex | أوردر ' + (r.sn ? r.sn + ' (' + r.order_no + ')' : r.order_no) + (r.branch ? ' — ' + r.branch : '');

  // From each push of the monitor (orders.js calls it with the payload's cancelNotes).
  app.apexCancelNotes = async (list, now) => {
    if (!Array.isArray(list) || !list.length) return;
    const on = await mode(), say = [];
    for (const x of list.slice(0, 50)) {
      const no = Number(x?.no), seen = Date.parse(x?.seenAt || '');
      if (!Number.isFinite(no) || no <= 0 || !Number.isFinite(seen) || now - seen < WAIT_MS) continue;
      const previous = await db.prepare('SELECT state FROM apex_cancels WHERE order_no = ?').get(no);
      if (previous) {
        // If auto-cancel is enabled after a manual reminder was already sent, pick up
        // that still-open order on the next monitor push instead of leaving it stranded.
        if (on === 'on' && previous.state === 'manual' && !x.out)
          await db.prepare("UPDATE apex_cancels SET state = 'pending', at = ? WHERE order_no = ? AND state = 'manual'").run(now, no);
        continue;
      }
      const r = { order_no: no, sn: x.sn ?? null, branch: String(x.branch || '').slice(0, 60) || null, text: String(x.text || '').replace(/\s+/g, ' ').slice(0, 300) };
      const state = x.out ? 'withPilot' : on === 'on' ? 'pending' : 'manual';
      await db.prepare('INSERT OR IGNORE INTO apex_cancels (order_no, day, sn, branch, text, seen_at, state, at) VALUES (?,?,?,?,?,?,?,?)').run(no, businessDay(now), r.sn, r.branch, r.text, seen, state, now);
      if (state === 'withPilot') say.push({ key: 'apexcancel:' + no, branch: r.branch, text: head(r) + ' مكتوب في تعليقه إنه ملغي من 5 دقايق وهو خرج مع الطيار\nالتعليق: ' + r.text + '\nكلموا الطيار والغوه على Apex' });
      if (state === 'manual') say.push({ key: 'apexcancel:' + no, branch: r.branch, text: head(r) + ' مكتوب في تعليقه إنه ملغي من 5 دقايق ولسه موجود على Apex\nالتعليق: ' + r.text + '\nالغوه على Apex دلوقتي' });
    }
    await tell(say, now);
  };

  // The Apex writer: what to cancel now, and what it did.
  app.route('POST', '/api/apex-writer/cancel-next', async ctx => {
    await app.apexWriterAuth(ctx);
    if (await mode() !== 'on') return { orders: [] };
    const rows = await db.prepare("SELECT order_no FROM apex_cancels WHERE state = 'pending' ORDER BY at LIMIT 10").all();
    if (rows.length) await db.batch(rows.map(r => db.prepare("UPDATE apex_cancels SET state = 'sending', at = ? WHERE order_no = ? AND state = 'pending'").bind(ctx.now, r.order_no)));
    return { orders: rows.map(r => ({ orderNo: r.order_no, reasonNo: REASON_NO, reason: REASON })) };
  });
  app.route('POST', '/api/apex-writer/cancel', async ctx => {
    await app.apexWriterAuth(ctx);
    const say = [];
    for (const d of (Array.isArray(ctx.body?.done) ? ctx.body.done : []).slice(0, 20)) {
      const no = Number(d?.orderNo), r = await db.prepare('SELECT * FROM apex_cancels WHERE order_no = ?').get(no); if (!r) continue;
      const st = Number(d.st), state = st === 0 ? 'done' : st === 1 || st === 3 ? 'gone' : 'failed', why = st === 0 ? null : ST[st] || String(d.note || 'خطأ').slice(0, 200);
      await db.prepare('UPDATE apex_cancels SET state = ?, result = ?, done_at = ? WHERE order_no = ?').run(state, why, ctx.now, no);
      if (state === 'done') say.push({ key: 'apexcancel:' + no, branch: r.branch, text: head(r) + ' ❌ اتلغى تلقائي على Apex (مكتوب في تعليقه إنه ملغي من 5 دقايق)\nالتعليق: ' + r.text + '\nالسبب: ' + REASON });
      if (state === 'failed') say.push({ key: 'apexcancel:' + no, branch: r.branch, text: head(r) + ' مكتوب في تعليقه إنه ملغي — المرصد ماقدرش يلغيه: ' + why + '\nالتعليق: ' + r.text + '\nالغوه على Apex بإيدكم' });
    }
    await tell(say, ctx.now);
    return { ok: true };
  });

  // Admin: the switch and the list.
  app.route('GET', '/api/apex-cancel', async ctx => {
    await app.requireAdmin(ctx);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare('SELECT * FROM apex_cancels WHERE day = ? ORDER BY seen_at DESC').all(day);
    return { mode: await mode(), day, list: rows.map(r => ({ orderNo: r.order_no, sn: r.sn, branch: r.branch, text: r.text, seenAt: iso(r.seen_at), state: r.state, result: r.result, doneAt: iso(r.done_at) })) };
  });
  app.route('POST', '/api/apex-cancel', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const m = ctx.body?.mode === 'on' ? 'on' : ctx.body?.mode === 'off' ? 'off' : null; if (!m) fail(400, 'invalid_mode');
    if (m === 'on' && String(ctx.body.confirm || '') !== 'ON') fail(400, 'التشغيل محتاج تأكيد');
    await db.prepare("INSERT INTO settings (key, value) VALUES ('apex_auto_cancel', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(m);
    await app.audit('apex_auto_cancel', null, { actor: who.name, mode: m });
    return { ok: true, mode: m };
  });
}

export { setup };

