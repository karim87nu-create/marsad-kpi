// مراقبة السيستم نفسه (Karim 01-11): when a part of the monitoring stops, the supervisors hear it on Telegram within
// minutes — and again when it comes back. Before this, the Arabicss log stopped at 9 PM, the Talabat screen at 2 AM and
// the website link failed, and nobody knew. Checked every 2 minutes, during operating hours only.
import { isOperating, iso } from './time.js';
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
    ].filter(p => p.only !== false);
  };

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
      const silentMin = p.last ? (now - p.last) / 60000 : Infinity;
      const down = state[p.id];
      if (!down && isOperating(now) && silentMin > p.after && p.last) {
        const key = 'system:' + p.id + ':' + p.last;
        send(key, '🛠️ ' + p.name + ' واقف من ' + clock(p.last) + ' (' + Math.round(silentMin) + ' دقيقة)' + (p.error ? '\nالخطأ: ' + p.error : '') + '\n' + p.fix, p.target);
        state[p.id] = { key, since: p.last };
      } else if (down && silentMin <= p.after) {
        send('resolved:' + down.key, '✅ ' + p.name + ' رجع اشتغل الساعة ' + clock(p.last), p.target, down.key);
        delete state[p.id];
      }
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
    return { parts: (await parts(ctx.now)).map(p => ({ id: p.id, name: p.name, last: iso(p.last), minutes: p.last ? Math.round((ctx.now - p.last) / 60000) : null, ok: !!p.last && (ctx.now - p.last) / 60000 <= p.after, down: !!state[p.id], error: p.error || null, fix: p.fix })) };
  });
}

export { setup };
