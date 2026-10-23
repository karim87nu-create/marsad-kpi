// Telegram alerts for supervisors: one bot, one group. The server checks every 15 seconds and sends
// each alert once. Rules can be switched on and off from the admin page.
import { businessDay, dayWindow, iso, RULES } from './time.js';
import { KNOWN_CLOSE } from './attendance-rules.js';
import { sha256Bytes, randomBytes, b64, fromB64 } from './security.js';

const TICK_MS = 15000;

const RULE_LIST = {
  breakStart: 'بداية بريك',
  breakOver: 'بريك عدّى المدة المسموحة',
  breakRequest: 'طلب بريك إضافي مستني موافقة',
  longCall: 'مكالمة عدّت 4 دقايق',
  logout: 'خروج موظف (مع ملخص يومه)',
  gap: 'انقطاع رصد أكتر من 3 دقايق أثناء الشيفت',
  queueNobody: 'عملاء منتظرين ومفيش حد متاح',
};
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
    return c ? { ...c, token: c.bot_token ? await open(c.bot_token) : null, rules: { ...DEFAULT_RULES, ...JSON.parse(c.rules || '{}') } } : { token: null, rules: DEFAULT_RULES, enabled: 0 };
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
        .map(r => ({ kind: r.kind, label: RULE_LIST[r.kind] || r.kind, text: r.text, createdAt: iso(r.created_at), sentAt: iso(r.sent_at), error: r.sent_at ? null : r.error })) };
    }
    return { configured: !!c.token, botName: c.bot_name || null, chat: c.chat_id ? { id: c.chat_id, title: c.chat_title } : null, enabled: !!c.enabled,
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
      try { await call('sendMessage', { chat_id: chatId, text: '✅ مرصد الأداء اتربط بالجروب ده. التنبيهات هتوصل هنا.' }); } catch (e) { fail(400, 'مقدرتش أبعت للجروب: ' + e.message); }
      await save({ chat_id: chatId, chat_title: String(b.title || '').slice(0, 100), enabled: 1 });
      await app.audit('telegram_group_linked', null, { actor: who.name, chat: b.title });
      return { ok: true };
    }
    if (b.action === 'settings') {
      const rules = Object.fromEntries(Object.keys(RULE_LIST).map(k => [k, !!b.rules?.[k]]));
      await save({ enabled: b.enabled ? 1 : 0, rules: JSON.stringify(rules) });
      await app.audit('telegram_settings', null, { actor: who.name, enabled: !!b.enabled, rules });
      return { ok: true };
    }
    if (b.action === 'test') { await call('sendMessage', { chat_id: (await config()).chat_id, text: '🔔 رسالة تجربة من مرصد الأداء — ' + clock(ctx.now) }); return { ok: true }; }
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
    const add = (key, kind, employeeId, text) => alerts.push({ key, kind, employeeId, text });
    const live = await app.live(now), people = new Map(live.map(p => [p.employeeId, p]));
    const all = new Map((await db.prepare('SELECT id, name FROM employees').all()).map(e => [e.id, e.name]));
    const name = id => people.get(id)?.name || all.get(id) || 'موظف';
    const since = p => p.since ? (now - Date.parse(p.since)) / 1000 : 0;
    // Breaks that started in the last 10 minutes.
    if (on('breakStart')) for (const e of await db.prepare("SELECT * FROM events WHERE event_type IN ('break_start','break_observed') AND occurred_at > ? ORDER BY occurred_at").all(now - 600000)) {
      if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('break:' + e.id)) continue;
      const p = await app.breakPolicy(e.employee_id, now);
      add('break:' + e.id, 'breakStart', e.employee_id, '☕ ' + name(e.employee_id) + ' بدأ بريك — تحويلة ' + e.extension + ' — ' + clock(e.occurred_at)
        + '\nبريكات اليوم العادية: ' + Math.min(p.startsUsed, 2) + ' من 2 · المستخدم ' + fmt(p.usedSeconds) + ' من 30 د' + (e.event_type === 'break_observed' ? '\n⚠️ البريك بدأ من غير سماح من المرصد' : ''));
    }
    for (const p of live) {
      if (p.state === 'break' && on('breakOver')) {
        const perm = await db.prepare('SELECT allowed_seconds FROM break_permissions WHERE employee_id = ? AND used_at IS NOT NULL AND used_at <= ? ORDER BY used_at DESC LIMIT 1').get(p.employeeId, now);
        const allowed = perm?.allowed_seconds || RULES.breakPeriodSeconds;
        if (since(p) > allowed) add('over:' + p.employeeId + ':' + p.since, 'breakOver', p.employeeId, '⏰ ' + p.name + ' في بريك بقاله ' + fmt(since(p)) + ' والمسموح ' + fmt(allowed) + ' — تحويلة ' + p.extension);
      }
      if (p.state === 'on_call' && on('longCall') && since(p) > RULES.callAlertSeconds)
        add('call:' + p.employeeId + ':' + (p.callId || p.since), 'longCall', p.employeeId, '📞 مكالمة طويلة: ' + p.name + ' بقاله ' + fmt(since(p)) + (p.phone ? ' مع ' + p.phone : '') + ' — تحويلة ' + p.extension);
      if (p.state === 'unknown' && on('gap') && since(p) > 180)
        add('gap:' + p.employeeId + ':' + p.since, 'gap', p.employeeId, '📡 انقطاع رصد: ' + p.name + ' مفيش إشارة من جهازه من ' + clock(Date.parse(p.since)) + ' (' + fmt(since(p)) + ') — تحويلة ' + p.extension);
    }
    if (on('breakRequest')) for (const r of await db.prepare("SELECT r.*, e.name FROM break_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'pending' AND r.created_at > ?").all(now - 1800000))
      add('req:' + r.id, 'breakRequest', r.employee_id, '🙋 ' + r.name + ' طالب بريك إضافي ' + r.requested_minutes + ' دقيقة — وافق أو ارفض من صفحة الإدارة (الآن)');
    if (on('logout')) for (const s of await db.prepare('SELECT * FROM employee_sessions WHERE revoked_at > ? AND work_started_at IS NOT NULL').all(now - 600000)) {
      if (!KNOWN_CLOSE.has(s.revoke_reason || '') || await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('out:' + s.id)) continue;
      const w = dayWindow(businessDay(s.revoked_at));
      const calls = await db.prepare("SELECT COUNT(*) n, AVG(duration_seconds) a FROM events WHERE employee_id = ? AND event_type = 'agentunlinked' AND occurred_at >= ? AND occurred_at <= ?").get(s.employee_id, w.start, s.revoked_at);
      const p = await app.breakPolicy(s.employee_id, s.revoked_at);
      add('out:' + s.id, 'logout', s.employee_id, '🚪 ' + name(s.employee_id) + ' خرج ' + clock(s.revoked_at) + ' — تحويلة ' + s.extension
        + '\nمكالماته النهارده: ' + calls.n + (calls.n ? ' · متوسط المكالمة ' + fmt(calls.a) : '') + '\nبريك: ' + p.startsUsed + ' مرة · ' + fmt(p.usedSeconds));
    }
    if (on('queueNobody')) {
      const snap = await app.latestLive(), rows = snap && now - snap.observed_at < 30000 ? JSON.parse(snap.rows) : [];
      const waiting = rows.filter(r => /^(on wait|waiting)$/i.test(String(r[10]).trim())).length, ready = live.filter(p => p.state === 'ready').length;
      let since = await queueSince.get();
      if (waiting && !ready) {
        if (!since) { since = now; await queueSince.set(now); }
        if (now - since >= 20000) add('queue:' + Math.floor(since / 1000), 'queueNobody', null, '🚨 ' + waiting + ' عميل منتظر ومفيش موظف متاح — من ' + clock(since));
      } else if (since) await queueSince.set(null);
    }
    return alerts;
  }

  let busy = false;
  app.telegramTick = async function tick(now = app.now()) {
    if (busy) return 0;
    busy = true;
    let sent = 0;
    try {
      const c = await config();
      if (!c.enabled || !c.token || !c.chat_id) return 0;
      const alerts = await collect(c, now);
      if (alerts.length) await db.batch(alerts.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at) VALUES (?,?,?,?,?)').bind(a.key, a.kind, a.employeeId, a.text, now)));
      for (const r of await db.prepare('SELECT * FROM telegram_log WHERE sent_at IS NULL AND tries < 5 AND created_at > ? ORDER BY id LIMIT 20').all(now - 3600000)) {
        // Claim the row before sending, so two instances never send the same alert.
        const claim = await db.prepare('UPDATE telegram_log SET sent_at = ?, tries = tries + 1 WHERE id = ? AND sent_at IS NULL').run(app.now(), r.id);
        if (!claim.changes) continue;
        try { await call('sendMessage', { chat_id: c.chat_id, text: r.text }, c.token); await db.prepare('UPDATE telegram_log SET error = NULL WHERE id = ?').run(r.id); sent++; }
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
