// Telegram alerts for supervisors: one bot, one group. The server checks every 15 seconds and sends
// each alert once. Rules can be switched on and off from the admin page.
import { businessDay, dayWindow, iso, RULES } from './time.js';
import { outKind } from './attendance-rules.js';
import * as A from './arabicss.js';
import { sha256Bytes, randomBytes, b64, fromB64 } from './security.js';

const TICK_MS = 5000, WAIT_ALERT_S = 7, LATE_ANSWER_S = 7;   // a customer answered after more than 7 s also gets the team's state while they waited

const RULE_LIST = {
  waitSla: 'عميل عدّى 7 ثواني انتظار',
  queueNobody: 'عملاء منتظرين ومفيش حد متاح',
  missed: 'مكالمة فائتة — ومين كان متاح وقتها',
  longCall: 'مكالمة عدّت 4 دقايق',
  breakStart: 'بداية بريك',
  breakWarn: 'باقي دقيقة على نهاية البريك',
  breakOver: 'بريك عدّى المدة المسموحة',
  breakBudget: 'موظف خلّص الـ 30 دقيقة بريك بتوع اليوم',
  breakOverlap: 'أكتر من موظف في بريك وفيه عملاء منتظرين',
  breakRequest: 'طلب بريك إضافي مستني موافقة',
  notBound: 'سجّل الباسورد ومدخلش التحويلة من دقيقتين',
  logout: 'خروج موظف: من التحويلة / من أرابيكس / قفل المتصفح (مع ملخص يومه)',
  gap: 'انقطاع رصد أكتر من 3 دقايق أثناء الشيفت',
  source: 'وقف أو رجوع قراءة الانتظار المباشر',
  ordersLate: 'الأوردرات: أوردر ماخرجش من الفرع بعد 30 / 45 دقيقة',
  ordersCancel: 'الأوردرات: إلغاء أوردر',
  ordersDiscount: 'الأوردرات: خصم كبير على أوردر',
  ordersEntry: 'الأوردرات: خطأ إدخال محتمل أو أوردر متكرر',
  ordersEntryLate: 'الأوردرات: تأخير ضرب الأوردر',
  ordersStale: 'الأوردرات: مرصد الأوردرات واقف أو رجع',
  siteTransfer: 'الأوردرات: أوردر موقع ماتحوّلش للفرع بعد 5 دقايق',
  sitePrep: 'الأوردرات: أوردر موقع لسه بيتجهز بعد 30 دقيقة من التحويل',
};
const RECOVERY_LABELS = { breakStart: 'رجع من البريك', breakOver: 'رجع من البريك', longCall: 'خلّص المكالمة الطويلة', gap: 'رجع الرصد', breakRequest: 'الرد على طلب البريك', queueNobody: 'انتهى الانتظار', logout: 'رجع للشغل',
  waitSla: 'العميل خرج من الانتظار: اترد عليه أو لا', waitConfirm: 'تأكيد سجل أرابيكس', source: 'رجعت قراءة الانتظار', notBound: 'دخل التحويلة' };
const OUT_TEXT = { arabicss: 'خرج من أرابيكس', extension: 'سجّل خروج من التحويلة', browser: 'قفل المتصفح أو صفحة أرابيكس' };
const mask = phone => { const d = String(phone || '').replace(/\D/g, ''); return d.length > 4 ? '••••' + d.slice(-4) : d || 'رقم غير ظاهر'; };
const DEFAULT_RULES = Object.fromEntries(Object.keys(RULE_LIST).map(k => [k, true]));
const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ' د' + (s % 60 ? ' ' + (s % 60) + ' ث' : ''); };
const clock = ms => new Date(ms).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

function setup(app) {
  const { db, fail } = app;
  const API = (app.config.telegramApi || 'https://api.telegram.org').replace(/\/$/, '');

  // The bot token is stored encrypted (AES-256-GCM) with the server secret: "iv.ciphertext+tag" in base64.
  let key = null;
  const aes = () => key ??= crypto.subtle.importKey('raw', sha256Bytes('telegram:' + app.config.secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const seal = async text => { const iv = randomBytes(12); return b64(iv) + '.' + b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), new TextEncoder().encode(text)))); };
  const open = async sealed => { try { const [iv, data] = sealed.split('.').map(fromB64); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aes(), data)); } catch { return null; } };
  const config = async () => {
    const c = await db.prepare('SELECT * FROM telegram_config WHERE id = 1').get();
    const online = Object.fromEntries((await db.prepare("SELECT key, value FROM settings WHERE key IN ('telegram_online_chat_id','telegram_online_chat_title')").all()).map(r => [r.key.replace('telegram_', ''), r.value]));
    return c ? { ...c, ...online, token: c.bot_token ? await open(c.bot_token) : null, rules: { ...DEFAULT_RULES, ...JSON.parse(c.rules || '{}') } } : { token: null, rules: DEFAULT_RULES, enabled: 0 };
  };
  const save = fields => {
    const keys = Object.keys(fields);
    return db.batch([
      db.prepare('INSERT OR IGNORE INTO telegram_config (id, rules) VALUES (1, ?)').bind(JSON.stringify(DEFAULT_RULES)),
      db.prepare('UPDATE telegram_config SET ' + keys.map(k => k + ' = ?').join(', ') + ', updated_at = ? WHERE id = 1').bind(...keys.map(k => fields[k]), app.now()),
    ]);
  };
  async function call(method, body, token) {
    token ??= (await config()).token;
    if (!token) fail(400, 'اربط البوت الأول');
    const r = await fetch(API + '/bot' + token + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) { const e = Error(d.description || 'تليجرام رفض الطلب'); e.status = r.status; throw e; }
    return d.result;
  }

  // ---------- admin ----------
  app.route('GET', '/api/telegram', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const c = await config();
    if (ctx.query.log === '1') {
      const w = dayWindow(ctx.query.date || businessDay(ctx.now));
      return { log: (await db.prepare('SELECT * FROM telegram_log WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 500').all(w.start, w.end))
        .map(r => ({ kind: r.kind, group: r.target === 'branches' ? 'الفروع' : r.target === 'online' || r.kind.startsWith('orders') && !['ordersLate','ordersLate:resolved'].includes(r.kind) ? 'الأونلاين وضرب الأوردر' : 'المكالمات', label: RULE_LIST[r.kind] || RECOVERY_LABELS[r.kind.replace(':resolved', '')] || r.kind, text: r.text, createdAt: iso(r.created_at), sentAt: iso(r.sent_at), error: r.sent_at ? null : r.error })) };
    }
    return { configured: !!c.token, botName: c.bot_name || null, chat: c.chat_id ? { id: c.chat_id, title: c.chat_title } : null,
      onlineChat: c.online_chat_id ? { id: c.online_chat_id, title: c.online_chat_title } : null,
      branchChat: c.branch_chat_id ? { id: c.branch_chat_id, title: c.branch_chat_title } : null, enabled: !!c.enabled,
      rules: Object.entries(RULE_LIST).map(([key, label]) => ({ key, label, on: !!c.rules[key] })) };
  });
  app.route('POST', '/api/telegram', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin'), b = ctx.body;
    if (b.action === 'token') {
      const token = String(b.token || '').trim();
      if (!/^\d+:[\w-]{30,}$/.test(token)) fail(400, 'شكل التوكن مش صحيح؛ انسخه من BotFather');
      let me; try { me = await call('getMe', {}, token); } catch (e) { fail(400, 'تليجرام رفض التوكن: ' + e.message); }
      await save({ bot_token: await seal(token), bot_name: me.username || me.first_name || '', chat_id: null, chat_title: null, enabled: 0 });
      await app.audit('telegram_bot_linked', null, { actor: who.name, bot: me.username });
      return { ok: true, botName: me.username };
    }
    if (b.action === 'discover') {
      // Chats the bot has seen: add the bot to the group and send any message there first.
      let updates; try { updates = await call('getUpdates', { allowed_updates: ['message', 'my_chat_member'] }); } catch (e) { fail(400, e.message); }
      const chats = new Map();
      for (const u of updates) { const c = u.message?.chat || u.my_chat_member?.chat; if (c && c.type !== 'private') chats.set(String(c.id), { id: String(c.id), title: c.title || c.username || String(c.id), type: c.type }); }
      return { chats: [...chats.values()] };
    }
    if (b.action === 'chat') {
      const chatId = String(b.chatId || '');
      if (!/^-?\d+$/.test(chatId)) fail(400, 'اختار الجروب');
      const branches = b.target === 'branches', online = b.target === 'online';
      try { await call('sendMessage', { chat_id: chatId, text: branches ? '✅ مرصد الدهان اتربط بالجروب ده كجروب إدارات الفروع: تأخير خروج الأوردرات ومشاكل الفروع هتوصل هنا.' : online ? '✅ مرصد الدهان اتربط بالجروب ده: جروب الأونلاين وضرب الأوردرات وأخطائها وتأخيرها وتغيّر حالتها.' : '✅ مرصد الدهان اتربط بالجروب ده: جروب المكالمات والموظفين وتغيّر حالة التنبيهات.' }); } catch (e) { fail(400, 'مقدرتش أبعت للجروب: ' + e.message); }
      if (branches) await save({ branch_chat_id: chatId, branch_chat_title: String(b.title || '').slice(0, 100) });
      else if (online) {
        await db.batch([['telegram_online_chat_id', chatId], ['telegram_online_chat_title', String(b.title || '').slice(0,100)]].map(([k,v]) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,v)));
      } else await save({ chat_id: chatId, chat_title: String(b.title || '').slice(0, 100), enabled: 1 });
      await app.audit('telegram_group_linked', null, { actor: who.name, chat: b.title });
      return { ok: true };
    }
    if (b.action === 'settings') {
      const rules = Object.fromEntries(Object.keys(RULE_LIST).map(k => [k, !!b.rules?.[k]]));
      await save({ enabled: b.enabled ? 1 : 0, rules: JSON.stringify(rules) });
      await app.audit('telegram_settings', null, { actor: who.name, enabled: !!b.enabled, rules });
      return { ok: true };
    }
    if (b.action === 'test') {
      const c = await config(), chat = b.target === 'branches' ? c.branch_chat_id : b.target === 'online' ? c.online_chat_id : c.chat_id;
      if (!chat) fail(400, 'اربط الجروب الأول');
      await call('sendMessage', { chat_id: chat, text: '🔔 رسالة تجربة من مرصد الدهان — ' + clock(ctx.now) }); return { ok: true };
    }
    if (b.action === 'unlinkOnline') { await db.prepare("DELETE FROM settings WHERE key IN ('telegram_online_chat_id','telegram_online_chat_title')").run(); return { ok: true }; }
    if (b.action === 'unlinkBranches') { await save({ branch_chat_id: null, branch_chat_title: null }); return { ok: true }; }
    fail(400, 'invalid_action');
  });

  // ---------- alerts ----------
  // When customers started waiting with nobody available (kept in settings: requests may run on different instances).
  const queueSince = {
    get: async () => Number((await db.prepare("SELECT value FROM settings WHERE key = 'telegram_queue_since'").get())?.value) || null,
    set: v => db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_queue_since', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(v ?? '')),
  };
  async function collect(c, now) {
    const on = k => c.rules[k], alerts = [];
    // replyTo: the alert this message follows up (sent as a Telegram reply to it). silent: logged, never sent.
    const add = (key, kind, employeeId, text, { replyTo = null, silent = false } = {}) => alerts.push({ key, kind, employeeId, text, replyTo, silent });
    const live = await app.live(now), people = new Map(live.map(p => [p.employeeId, p]));
    const all = new Map((await db.prepare('SELECT id, name FROM employees').all()).map(e => [e.id, e.name]));
    const name = id => people.get(id)?.name || all.get(id) || 'موظف';
    const since = p => p.since ? (now - Date.parse(p.since)) / 1000 : 0;
    const extraOf = e => { try { return JSON.parse(e?.extra || '{}'); } catch { return {}; } };
    // What one break was allowed: the permission it started with, or 15 minutes for a break taken without one.
    const breakAllowance = e => extraOf(e).breakAllowedSeconds || RULES.breakPeriodSeconds;   // the permission's allowance already includes the grace
    const breakKind = e => { const x = extraOf(e); return e?.event_type === 'break_observed' ? 'من غير طلب من المرصد' : x.breakPolicyKind === 'approved' ? 'البريك الإضافي (' + (x.breakRequestedMinutes || 15) + ' د)' : 'بريك عادي'; };
    const latestBreakStart = (employeeId, before) => db.prepare("SELECT * FROM events WHERE employee_id = ? AND event_type IN ('break_start','break_observed') AND occurred_at <= ? ORDER BY occurred_at DESC LIMIT 1").get(employeeId, before);
    const statusLabel = { ready: 'متاح', on_call: 'في مكالمة', break: 'بريك', logged_in: 'سجّل دخول', logged_out: 'خرج', offline: 'خرج' };
    // The live queue (fresh within 30 s) and the team's state now: added under every new alert, as the old alerts were.
    const snap = await app.latestLive(), snapFresh = !!snap && now - snap.observed_at < 30000;
    const queueRows = snapFresh ? JSON.parse(snap.rows).filter(r => /^(on wait|waiting)$/i.test(String(r[10]).trim())) : [];
    const waitOf = r => { const v = A.parseDuration(r[8]); return v == null ? null : v + Math.max(0, (now - snap.observed_at) / 1000); };
    const inState = st => live.filter(p => p.state === st);
    const names = (list, n = 4) => list.slice(0, n).map(p => p.name).join('، ') + (list.length > n ? ' +' + (list.length - n) : '');
    const footer = () => '\n\n⏳ منتظرين: ' + (snapFresh ? queueRows.length : 'قراءة الانتظار مش متاحة')
      + '\n👥 متاح ' + inState('ready').length + ' · مكالمة ' + inState('on_call').length + ' · بريك ' + inState('break').length + ' · انقطاع رصد ' + (inState('unknown').length + inState('disconnected').length)
      + (inState('ready').length ? '\n🟢 المتاحين: ' + names(inState('ready')) : '');
    const add0 = add;
    // Same caller: the last 9 digits (the queue and the console may write the number with or without the leading 0 / country code).
    const digits = v => String(v || '').replace(/\D/g, '');
    const samePhone = (a, b) => { a = digits(a).slice(-9); b = digits(b).slice(-9); return a.length >= 6 && a === b; };
    const isWaiting = r => /^(on wait|waiting)$/i.test(String(r[10]).trim()), isTalking = r => /^live call$/i.test(String(r[10]).trim());
    const extOf = v => (String(v || '').match(/(\d{2,6})(?!.*\d)/) || [])[1] || '';
    // Who worked on an extension at a moment (the session bound to it).
    const onExtension = async (ext, at) => ext ? db.prepare('SELECT employee_id FROM employee_sessions WHERE extension = ? AND issued_at <= ? AND (revoked_at IS NULL OR revoked_at >= ?) ORDER BY issued_at DESC LIMIT 1').get(ext, at, at) : null;
    // When a waiting caller entered the queue: kept in the alert key (ms), or the minute for alerts sent before this change.
    const entryOf = key => { const v = Number(key.split(':')[2]); return v > 1e11 ? v : v * 60000; };
    const gone = {
      get: async k => Number((await db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_gone:' + k))?.value) || null,
      set: (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('tg_gone:' + k, String(v)),
    };
    // How the team stood while one customer waited: who was available during the wait, and everyone's state when they came in.
    const STATE_AR = { ready: 'متاح', on_call: 'في مكالمة', break: 'بريك', unknown: 'انقطاع رصد', disconnected: 'انقطع', out_extension: 'برّه التحويلة', out_arabicss: 'برّه أرابيكس', out_browser: 'قافل المتصفح', logged_in: 'لسه مدخلش التحويلة', not_started: 'لسه مبدأش' };
    async function teamDuring(entry, exit) {
      const list = await app.waitContext(entry, Math.max(exit, entry + 1000), now).catch(() => null);
      if (!list) return '';
      const at = st => list.filter(e => e.atEntry === st), ready = list.filter(e => e.readyDuringWait);
      const who = (l, n = 6) => l.slice(0, n).map(e => e.name + (e.extension ? ' (' + e.extension + ')' : '')).join('، ') + (l.length > n ? ' +' + (l.length - n) : '');
      const out = list.filter(e => !['ready', 'on_call', 'break'].includes(e.atEntry));
      return '\n\n📊 حالة التشغيل وقت انتظاره (' + clock(entry) + ' ← ' + clock(exit) + '):'
        + '\n' + (ready.length ? '🟢 كانوا متاحين أثناء انتظاره: ' + who(ready) : '⚪ مكانش فيه حد متاح طول انتظاره حسب الرصد')
        + '\n👥 وقت دخوله: متاح ' + at('ready').length + ' · في مكالمة ' + at('on_call').length + ' · بريك ' + at('break').length + ' · مش شغالين ' + out.length
        + (at('on_call').length ? '\n📞 في مكالمة: ' + who(at('on_call')) : '')
        + (at('break').length ? '\n☕ في بريك: ' + who(at('break')) : '')
        + (out.length ? '\n⚠️ مش شغالين: ' + out.slice(0, 6).map(e => e.name + ' (' + (STATE_AR[e.atEntry] || e.atEntry) + ')').join('، ') + (out.length > 6 ? ' +' + (out.length - 6) : '') : '');
    }
    // The last time the caller was seen waiting in the stored live snapshots, and the wait shown then.
    async function lastSeenWaiting(phone, from) {
      for (const sn of await db.prepare('SELECT observed_at, rows FROM live_snapshots WHERE observed_at >= ? ORDER BY observed_at DESC LIMIT 200').all(from)) {
        let rows; try { rows = JSON.parse(sn.rows); } catch { continue; }
        const r = rows.find(x => isWaiting(x) && samePhone(x[9], phone));
        if (r) return { at: sn.observed_at, wait: A.parseDuration(r[8]) };
      }
      return null;
    }
    const addNew = (key, kind, employeeId, text, opts) => add0(key, kind, employeeId, text + footer(), opts);

    // ---- follow-ups: each problem we alerted about gets one reply when it is over ----
    // Only notifications actually sent are followed up; unknown/stale observations never prove a problem ended.
    const unresolved = await db.prepare(`SELECT l.* FROM telegram_log l WHERE (l.sent_at IS NOT NULL OR l.kind = 'gap') AND l.kind IN ('breakStart','breakOver','longCall','gap','breakRequest','queueNobody','logout','waitSla','source','notBound')
      AND NOT EXISTS (SELECT 1 FROM telegram_log r WHERE r.key = 'resolved:' || l.key) ORDER BY l.id LIMIT 500`).all();
    const closedGaps = new Set();
    const closedBreaks = new Set();   // employee:breakStartTime already followed up in this check
    for (const old of unresolved) {
      let text = null, silent = false;
      const person = people.get(old.employee_id), current = person?.state;
      if (old.kind === 'breakStart' || old.kind === 'breakOver') {
        const start = old.kind === 'breakStart' ? await db.prepare('SELECT * FROM events WHERE id = ?').get(Number(old.key.slice(6))) : await latestBreakStart(old.employee_id, old.created_at);
        const from = start?.occurred_at ?? old.created_at;
        const ended = await db.prepare("SELECT * FROM events WHERE employee_id = ? AND event_type IN ('break_end','break_end_unknown') AND occurred_at >= ? ORDER BY occurred_at LIMIT 1").get(old.employee_id, from);
        const back = !ended && ['ready', 'on_call'].includes(current) && person.since && Date.parse(person.since) > from ? Date.parse(person.since) : null;
        if (ended || back) {
          const at = ended ? ended.occurred_at : back, length = ended?.duration_seconds || Math.round((at - from) / 1000), allowed = breakAllowance(start), over = length - allowed;
          const tag = old.employee_id + ':' + from;
          // The break-start alert and the over-time alert of the same break are closed by one message.
          silent = closedBreaks.has(tag); closedBreaks.add(tag);
          text = '✅ ' + name(old.employee_id) + ' رجع من البريك — ' + clock(at) + '\nمدة البريك ' + fmt(length) + ' من ' + fmt(allowed) + ' مسموحة' + (over > 59 ? ' · زيادة ' + fmt(over) : '');
        }
      } else if (old.kind === 'longCall') {
        const ended = await db.prepare("SELECT * FROM events WHERE employee_id = ? AND event_type = 'agentunlinked' AND occurred_at >= ? ORDER BY occurred_at LIMIT 1").get(old.employee_id, old.created_at);
        if (ended) text = '✅ ' + name(old.employee_id) + ' خلّص المكالمة — مدتها ' + fmt(ended.duration_seconds || 0) + ' — ' + clock(ended.occurred_at);
        else if (['ready', 'break'].includes(current) && person.since && Date.parse(person.since) > old.created_at) text = '✅ ' + name(old.employee_id) + ' خلّص المكالمة — حالته دلوقتي ' + statusLabel[current];
      } else if (old.kind === 'gap') {
        const from = Date.parse(old.key.split(':').slice(2).join(':'));
        // Transport checks or a moving live-window timestamp do not prove recovery.
        if (['ready', 'on_call', 'break'].includes(current) && person.lastEvidence &&
            Date.parse(person.lastEvidence) >= old.created_at && Date.parse(person.lastEvidence) <= now && now - Date.parse(person.lastEvidence) < RULES.presenceStaleMs) {
          silent = !old.message_id || !!old.error || closedGaps.has(old.employee_id);
          if (!silent) closedGaps.add(old.employee_id);
          text = '✅ ' + name(old.employee_id) + ' رجع الرصد — ' + clock(now) + (Number.isFinite(from) ? ' — الانقطاع استمر ' + fmt((now - from) / 1000) : '') + ' — حالته دلوقتي ' + statusLabel[current];
        }
      } else if (old.kind === 'breakRequest') {
        const req = await db.prepare('SELECT * FROM break_requests WHERE id = ?').get(old.key.slice(4));
        if (req && req.status !== 'pending') {
          const by = req.decided_by ? ' — بواسطة ' + req.decided_by : '';
          text = { approved: '✅ اتوافق على البريك الإضافي لـ ' + name(old.employee_id) + ' (' + req.requested_minutes + ' د)' + by, starting: '✅ اتوافق على البريك الإضافي لـ ' + name(old.employee_id) + by,
            completed: '✅ اتوافق على البريك الإضافي لـ ' + name(old.employee_id) + by, rejected: '❌ اترفض طلب البريك الإضافي لـ ' + name(old.employee_id) + by,
            expired: '⌛ طلب البريك الإضافي لـ ' + name(old.employee_id) + ' انتهت صلاحيته من غير رد', cancelled: '↩️ طلب البريك الإضافي لـ ' + name(old.employee_id) + ' اتلغى' }[req.status] || null;
        }
      } else if (old.kind === 'queueNobody') {
        const snap = await app.latestLive();
        if (snap && now - snap.observed_at < 30000) {
          const waiting = JSON.parse(snap.rows).filter(r => /^(on wait|waiting)$/i.test(String(r[10]).trim())).length;
          const available = live.filter(p => p.state === 'ready').length;
          const lasted = ' — الوقت من غير حد متاح ' + fmt((now - Number(old.key.split(':')[1]) * 1000) / 1000);
          if (!waiting || available) text = (!waiting ? '✅ مفيش عملاء منتظرين دلوقتي' : '✅ بقى فيه ' + available + ' موظف متاح — المنتظرين ' + waiting) + lasted;
        }
      } else if (old.kind === 'waitSla') {
        // One reply that says how it ended: answered (after how long, by whom) or left without an answer.
        const phone = old.key.split(':')[1], entry = entryOf(old.key);
        const stillWaiting = snapFresh && queueRows.some(r => samePhone(r[9], phone));
        const linked = await db.prepare("SELECT * FROM events WHERE event_type IN ('agentlinked','call_observed') AND occurred_at >= ? AND occurred_at <= ? AND phone IS NOT NULL AND phone != '' ORDER BY occurred_at").all(entry - 5000, now)
          .then(list => list.find(e => samePhone(e.phone, phone)));
        if (linked) {
          const waited = Math.max(0, Math.round((linked.occurred_at - entry) / 1000));
          text = '✅ العميل ' + mask(phone) + ' اترد عليه بعد ' + fmt(waited) + ' انتظار — رد عليه ' + name(linked.employee_id) + ' (تحويلة ' + linked.extension + ') — ' + clock(linked.occurred_at)
            + (waited > LATE_ANSWER_S ? await teamDuring(entry, linked.occurred_at) : '');
        } else if (snapFresh && !stillWaiting) {
          const talking = JSON.parse(snap.rows).find(r => isTalking(r) && samePhone(r[9], phone));
          let first = await gone.get(old.key);
          if (!first) { first = now; await gone.set(old.key, now); }
          if (talking) {
            // Answered in Arabicss by someone the monitor has no event for (not signed in, or the event is late).
            const ext = extOf(talking[2]), emp = await onExtension(ext, now), seen = await lastSeenWaiting(phone, entry);
            const waited = seen ? Math.round((seen.at - entry) / 1000 + (first - seen.at) / 2000) : Math.round((first - entry) / 1000);
            text = '✅ العميل ' + mask(phone) + ' اترد عليه بعد حوالي ' + fmt(waited) + ' انتظار — ' + (emp ? 'رد عليه ' + name(emp.employee_id) + ' (تحويلة ' + ext + ')' : ext ? 'رد عليه تحويلة ' + ext + ' (مش مسجلة في المرصد وقتها)' : 'اللي رد مش ظاهر في المرصد') + ' — ' + clock(first)
              + (waited > LATE_ANSWER_S ? await teamDuring(entry, entry + waited * 1000) : '');
          } else if (now - first >= 20000) {
            // Gone from the queue, no one picked it up for 20 s: most likely the caller hung up.
            const seen = await lastSeenWaiting(phone, entry);
            const waited = seen ? Math.round((seen.at - entry) / 1000) : Math.round((first - entry) / 1000);
            const left = seen ? seen.at : first;
            text = '🔴 العميل ' + mask(phone) + ' خرج من الانتظار من غير ما حد يرد عليه — انتظر حوالي ' + fmt(waited) + ' وخرج ' + clock(left)
              + '\nمحدش من المسجلين في المرصد استلم المكالمة، ومش ظاهرة كمكالمة شغالة في أرابيكس، فغالبًا قفل الخط.'
              + '\nهتتأكد من سجل أرابيكس: لو اتسجلت فائتة هتوصل «مكالمة فائتة» ردًا على الرسالة دي.'
              + await teamDuring(entry, left);
          }
        }
        if (text) await db.prepare('DELETE FROM settings WHERE key = ?').run('tg_gone:' + old.key);
      } else if (old.kind === 'source') {
        if (snapFresh) text = '✅ رجعت قراءة الانتظار المباشر — ' + clock(snap.observed_at);
      } else if (old.kind === 'notBound') {
        if (['ready', 'on_call', 'break'].includes(current)) text = '✅ ' + name(old.employee_id) + ' دخل التحويلة ' + (person.extension || '');
      } else if (old.kind === 'logout') {
        const returned = await db.prepare('SELECT * FROM employee_sessions WHERE employee_id = ? AND work_started_at >= ? AND id != ? ORDER BY work_started_at LIMIT 1').get(old.employee_id, old.created_at, old.key.slice(4));
        if (returned) text = '↩️ ' + name(old.employee_id) + ' رجع للشغل — تحويلة ' + returned.extension + ' — ' + clock(returned.work_started_at);
      }
      if (text) add('resolved:' + old.key, old.kind + ':resolved', old.employee_id, text, { replyTo: old.key, silent });
    }

    // ---- new alerts ----
    // Breaks that started in the last 10 minutes.
    if (on('breakStart')) for (const e of await db.prepare("SELECT * FROM events WHERE event_type IN ('break_start','break_observed') AND occurred_at > ? ORDER BY occurred_at").all(now - 600000)) {
      if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('break:' + e.id)) continue;
      const x = extraOf(e), allowed = breakAllowance(e);
      let detail;
      if (e.event_type === 'break_observed') detail = '⚠️ دخل بريك في أرابيكس من غير ما يطلبه من المرصد — محسوب 15 د على الأقل';
      else if (x.breakPolicyKind === 'approved') detail = 'البريك الإضافي اللي اتوافق عليه — مسموح ' + fmt(allowed);
      else {
        const p = await app.breakPolicy(e.employee_id, now);
        const before = Math.max(0, p.usedSeconds - Math.max(0, (now - e.occurred_at) / 1000));   // regular break time used before this one
        detail = 'البريك العادي رقم ' + Math.min(Math.max(p.startsUsed, 1), 2) + ' من 2 — مسموح ' + fmt(allowed) + (before >= 30 ? ' · استخدم قبله ' + fmt(before) + ' من 30 د' : '');
      }
      addNew('break:' + e.id, 'breakStart', e.employee_id, '☕ ' + name(e.employee_id) + ' بدأ بريك — ' + clock(e.occurred_at) + ' — تحويلة ' + e.extension + '\n' + detail);
    }
    for (const p of live) {
      if (p.state === 'break' && on('breakOver')) {
        const start = await latestBreakStart(p.employeeId, now), allowed = breakAllowance(start);
        if (since(p) > allowed) addNew('over:' + p.employeeId + ':' + p.since, 'breakOver', p.employeeId, '⏰ ' + p.name + ' عدّى وقت البريك — بقاله ' + fmt(since(p)) + ' والمسموح ' + fmt(allowed) + ' (' + breakKind(start) + ') — تحويلة ' + p.extension,
          { replyTo: start ? 'break:' + start.id : null });
      }
      if (p.state === 'on_call' && on('longCall') && since(p) > RULES.callAlertSeconds)
        addNew('call:' + p.employeeId + ':' + (p.callId || p.since), 'longCall', p.employeeId, '📞 مكالمة طويلة: ' + p.name + ' بقاله ' + fmt(since(p)) + (p.phone ? ' مع ' + p.phone : '') + ' — تحويلة ' + p.extension);
      // One outstanding incident per employee, independent of the sliding p.since value.
      const activeGap = p.state === 'unknown' && on('gap') && since(p) > 180 && await db.prepare("SELECT 1 FROM telegram_log l WHERE l.kind = 'gap' AND l.employee_id = ? AND NOT EXISTS (SELECT 1 FROM telegram_log r WHERE r.key = 'resolved:' || l.key) LIMIT 1").get(p.employeeId);
      if (p.state === 'unknown' && on('gap') && since(p) > 180 && !activeGap)
        addNew('gap:' + p.employeeId + ':' + p.since, 'gap', p.employeeId, '📡 انقطاع رصد: ' + p.name + ' مفيش إشارة من جهازه من ' + clock(Date.parse(p.since)) + ' (' + fmt(since(p)) + ') — تحويلة ' + p.extension);
    }
    if (on('breakRequest')) for (const r of await db.prepare("SELECT r.*, e.name FROM break_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'pending' AND r.created_at > ?").all(now - 1800000))
      addNew('req:' + r.id, 'breakRequest', r.employee_id, '🙋 ' + r.name + ' طالب بريك إضافي ' + r.requested_minutes + ' دقيقة' + (r.reason ? ' — ' + r.reason : '') + '\nالقبول أو الرفض من صفحة الإدارة');
    if (on('logout')) for (const s of await db.prepare('SELECT * FROM employee_sessions WHERE revoked_at > ? AND work_started_at IS NOT NULL').all(now - 600000)) {
      const kind = outKind(s.revoke_reason);
      if (kind === 'gap' || await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('out:' + s.id)) continue;
      const w = dayWindow(businessDay(s.revoked_at));
      const calls = await db.prepare("SELECT COUNT(*) n, AVG(duration_seconds) a FROM events WHERE employee_id = ? AND event_type = 'agentunlinked' AND occurred_at >= ? AND occurred_at <= ?").get(s.employee_id, w.start, s.revoked_at);
      const p = await app.breakPolicy(s.employee_id, s.revoked_at);
      addNew('out:' + s.id, 'logout', s.employee_id, '🚪 ' + name(s.employee_id) + ' ' + OUT_TEXT[kind] + ' — ' + clock(s.revoked_at) + ' — تحويلة ' + s.extension + '\nلازم يدخل الباسورد تاني عشان يتسجل'
        + '\nمكالماته النهارده: ' + calls.n + (calls.n ? ' · متوسط المكالمة ' + fmt(calls.a) : '') + '\nبريك: ' + p.startsUsed + ' مرة · ' + fmt(p.usedSeconds));
    }
    if (on('queueNobody')) {
      const snap = await app.latestLive(), rows = snap && now - snap.observed_at < 30000 ? JSON.parse(snap.rows) : [];
      const waiting = rows.filter(r => /^(on wait|waiting)$/i.test(String(r[10]).trim())).length, ready = live.filter(p => p.state === 'ready').length;
      let since = await queueSince.get();
      if (waiting && !ready) {
        if (!since) { since = now; await queueSince.set(now); }
        if (now - since >= 20000) addNew('queue:' + Math.floor(since / 1000), 'queueNobody', null, '🚨 ' + waiting + ' عميل منتظر ومفيش موظف متاح — من ' + clock(since));
      } else if (since) await queueSince.set(null);
    }

    // ---- waiting customers (per caller, from the live queue) ----
    const today = businessDay(now), w = dayWindow(today), operatingNow = now >= w.start && now < w.operatingEnd;
    for (const r of queueRows) {
      const wait = waitOf(r), phone = String(r[9] || '').replace(/\D/g, '');
      if (wait == null || !operatingNow) continue;
      const entry = Math.round((now - wait * 1000) / 1000) * 1000;   // when the caller entered (ms): one alert per caller, and the follow-up measures the wait from it
      const ready = inState('ready'), who = ready.length ? '🟢 فيه ' + ready.length + ' متاح حسب الرصد (' + names(ready) + ') — راجع التوزيع على نوع الطلب' : '🔴 مفيش حد متاح حسب الرصد';
      const line = A.queueLabel(r[0]) + ' · ' + mask(phone) + ' · منتظر ' + Math.round(wait) + ' ث';
      const seen = kind => db.prepare("SELECT 1 FROM telegram_log WHERE kind = ? AND key LIKE ? AND created_at > ?").get(kind, kind + ':' + phone + ':%', now - 15 * 60000);
      // Only once the wait passed 7 seconds (no early warning).
      if (wait > WAIT_ALERT_S && on('waitSla') && !await seen('waitSla')) addNew('waitSla:' + phone + ':' + entry, 'waitSla', null, '🔔 عميل عدّى ' + WAIT_ALERT_S + ' ثواني انتظار\n' + line + '\n' + who);
    }
    // ---- several on break while customers wait ----
    if (on('breakOverlap') && queueRows.length && inState('break').length >= 2)
      addNew('overlap:' + Math.floor(now / 600000), 'breakOverlap', null, '🔔 ' + inState('break').length + ' في بريك مع بعض وفيه ' + queueRows.length + ' عميل منتظر\nفي البريك: ' + names(inState('break'), 6));
    for (const p of live) {
      if (p.state === 'break' && (on('breakWarn') || on('breakBudget'))) {
        const start = await latestBreakStart(p.employeeId, now), allowed = breakAllowance(start), left = allowed - since(p);
        if (on('breakWarn') && left > 0 && left <= 60) addNew('breakWarn:' + p.employeeId + ':' + p.since, 'breakWarn', p.employeeId, '🟡 باقي أقل من دقيقة على بريك ' + p.name + ' — بقاله ' + fmt(since(p)) + ' من ' + fmt(allowed), { replyTo: start ? 'break:' + start.id : null });
        if (on('breakBudget') && extraOf(start).breakPolicyKind !== 'approved') {
          const pol = await app.breakPolicy(p.employeeId, now);
          if (pol.usedSeconds >= RULES.breakBudgetSeconds) addNew('budget:' + p.employeeId + ':' + today, 'breakBudget', p.employeeId, '🔔 ' + p.name + ' خلّص الـ 30 دقيقة بريك بتوع النهارده (' + fmt(pol.usedSeconds) + ')\nأي بريك تاني لازم موافقة');
        }
      }
      if (p.state === 'logged_in' && on('notBound') && since(p) > 120)
        addNew('unbound:' + p.employeeId + ':' + p.since, 'notBound', p.employeeId, '🔔 ' + p.name + ' دخل الباسورد من ' + fmt(since(p)) + ' ولسه مدخلش التحويلة — مش محسوب متاح');
    }
    // ---- missed calls (from the Arabicss log, every time it arrives) ----
    if (on('missed')) {
      const h = await app.dayHistory(today, now);
      for (const m of h.missed) {
        const rec = h.records[m.index];
        if (m.classification !== 'counted' || !rec?.startMs || now - rec.startMs > 3 * 3600000) continue;
        const key = 'missed:' + today + ':' + m.start + ':' + String(m.phone || '').replace(/\D/g, '');
        if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get(key)) continue;
        const ctx = await app.missedContext(today, m.index, now).catch(() => null);
        const readyDuring = ctx ? ctx.employees.filter(e => e.readyDuringWait) : [];
        const label = { ready: 'متاح', on_call: 'في مكالمة', break: 'بريك', unknown: 'انقطاع رصد', disconnected: 'انقطع', out_extension: 'برّه التحويلة', out_arabicss: 'برّه أرابيكس', out_browser: 'قافل المتصفح', logged_in: 'لسه مدخلش التحويلة' };
        const atEntry = ctx ? ctx.employees.filter(e => !['not_started', 'shift_ended'].includes(e.atEntry)).map(e => e.name + ' (' + (label[e.atEntry] || e.atEntry) + ')') : [];
        const waitAlert = await db.prepare("SELECT key FROM telegram_log WHERE kind = 'waitSla' AND created_at >= ? AND created_at <= ? ORDER BY id DESC").all(rec.startMs - 120000, rec.startMs + 900000)
          .then(list => list.find(x => samePhone(x.key.split(':')[1], m.phone)));
        addNew(key, 'missed', null, '🔴 مكالمة فائتة — ' + clock(rec.startMs) + '\n' + m.queueLabel + ' · ' + mask(m.phone) + ' · انتظر ' + (m.waitSeconds ?? '؟') + ' ث'
          + '\n' + (readyDuring.length ? '🟢 كانوا متاحين أثناء انتظاره: ' + readyDuring.map(e => e.name).join('، ') : '⚪ مكانش فيه حد متاح أثناء انتظاره حسب الرصد')
          + (atEntry.length ? '\n👥 وقت دخوله الطابور: ' + atEntry.slice(0, 8).join('، ') + (atEntry.length > 8 ? ' +' + (atEntry.length - 8) : '') : ''), { replyTo: waitAlert?.key || null });
      }
      // A waiting caller we said left unanswered, but the Arabicss log shows was answered: say so under the same thread.
      for (const u of await db.prepare("SELECT l.key AS waitKey, r.text AS outcome FROM telegram_log l JOIN telegram_log r ON r.key = 'resolved:' || l.key WHERE l.kind = 'waitSla' AND l.created_at > ? AND r.text LIKE '🔴%'").all(now - 3 * 3600000)) {
        if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('confirm:' + u.waitKey)) continue;
        const phone = u.waitKey.split(':')[1], entry = entryOf(u.waitKey);
        const rec = h.records.find(r => r.startMs && Math.abs(r.startMs - entry) < 180000 && samePhone(r.phone, phone) && /^(success|answered|completed)$/i.test(String(r.status).trim()));
        if (!rec) continue;
        const emp = await onExtension(rec.extension, rec.startMs);
        add('confirm:' + u.waitKey, 'waitConfirm', emp?.employee_id ?? null, '↩️ تصحيح من سجل أرابيكس: العميل ' + mask(phone) + ' اترد عليه' + (rec.extension ? ' من تحويلة ' + rec.extension + (emp ? ' (' + name(emp.employee_id) + ')' : '') : '') + (rec.waitSeconds != null ? ' بعد ' + fmt(rec.waitSeconds) + ' انتظار' : ''), { replyTo: u.waitKey });
      }
    }
    // ---- the live queue reader stopped (during operating hours) ----
    if (on('source') && operatingNow && snap && now - snap.observed_at > 90000)
      addNew('source:' + snap.observed_at, 'source', null, '⚠️ قراءة الانتظار المباشر واقفة من ' + clock(snap.observed_at) + ' (' + fmt((now - snap.observed_at) / 1000) + ')\nافتح تقرير الانتظار في أرابيكس على جهاز المشرف، أو راجع صفحة «حالة النظام»');
    return alerts;
  }

  let busy = false;
  app.telegramTick = async function tick(now = app.now()) {
    if (busy) return 0;
    busy = true;
    let sent = 0;
    try {
      const c = await config();
      if (!c.enabled || !c.token) return 0;
      const alerts = await collect(c, now);
      if (alerts.length) await db.batch(alerts.map(a => {
        const insert = 'INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at) ';
        const values = [a.key, a.kind, a.employeeId, a.text, now, a.replyTo, a.silent ? now : null];
        return a.kind === 'gap'
          ? db.prepare(insert + "SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM telegram_log l WHERE l.kind = 'gap' AND l.employee_id = ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key))").bind(...values, a.employeeId)
          : db.prepare(insert + 'VALUES (?,?,?,?,?,?,?)').bind(...values);
      }));
      for (const r of await db.prepare('SELECT * FROM telegram_log WHERE sent_at IS NULL AND tries < 5 AND created_at > ? ORDER BY id LIMIT 500').all(now - 3600000)) {
        if (sent >= 20) break;
        if (r.kind === 'gap' && await db.prepare("SELECT 1 FROM telegram_log l WHERE l.kind = 'gap' AND l.employee_id = ? AND l.id != ? AND l.message_id IS NOT NULL AND l.sent_at IS NOT NULL AND l.error IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key) LIMIT 1").get(r.employee_id, r.id)) {
          // Historical duplicates already queued by the old collector are silent, too.
          await db.prepare('UPDATE telegram_log SET sent_at = ?, error = NULL WHERE id = ? AND sent_at IS NULL').run(now, r.id);
          continue;
        }
        // A reply stays in the chat which actually received its parent, even after relinking.
        const parent = r.reply_to ? await db.prepare('SELECT * FROM telegram_log WHERE key = ?').get(r.reply_to) : null;
        if (r.reply_to && (!parent?.message_id || parent.error)) continue;
        const delivered = parent ? await db.prepare('SELECT value FROM settings WHERE key = ?').get('telegram_delivery:' + parent.key) : null;
        const target = r.target || (r.kind.startsWith('orders') ? (r.kind.split(':')[0] === 'ordersLate' ? 'branches' : 'online') : null);
        const chat = delivered?.value || (target === 'branches' ? c.branch_chat_id : target === 'online' ? c.online_chat_id : c.chat_id);
        if (!chat) continue; // Never fall back to a different department's group.
        const claim = await db.prepare('UPDATE telegram_log SET sent_at = ?, tries = tries + 1 WHERE id = ? AND sent_at IS NULL').run(app.now(), r.id);
        if (!claim.changes) continue;
        try {
          const m = await call('sendMessage', { chat_id: chat, text: r.text, ...(parent?.message_id ? { reply_parameters: { message_id: parent.message_id, allow_sending_without_reply: true } } : {}) }, c.token);
          await db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('telegram_delivery:' + r.key, String(chat));
          await db.prepare('UPDATE telegram_log SET error = NULL, message_id = ? WHERE id = ?').run(m?.message_id ?? null, r.id); sent++;
        }
        catch (e) { await db.prepare('UPDATE telegram_log SET sent_at = NULL, error = ? WHERE id = ?').run(String(e.message).slice(0, 300), r.id); }
      }
    } finally { busy = false; }
    return sent;
  };

  // Checks run every 15 seconds: on a timer under Node, and after incoming requests on Cloudflare
  // (the connectors report every few seconds during working hours). The settings row makes sure only
  // one instance runs each check.
  let lastLocal = 0;
  app.telegramDue = async now => {
    if (now - lastLocal < TICK_MS) return false;
    lastLocal = now;
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_tick', '0')").run();
    const r = await db.prepare("UPDATE settings SET value = ? WHERE key = 'telegram_tick' AND CAST(value AS INTEGER) <= ?").run(String(now), now - TICK_MS);
    return r.changes > 0;
  };
  if (app.config.telegramTimer === 'requests') app.afterRequest(async now => { if (await app.telegramDue(now)) await app.telegramTick(now); });
  else if (app.config.telegramTimer !== false && typeof setInterval === 'function') { const t = setInterval(() => app.telegramTick().catch(() => {}), TICK_MS); t.unref?.(); }
}

export { setup, RULE_LIST };
