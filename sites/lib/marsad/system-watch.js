// مراقبة السيستم نفسه (Karim 01-11): when a part of the monitoring stops, the supervisors hear it on Telegram within
// minutes — and again when it comes back. Before this, the Arabicss log stopped at 9 PM, the Talabat screen at 2 AM and
// the website link failed, and nobody knew. Checked every 2 minutes, during operating hours only.
import { isOperating, iso, businessDay, cairoParts, addDays } from './time.js';
import { parseJson } from './order-match.js';

const CHECK_MS = 2 * 60000;
const clock = ms => new Date(ms).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

function setup(app) {
  const { db } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const num = async k => Number(await setting(k)) || null;

  // Each part: when it last worked, how long silence is normal, which group hears it (null = call center), what to do.
  const parts = async now => {
    const history = (await db.prepare('SELECT MAX(imported_at) t FROM history_reports').get())?.t || null;
    const screens = Object.values(parseJson(await setting('talabat_screens'), {}));
    const liveScreen = screens.map(s => s.at).sort((a, b) => b - a)[0] || null;   // every screen's heartbeat comes from a live tab
    const siteLinked = !!await setting('site_wc');
    // Server errors of this instance in the last 10 minutes (Karim 07-11: the writer's 500s ran for days unheard).
    const errs = (app.recentErrors || []).filter(e => now - Date.parse(e.at) < 10 * 60000);
    // An automatic transfer waiting for the writer more than 5 minutes.
    const waiting = await db.prepare("SELECT MIN(at) t, COUNT(*) n FROM transfer_jobs WHERE state IN ('auto_pending', 'auto_sending')").get();
    const backup = parseJson(await setting('backup_status'), null);
    return [
      { id: 'arabicss', name: 'سحب سجل مكالمات أرابيكس', last: history, after: 20, target: null,
        fix: 'افتح تقارير أرابيكس على جهاز المشرف وسجّل دخول، وراجع «حالة النظام»' },
      { id: 'talabat', name: 'شاشة طلبات الأساسية (سجل الأوردرات)', last: await num('talabat_last_push'), after: 10, target: 'online',
        fix: 'اتأكد إن جهاز شاشة طلبات شغال وفايرفوكس مفتوح على طلبات' },
      { id: 'talabatLive', name: 'شاشات لايف طلبات', last: liveScreen, after: 10, target: 'online',
        fix: 'افتح partner-app.talabat.com/live-orders على فايرفوكس اللي عليه الإضافة' },
      { id: 'writer', name: 'كاتب Apex على جهاز الكاشير', last: await num('apex_writer_seen'), after: 10, target: 'online', only: !!await setting('apex_writer_token_hash'),
        fix: 'اتأكد إن جهاز الكاشير شغال (الكاتب بيشتغل مع مرصد Apex)' },
      { id: 'site', name: 'قراية أوردرات الموقع', last: siteLinked ? await num('site_sync_at') : null, after: 15, target: 'online', only: siteLinked,
        error: await setting('site_error'), fix: 'راجع مفتاح الموقع في «الإدارة» (WooCommerce)' },
      { id: 'monitor', name: 'مرصد Apex على جهاز الكاشير (أوردرات الفروع)', last: await num('orders_last_push'), after: 10, target: 'online', only: !!await setting('orders_token_hash'),
        fix: 'اتأكد إن جهاز الكاشير شغال ومتوصل بالنت' },
      { id: 'errors', name: 'السيرفر', bad: errs.length >= 5, since: errs.length ? Date.parse(errs[errs.length - 1].at) : null, target: 'online',
        text: () => '🛠️ السيرفر بيرجع أخطاء: ' + errs.length + ' خطأ في آخر 10 دقايق\nآخر خطأ: ' + errs[0].path + ' — ' + errs[0].error,
        back: 'السيرفر رجع من غير أخطاء', fix: 'لو الأخطاء مستمرة اطلب نشر آخر نسخة، وأنا هقرا /api/health/errors' },
      { id: 'autoTransfer', name: 'التحويل التلقائي لـ Apex', bad: !!waiting?.t && now - waiting.t > 5 * 60000, since: waiting?.t || null, target: 'online',
        text: () => '🛠️ ' + waiting.n + ' أوردر مستني التحويل التلقائي من ' + clock(waiting.t) + ' (' + Math.round((now - waiting.t) / 60000) + ' دقيقة) والكاتب مخدهمش',
        back: 'التحويل التلقائي رجع يمشي', fix: 'سجّل الأوردرات دي يدوي دلوقتي، واتأكد إن الكاتب شغال على جهاز الكاشير' },
      { id: 'backup', name: 'النسخة الاحتياطية على جهاز الكاشير', always: true, only: !!backup,
        bad: !!backup && (!backup.okAt || now - backup.okAt > 30 * 3600000), since: backup?.okAt || backup?.at || null, target: null,
        text: () => '🛠️ النسخة الاحتياطية الليلية ما اكتملتش' + (backup.okAt ? ' من ' + clock(backup.okAt) + ' (' + Math.round((now - backup.okAt) / 3600000) + ' ساعة)' : '') +
          (backup.error ? '\nالخطأ: ' + backup.error : '') + (backup.freeGb != null ? '\nالمساحة الفاضية على الجهاز: ' + backup.freeGb + ' جيجا' : ''),
        back: 'النسخة الاحتياطية اكتملت', fix: 'سيب جهاز الكاشير شغال بالليل (النسخة بتنزل من 4 لـ 8 الصبح)' },
    ].filter(p => p.only !== false);
  };

  const isBad = (p, now) => 'bad' in p ? !!p.bad : !!p.last && (now - p.last) / 60000 > p.after;

  // تقرير الصبح (Karim 08-11): once a day at 10 AM Cairo, one message: every part, yesterday's transfers, the night copy.
  let morningDay = null;
  async function morning(now, send) {
    const day = businessDay(now);
    if (app.config.systemMorning === false || cairoParts(now).hour < 10 || morningDay === day) return;
    morningDay = day;
    if (await setting('system_morning') === day) return;
    const y = addDays(day, -1), list = await parts(now);
    const lines = list.filter(p => p.id !== 'errors').map(p => isBad(p, now) ? '❌ ' + p.name + (p.last && !p.text ? ' — واقف من ' + clock(p.last) : '')
      : !('bad' in p) && !p.last ? '⚪ ' + p.name + ' — مفيش بيانات لسه' : '✅ ' + p.name);
    const t = await db.prepare("SELECT state, COUNT(*) n FROM transfer_jobs WHERE day = ? GROUP BY state").all(y);
    const c = Object.fromEntries((t?.results || t || []).map(r => [r.state, r.n]));
    if ((c.auto_done || 0) + (c.auto_failed || 0) + (c.entered || 0)) lines.push('📦 تحويلات امبارح: ' + (c.auto_done || 0) + ' تلقائي، ' + (c.entered || 0) + ' يدوي' + (c.auto_failed ? '، ' + c.auto_failed + ' فشلوا' : ''));
    const errs = (app.recentErrors || []).filter(e => now - Date.parse(e.at) < 24 * 3600000).length;
    lines.push(errs ? '⚠️ أخطاء السيرفر آخر 24 ساعة: ' + errs : '✅ مفيش أخطاء سيرفر متسجلة');
    const a = parseJson(await setting('archive_status'), null), b = parseJson(await setting('backup_status'), null);
    if (b?.freeGb != null) lines.push('💾 المساحة الفاضية على جهاز الكاشير: ' + b.freeGb + ' جيجا' + (b.freeGb < 5 ? ' — قليلة' : ''));
    if (a) lines.push(a.error ? '⚠️ الأرشيف: ' + a.error : a.upToDate ? '✅ الأرشيف متحدث' : '⏳ الأرشيف لسه بيكمل (' + a.pages + ' صفحة امبارح)');
    send('system:morning:' + day, '🌅 تقرير السيستم — ' + day + '\n' + lines.join('\n'), null);
    await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('system_morning', day);
  }

  // State per part: down since when (the alert key), so each stop gives one message and one «رجع» reply.
  let lastCheck = 0;
  app.afterRequest(async now => {
    if (now - lastCheck < CHECK_MS) return;
    lastCheck = now;
    const state = parseJson(await setting('system_watch'), {});
    const writes = [];
    const send = (key, text, target, replyTo) => writes.push(db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(key, replyTo ? 'system:resolved' : 'system', null, text, now, replyTo || null, null, target, null));
    for (const p of await parts(now)) {
      const down = state[p.id], bad = isBad(p, now);
      if (!down && bad && (p.always || isOperating(now))) {
        const since = p.text ? p.since : p.last, key = 'system:' + p.id + ':' + since;
        send(key, (p.text ? p.text() : '🛠️ ' + p.name + ' واقف من ' + clock(p.last) + ' (' + Math.round((now - p.last) / 60000) + ' دقيقة)' + (p.error ? '\nالخطأ: ' + p.error : '')) + '\n' + p.fix, p.target);
        state[p.id] = { key, since };
      } else if (down && !bad) {
        send('resolved:' + down.key, '✅ ' + (p.back ? p.back + ' الساعة ' + clock(now) : p.name + ' رجع اشتغل الساعة ' + clock(p.last)), p.target, down.key);
        delete state[p.id];
      }
    }
    await morning(now, send);
    // A shift open 12+ hours (Karim 01-11: علاء 18 ساعة) is a forgotten logout: its hours, breaks and gaps get counted
    // into the next day. One message per session, to the call center group.
    const LONG_MS = 12 * 3600000;
    const long = await db.prepare(`SELECT s.id, s.issued_at, e.name FROM employee_sessions s LEFT JOIN employees e ON e.id = s.employee_id
      WHERE s.revoked_at IS NULL AND s.expires_at > ? AND s.issued_at < ?`).all(now, now - LONG_MS);
    for (const x of long?.results || long || []) {
      const key = 'system:longSession:' + x.id;
      if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get(key)) continue;
      send(key, '⏱️ ' + (x.name || 'موظف') + ' فاتح الشيفت من ' + clock(x.issued_at) + ' (' + Math.round((now - x.issued_at) / 3600000) + ' ساعة) — غالبًا نسي يقفل. اقفل الشيفت من «نهاية الشيفت» في الإدارة.', null);
    }
    if (writes.length) {
      writes.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('system_watch', JSON.stringify(state)));
      await db.batch(writes);
    }
  });

  // For admin: every part, working or not.
  app.route('GET', '/api/system/watch', async ctx => {
    await app.requireAdmin(ctx);
    const state = parseJson(await setting('system_watch'), {});
    return { parts: (await parts(ctx.now)).map(p => ({ id: p.id, name: p.name, last: iso(p.last), minutes: p.last ? Math.round((ctx.now - p.last) / 60000) : null, ok: 'bad' in p ? !p.bad : !!p.last && (ctx.now - p.last) / 60000 <= p.after, down: !!state[p.id], error: p.error || null, fix: p.fix })) };
  });
}

export { setup };
