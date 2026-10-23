'use strict';
// Telegram alerts for supervisors: one bot, one group. The server checks every 15 seconds and sends
// each alert once. Rules can be switched on and off from the admin page.
const crypto = require('node:crypto');
const { businessDay, dayWindow, iso, RULES } = require('./time');
const { KNOWN_CLOSE } = require('./attendance-rules');

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
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_config (id INTEGER PRIMARY KEY CHECK (id = 1), bot_token TEXT, bot_name TEXT, chat_id TEXT, chat_title TEXT, enabled INTEGER NOT NULL DEFAULT 0, rules TEXT, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS telegram_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, employee_id INTEGER, text TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER, tries INTEGER NOT NULL DEFAULT 0, error TEXT);
    CREATE INDEX IF NOT EXISTS telegram_log_time ON telegram_log(created_at);`);
  const API = (app.config.telegramApi || 'https://api.telegram.org').replace(/\/$/, '');

  // The bot token is stored encrypted with the server secret.
  const keyBytes = crypto.createHash('sha256').update('telegram:' + app.config.secret).digest();
  const seal = text => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyBytes, iv); const out = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), out].map(b => b.toString('base64')).join('.'); };
  const open = sealed => { try { const [iv, tag, data] = sealed.split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', keyBytes, iv); d.setAuthTag(tag); return Buffer.concat([d.update(data), d.final()]).toString('utf8'); } catch { return null; } };
  const config = () => {
    const c = db.prepare('SELECT * FROM telegram_config WHERE id = 1').get();
    return c ? { ...c, token: c.bot_token ? open(c.bot_token) : null, rules: { ...DEFAULT_RULES, ...JSON.parse(c.rules || '{}') } } : { token: null, rules: DEFAULT_RULES, enabled: 0 };
  };
  const save = fields => {
    db.prepare('INSERT OR IGNORE INTO telegram_config (id, rules) VALUES (1, ?)').run(JSON.stringify(DEFAULT_RULES));
    const keys = Object.keys(fields);
    db.prepare('UPDATE telegram_config SET ' + keys.map(k => k + ' = @' + k).join(', ') + ', updated_at = @now WHERE id = 1').run({ ...fields, now: app.now() });
  };
  async function call(method, body, token = config().token) {
    if (!token) fail(400, 'اربط البوت الأول');
    const r = await fetch(API + '/bot' + token + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) { const e = Error(d.description || 'تليجرام رفض الطلب'); e.status = r.status; throw e; }
    return d.result;
  }

  // ---------- admin ----------
  app.route('GET', '/api/telegram', ctx => {
    app.requireAdmin(ctx, 'admin');
    const c = config();
    if (ctx.query.log === '1') {
      const w = dayWindow(ctx.query.date || businessDay(ctx.now));
      return { log: db.prepare('SELECT * FROM telegram_log WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 500').all(w.start, w.end)
        .map(r => ({ kind: r.kind, label: RULE_LIST[r.kind] || r.kind, text: r.text, createdAt: iso(r.created_at), sentAt: iso(r.sent_at), error: r.sent_at ? null : r.error })) };
    }
    return { configured: !!c.token, botName: c.bot_name || null, chat: c.chat_id ? { id: c.chat_id, title: c.chat_title } : null, enabled: !!c.enabled,
      rules: Object.entries(RULE_LIST).map(([key, label]) => ({ key, label, on: !!c.rules[key] })) };
  });
  app.route('POST', '/api/telegram', async ctx => {
    const who = app.requireAdmin(ctx, 'admin'), b = ctx.body;
    if (b.action === 'token') {
      const token = String(b.token || '').trim();
      if (!/^\d+:[\w-]{30,}$/.test(token)) fail(400, 'شكل التوكن مش صحيح؛ انسخه من BotFather');
      let me; try { me = await call('getMe', {}, token); } catch (e) { fail(400, 'تليجرام رفض التوكن: ' + e.message); }
      save({ bot_token: seal(token), bot_name: me.username || me.first_name || '', chat_id: null, chat_title: null, enabled: 0 });
      app.audit('telegram_bot_linked', null, { actor: who.name, bot: me.username });
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
      save({ chat_id: chatId, chat_title: String(b.title || '').slice(0, 100), enabled: 1 });
      app.audit('telegram_group_linked', null, { actor: who.name, chat: b.title });
      return { ok: true };
    }
    if (b.action === 'settings') {
      const rules = Object.fromEntries(Object.keys(RULE_LIST).map(k => [k, !!b.rules?.[k]]));
      save({ enabled: b.enabled ? 1 : 0, rules: JSON.stringify(rules) });
      app.audit('telegram_settings', null, { actor: who.name, enabled: !!b.enabled, rules });
      return { ok: true };
    }
    if (b.action === 'test') { await call('sendMessage', { chat_id: config().chat_id, text: '🔔 رسالة تجربة من مرصد الأداء — ' + clock(ctx.now) }); return { ok: true }; }
    fail(400, 'invalid_action');
  });

  // ---------- alerts ----------
  const queueSince = { at: null };
  function collect(now) {
    const c = config(), on = k => c.rules[k], alerts = [];
    const add = (key, kind, employeeId, text) => alerts.push({ key, kind, employeeId, text });
    const live = app.live(now), people = new Map(live.map(p => [p.employeeId, p]));
    const name = id => people.get(id)?.name || db.prepare('SELECT name FROM employees WHERE id = ?').get(id)?.name || 'موظف';
    const since = p => p.since ? (now - Date.parse(p.since)) / 1000 : 0;
    // Breaks that started in the last 10 minutes.
    if (on('breakStart')) for (const e of db.prepare("SELECT * FROM events WHERE event_type IN ('break_start','break_observed') AND occurred_at > ? ORDER BY occurred_at").all(now - 600000)) {
      const p = app.breakPolicy(e.employee_id, now);
      add('break:' + e.id, 'breakStart', e.employee_id, '☕ ' + name(e.employee_id) + ' بدأ بريك — تحويلة ' + e.extension + ' — ' + clock(e.occurred_at)
        + '\nبريكات اليوم العادية: ' + Math.min(p.startsUsed, 2) + ' من 2 · المستخدم ' + fmt(p.usedSeconds) + ' من 30 د' + (e.event_type === 'break_observed' ? '\n⚠️ البريك بدأ من غير سماح من المرصد' : ''));
    }
    for (const p of live) {
      if (p.state === 'break' && on('breakOver')) {
        const perm = db.prepare('SELECT allowed_seconds FROM break_permissions WHERE employee_id = ? AND used_at IS NOT NULL AND used_at <= ? ORDER BY used_at DESC LIMIT 1').get(p.employeeId, now);
        const allowed = perm?.allowed_seconds || RULES.breakPeriodSeconds;
        if (since(p) > allowed) add('over:' + p.employeeId + ':' + p.since, 'breakOver', p.employeeId, '⏰ ' + p.name + ' في بريك بقاله ' + fmt(since(p)) + ' والمسموح ' + fmt(allowed) + ' — تحويلة ' + p.extension);
      }
      if (p.state === 'on_call' && on('longCall') && since(p) > RULES.callAlertSeconds)
        add('call:' + p.employeeId + ':' + (p.callId || p.since), 'longCall', p.employeeId, '📞 مكالمة طويلة: ' + p.name + ' بقاله ' + fmt(since(p)) + (p.phone ? ' مع ' + p.phone : '') + ' — تحويلة ' + p.extension);
      if (p.state === 'unknown' && on('gap') && since(p) > 180)
        add('gap:' + p.employeeId + ':' + p.since, 'gap', p.employeeId, '📡 انقطاع رصد: ' + p.name + ' مفيش إشارة من جهازه من ' + clock(Date.parse(p.since)) + ' (' + fmt(since(p)) + ') — تحويلة ' + p.extension);
    }
    if (on('breakRequest')) for (const r of db.prepare("SELECT r.*, e.name FROM break_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'pending' AND r.created_at > ?").all(now - 1800000))
      add('req:' + r.id, 'breakRequest', r.employee_id, '🙋 ' + r.name + ' طالب بريك إضافي ' + r.requested_minutes + ' دقيقة — وافق أو ارفض من صفحة الإدارة (الآن)');
    if (on('logout')) for (const s of db.prepare('SELECT * FROM employee_sessions WHERE revoked_at > ? AND work_started_at IS NOT NULL').all(now - 600000)) {
      if (!KNOWN_CLOSE.has(s.revoke_reason || '')) continue;
      const w = dayWindow(businessDay(s.revoked_at));
      const calls = db.prepare("SELECT COUNT(*) n, AVG(duration_seconds) a FROM events WHERE employee_id = ? AND event_type = 'agentunlinked' AND occurred_at >= ? AND occurred_at <= ?").get(s.employee_id, w.start, s.revoked_at);
      const p = app.breakPolicy(s.employee_id, s.revoked_at);
      add('out:' + s.id, 'logout', s.employee_id, '🚪 ' + name(s.employee_id) + ' خرج ' + clock(s.revoked_at) + ' — تحويلة ' + s.extension
        + '\nمكالماته النهارده: ' + calls.n + (calls.n ? ' · متوسط المكالمة ' + fmt(calls.a) : '') + '\nبريك: ' + p.startsUsed + ' مرة · ' + fmt(p.usedSeconds));
    }
    if (on('queueNobody')) {
      const snap = app.latestLive(), rows = snap && now - snap.observed_at < 30000 ? JSON.parse(snap.rows) : [];
      const waiting = rows.filter(r => /^(on wait|waiting)$/i.test(String(r[10]).trim())).length, ready = live.filter(p => p.state === 'ready').length;
      if (waiting && !ready) { queueSince.at ??= now; if (now - queueSince.at >= 20000) add('queue:' + Math.floor(queueSince.at / 1000), 'queueNobody', null, '🚨 ' + waiting + ' عميل منتظر ومفيش موظف متاح — من ' + clock(queueSince.at)); }
      else queueSince.at = null;
    }
    return alerts;
  }

  let busy = false;
  app.telegramTick = async function tick(now = app.now()) {
    const c = config();
    if (busy || !c.enabled || !c.token || !c.chat_id) return 0;
    busy = true;
    let sent = 0;
    try {
      const add = db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at) VALUES (?,?,?,?,?)');
      for (const a of collect(now)) add.run(a.key, a.kind, a.employeeId, a.text, now);
      for (const r of db.prepare('SELECT * FROM telegram_log WHERE sent_at IS NULL AND tries < 5 AND created_at > ? ORDER BY id LIMIT 20').all(now - 3600000)) {
        try { await call('sendMessage', { chat_id: c.chat_id, text: r.text }, c.token); db.prepare('UPDATE telegram_log SET sent_at = ?, tries = tries + 1, error = NULL WHERE id = ?').run(app.now(), r.id); sent++; }
        catch (e) { db.prepare('UPDATE telegram_log SET tries = tries + 1, error = ? WHERE id = ?').run(String(e.message).slice(0, 300), r.id); }
      }
    } finally { busy = false; }
    return sent;
  };
  if (!app.config.worker && app.config.telegramTimer !== false) setInterval(() => app.telegramTick().catch(() => {}), 15000).unref();
}

module.exports = { setup, RULE_LIST };
