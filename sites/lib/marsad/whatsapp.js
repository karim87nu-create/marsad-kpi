// واتساب لعملاء طلبات: a welcome message once a Talabat order is in, and a survey a set time later (75 minutes by
// default), sent from the restaurant's number through the official WhatsApp Business Platform (Meta Cloud API) with
// templates Meta approved. Off until the admin links the number and turns it on.
// The customer's number is read by the Talabat monitor screen only while this is on, kept only until the survey is
// sent (or the order is cancelled, or 12 hours pass), then erased. Numbers are never shown on the admin page.
import { businessDay, iso } from './time.js';
import { sha256Bytes, randomBytes, b64, fromB64 } from './security.js';

const TICK_MS = 30000, GRAPH = 'https://graph.facebook.com/v21.0', KEEP_MS = 12 * 3600000, WELCOME_WINDOW_MS = 2 * 3600000;
const DEAD = new Set(['CANCELLED', 'REJECTED']);

// An Egyptian mobile number in international form (201XXXXXXXXX), or null.
function egMobile(raw) {
  let d = String(raw || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, '');
  if (d.startsWith('0020')) d = d.slice(2);
  if (/^01[0125]\d{8}$/.test(d)) d = '2' + d;
  if (/^1[0125]\d{8}$/.test(d)) d = '20' + d;
  return /^201[0125]\d{8}$/.test(d) ? d : null;
}

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => v == null ? db.prepare('DELETE FROM settings WHERE key = ?').run(k) : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const doFetch = app.config.whatsappFetch || ((...a) => fetch(...a));

  // The access token is stored encrypted with the server secret (like the Telegram token and the site key).
  let aesKey = null;
  const aes = () => aesKey ??= crypto.subtle.importKey('raw', sha256Bytes('whatsapp:' + app.config.secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const seal = async text => { const iv = randomBytes(12); return b64(iv) + '.' + b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), new TextEncoder().encode(text)))); };
  const open = async sealed => { try { const [iv, data] = sealed.split('.').map(fromB64); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aes(), data)); } catch { return null; } };
  async function config() {
    const raw = await setting('whatsapp_config');
    let c = null; try { c = raw ? JSON.parse(await open(raw)) : null; } catch {}
    return c && c.phoneId && c.token ? c : null;
  }
  const on = async () => { const c = await config(); return c && c.enabled && c.welcome ? c : null; };

  async function graph(c, path, body) {
    const r = await doFetch(GRAPH + '/' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + c.token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok) throw Error('واتساب رد ' + r.status + (d?.error?.message ? ': ' + String(d.error.message).slice(0, 160) : ''));
    return d;
  }
  const sendTemplate = (c, to, name) => graph(c, c.phoneId + '/messages', { messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: c.lang || 'ar' } } });

  // ---- the Talabat monitor's pushes: numbers of new orders (only while this is on) ----
  app.whatsapp = {
    wantPhones: async () => !!await on(),
    async take(orders, now) {
      if (!await on()) return;
      const rows = [];
      for (const o of orders) {
        const id = String(o.id || '').replace(/\D/g, '').slice(0, 20);
        if (id.length < 6 || !o.phone) continue;
        const phone = egMobile(o.phone);
        rows.push(db.prepare('INSERT OR IGNORE INTO wa_messages (talabat_id, day, phone, created_at, error) VALUES (?,?,?,?,?)')
          .bind(id, businessDay(now), phone, now, phone ? null : 'الرقم مش موبايل مصري'));
      }
      if (rows.length) await db.batch(rows);
    },
  };

  // ---- sending: the welcome first, the survey after the delay; numbers erased when done ----
  let busy = false, last = 0;
  app.whatsappTick = async (now = app.now()) => {
    if (busy) return 0;
    busy = true; let sent = 0;
    try {
      // Erase numbers that are not needed any more, whatever the setting.
      await db.prepare('UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL AND created_at < ?').run(now - KEEP_MS);
      const c = await on(); if (!c) return 0;
      const status = async id => (await db.prepare('SELECT status, accepted_at FROM talabat_orders WHERE id = ?').get(id)) || {};
      for (const r of await db.prepare('SELECT * FROM wa_messages WHERE phone IS NOT NULL AND welcome_at IS NULL AND tries < 3 AND created_at > ? ORDER BY created_at LIMIT 10').all(now - WELCOME_WINDOW_MS)) {
        const s = await status(r.talabat_id);
        if (DEAD.has(s.status)) { await db.prepare('UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?').run('الأوردر اتلغى', r.id); continue; }
        try { await sendTemplate(c, r.phone, c.welcome); await db.prepare('UPDATE wa_messages SET welcome_at = ?, error = NULL WHERE id = ?').run(now, r.id); sent++; }
        catch (e) { await db.prepare('UPDATE wa_messages SET tries = tries + 1, error = ? WHERE id = ?').run(String(e.message).slice(0, 300), r.id); }
      }
      const delay = Math.max(10, Math.min(600, Number(c.delay) || 75)) * 60000;
      for (const r of await db.prepare('SELECT * FROM wa_messages WHERE phone IS NOT NULL AND welcome_at IS NOT NULL AND survey_at IS NULL AND tries < 6 ORDER BY created_at LIMIT 10').all()) {
        const s = await status(r.talabat_id), base = s.accepted_at || r.created_at;
        if (DEAD.has(s.status)) { await db.prepare('UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?').run('الأوردر اتلغى — مفيش استطلاع', r.id); continue; }
        if (now - base < delay) continue;
        if (!c.survey) { await db.prepare('UPDATE wa_messages SET phone = NULL WHERE id = ?').run(r.id); continue; }
        try { await sendTemplate(c, r.phone, c.survey); await db.prepare('UPDATE wa_messages SET survey_at = ?, phone = NULL, error = NULL WHERE id = ?').run(now, r.id); sent++; }
        catch (e) { await db.prepare('UPDATE wa_messages SET tries = tries + 1, error = ? WHERE id = ?').run(String(e.message).slice(0, 300), r.id); }
      }
    } finally { busy = false; }
    return sent;
  };
  app.afterRequest(async now => { if (now - last < TICK_MS) return; last = now; await app.whatsappTick(now); });

  // ---- admin ----
  app.route('GET', '/api/whatsapp', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const c = await config(), day = businessDay(ctx.now);
    const n = async where => (await db.prepare('SELECT COUNT(*) AS n FROM wa_messages WHERE day = ? AND ' + where).get(day)).n;
    const errors = (await db.prepare('SELECT talabat_id, error, created_at FROM wa_messages WHERE day = ? AND error IS NOT NULL ORDER BY id DESC LIMIT 10').all(day))
      .map(r => ({ order: r.talabat_id, error: r.error, at: iso(r.created_at) }));
    return { configured: !!c, enabled: !!c?.enabled, phoneIdEnd: c ? String(c.phoneId).slice(-4) : null, welcome: c?.welcome || '', survey: c?.survey || '', lang: c?.lang || 'ar', delay: c?.delay || 75,
      today: { orders: await n('1 = 1'), welcome: await n('welcome_at IS NOT NULL'), survey: await n('survey_at IS NOT NULL'), waiting: await n('phone IS NOT NULL') }, errors };
  });
  app.route('POST', '/api/whatsapp', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin'), b = ctx.body || {};
    const old = await config();
    const tpl = x => String(x || '').trim().toLowerCase();
    if (b.action === 'config') {
      const c = { ...(old || {}), phoneId: String(b.phoneId || old?.phoneId || '').trim(), token: String(b.token || '').trim() || old?.token,
        welcome: tpl(b.welcome), survey: tpl(b.survey), lang: String(b.lang || 'ar').trim(), delay: Math.max(10, Math.min(600, Number(b.delay) || 75)), enabled: !!old?.enabled };
      if (!/^\d{6,30}$/.test(c.phoneId)) fail(400, 'Phone number ID لازم يكون أرقام بس');
      if (!c.token) fail(400, 'التوكن ناقص');
      for (const t of [c.welcome, c.survey]) if (t && !/^[a-z0-9_]{1,512}$/.test(t)) fail(400, 'اسم القالب: حروف إنجليزي صغيرة وأرقام و _ بس');
      if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(c.lang)) fail(400, 'كود اللغة زي ar أو en_US');
      let display = null;
      try { display = (await graph(c, c.phoneId + '?fields=display_phone_number,verified_name'))?.display_phone_number || null; } catch (e) { fail(400, 'البيانات مش شغالة: ' + e.message); }
      await put('whatsapp_config', await seal(JSON.stringify(c)));
      await app.audit('whatsapp_config', null, { actor: who.name, phoneIdEnd: c.phoneId.slice(-4) });
      return { ok: true, number: display };
    }
    if (b.action === 'enable') {
      if (!old) fail(400, 'اربط الرقم الأول');
      if (b.on && !old.welcome) fail(400, 'اكتب اسم قالب الترحيب الأول');
      await put('whatsapp_config', await seal(JSON.stringify({ ...old, enabled: !!b.on })));
      if (!b.on) await db.prepare('UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL').run();
      await app.audit('whatsapp_' + (b.on ? 'on' : 'off'), null, { actor: who.name });
      return { ok: true };
    }
    if (b.action === 'test') {
      if (!old) fail(400, 'اربط الرقم الأول');
      const to = egMobile(b.to), name = b.which === 'survey' ? old.survey : old.welcome;
      if (!to) fail(400, 'اكتب رقم موبايل مصري صحيح');
      if (!name) fail(400, 'اسم القالب ناقص');
      try { await sendTemplate(old, to, name); } catch (e) { fail(400, e.message); }
      return { ok: true };
    }
    if (b.action === 'remove') {
      await put('whatsapp_config', null);
      await db.prepare('UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL').run();
      await app.audit('whatsapp_removed', null, { actor: who.name });
      return { ok: true };
    }
    fail(400, 'invalid_action');
  });
}

export { setup, egMobile };
