// إغلاق الفروع على طلبات (Karim 01-11): when a branch closes (or turns busy) on Talabat, the call center (not the branch's
// group) hears it at once — with the reason and until when, as Talabat's own page says — and again when it opens, with how long it
// was closed. Every closure is kept for admin's report. Read from the Talabat screen (the page's own data, nothing clicked).
import { businessDay, isOperating, iso, validDate } from './time.js';
import { parseJson } from './order-match.js';

// Talabat outlet → Apex branch name (the branch groups are named after Apex's branches).
const OUTLET_BRANCH = { '760858': 'التجمع', '608556': 'مدينة نصر', '802223': 'مدينتى' };
const STATE_AR = { OPEN: 'مفتوح', CLOSED: 'مقفول', CLOSED_TODAY: 'مقفول النهارده', BUSY: 'مشغول', PAUSED: 'موقوف مؤقتًا', OFFLINE: 'أوفلاين', UNAVAILABLE: 'مش متاح' };
const stateAr = s => STATE_AR[String(s || '').toUpperCase()] || String(s || 'غير معروف');
const clock = ms => new Date(ms).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
const mins = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' دقيقة' : Math.floor(m / 60) + ' ساعة' + (m % 60 ? ' و' + (m % 60) + ' دقيقة' : ''); };
// Whatever Talabat's item says about why and until when (its field names are not fixed).
const pick = (raw, re) => { for (const [k, v] of Object.entries(raw || {})) if (re.test(k) && v && v !== 'null' && v !== 'undefined') return String(v).slice(0, 200); return null; };
const reasonOf = raw => pick(raw, /reason|cause|comment|note/i);
const untilOf = raw => pick(raw, /until|till|reopen|endsAt|end_?time|closedTo|expires/i);
const untilText = v => { if (!v) return null; const t = Date.parse(v); return Number.isFinite(t) ? clock(t) : v; };

function setup(app) {
  const { db } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const log = (key, kind, text, target, branch, replyTo) => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(key, kind, null, text, Date.now(), replyTo || null, null, target, branch || null);

  // Called by the Talabat push with the screen's outlets: [{ outlet, name, state, raw }].
  app.talabatAvailability = async (list, now) => {
    if (!Array.isArray(list) || !list.length) return;
    const cur = parseJson(await setting('talabat_availability'), {}), writes = [];
    for (const x of list.slice(0, 10)) {
      const outlet = String(x?.outlet || '').replace(/\D/g, '').slice(0, 12); if (!outlet) continue;
      const state = String(x.state || '').toUpperCase().slice(0, 30), raw = x.raw && typeof x.raw === 'object' ? x.raw : {};
      const was = cur[outlet], branch = OUTLET_BRANCH[outlet] || null, name = branch || String(x.name || outlet).slice(0, 80);
      const open = state === 'OPEN';
      if (!was || was.state !== state) {
        // Closed (or busy…) now: one message to the branch's group and one to the call center; the closure is recorded.
        if (!open && (!was || was.state === 'OPEN' || was.state == null)) {
          const reason = reasonOf(raw), until = untilText(untilOf(raw)), key = 'talabat:closed:' + outlet + ':' + now;
          const text = '🛵 طلبات | ⛔ فرع ' + name + ' اتقفل على طلبات الساعة ' + clock(now) + '\nالحالة: ' + stateAr(state) + (reason ? '\nالسبب: ' + reason : '\nالسبب: طلبات ماكتبتش سبب') + (until ? '\nلحد: ' + until : '');
          const alert = isOperating(now);
          if (alert) writes.push(log(key, 'talabatClosed', text, 'online', branch));   // Karim 01-11: the call center only, not the branch's group
          writes.push(db.prepare('INSERT INTO talabat_closures (day, outlet, name, branch, state, reason, until_text, raw, started_at, ended_at, alert_key) VALUES (?,?,?,?,?,?,?,?,?,NULL,?)')
            .bind(businessDay(now), outlet, String(x.name || '').slice(0, 120), branch, state, reason, until, JSON.stringify(raw).slice(0, 1500), now, alert ? key : null));
          cur[outlet] = { state, since: now, key: alert ? key : null };
        } else if (open && was && was.state !== 'OPEN') {
          // Open again: the reply under the closing message, with how long it was closed.
          const text = '🛵 طلبات | ✅ فرع ' + name + ' رجع فتح على طلبات الساعة ' + clock(now) + (was.since ? '\nكان مقفول ' + mins(now - was.since) + ' (من ' + clock(was.since) + ')' : '');
          if (was.key) writes.push(log('resolved:' + was.key, 'talabatClosed', text, 'online', branch, was.key));
          writes.push(db.prepare('UPDATE talabat_closures SET ended_at = ? WHERE outlet = ? AND ended_at IS NULL').bind(now, outlet));
          cur[outlet] = { state, since: now, key: null };
        } else {
          // Closed → another closed state (busy → closed…): the record follows; no new message.
          writes.push(db.prepare('UPDATE talabat_closures SET state = ? WHERE outlet = ? AND ended_at IS NULL').bind(state, outlet));
          cur[outlet] = { ...was, state };
        }
      }
    }
    writes.push(db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('talabat_availability', JSON.stringify(cur)));
    await db.batch(writes.filter(Boolean));
  };

  // Admin: the closures of a period, each with its length (still closed: until now).
  app.route('GET', '/api/talabat/closures', async ctx => {
    await app.requireAdmin(ctx);
    const to = validDate(String(ctx.query.to || '')) ? ctx.query.to : businessDay(ctx.now), from = validDate(String(ctx.query.from || '')) ? ctx.query.from : to;
    const rows = await db.prepare('SELECT * FROM talabat_closures WHERE day BETWEEN ? AND ? ORDER BY started_at DESC LIMIT 500').all(from, to);
    const now = parseJson(await setting('talabat_availability'), {});
    return { from, to, now: Object.entries(now).map(([outlet, v]) => ({ outlet, branch: OUTLET_BRANCH[outlet] || outlet, state: v.state, stateAr: stateAr(v.state), since: iso(v.since) })),
      list: rows.map(r => ({ branch: r.branch || r.name || r.outlet, state: r.state, stateAr: stateAr(r.state), reason: r.reason, until: r.until_text, from: iso(r.started_at), to: iso(r.ended_at),
        minutes: Math.round(((r.ended_at || ctx.now) - r.started_at) / 60000), open: !r.ended_at, raw: parseJson(r.raw, {}) })) };
  });
}

export { setup };
