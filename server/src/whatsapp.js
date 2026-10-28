// واتساب لعملاء طلبات: a welcome message once a Talabat order is in, and a survey a set time later (75 minutes by
// default), from the restaurant's number. Two ways to send, chosen on the admin page:
//  - «web» (default): WhatsApp Web open on the Talabat monitor PC (the restaurant's number linked as a device, the phone
//    keeps working); the monitor's extension asks this server for the next message and sends it there, one at a time.
//  - «cloud»: the official WhatsApp Business Platform (Meta Cloud API) with templates Meta approved.
// Off until the admin turns it on.
// The customer's number is read by the Talabat monitor screen only while this is on, kept only until the survey is
// sent (or the order is cancelled, or 12 hours pass), then erased. Numbers are never shown on the admin page.
import { businessDay, iso } from './time.js';
import { sha256, sha256Bytes, randomToken, randomBytes, b64, fromB64 } from './security.js';

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
    if (!c) return null;
    if ((c.mode || 'cloud') === 'web') return c.welcomeText ? c : null;
    return c.phoneId && c.token ? c : null;
  }
  const on = async () => { const c = await config(); return c && c.enabled && (c.mode === 'web' ? c.welcomeText : c.welcome) ? c : null; };

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
        const prior = await db.prepare('SELECT id FROM wa_messages WHERE talabat_id=?').get(id);
        const order = await db.prepare('SELECT status,placed_at,received_at FROM talabat_orders WHERE id=?').get(id);
        const sourceAt = order?.received_at || order?.placed_at;
        // A late detail backfill is not a new order. Existing welcome jobs can still receive their survey.
        if (!prior && (DEAD.has(order?.status) || ['COMPLETED','DELIVERED'].includes(order?.status) ||
          (Number.isFinite(sourceAt) && now - sourceAt > WELCOME_WINDOW_MS))) continue;
        const phone = egMobile(o.phone);
        // Current 3.1.9 reads these fields from a detail panel whose order ID it checks.
        // A phone-only list row is not proof of customer/order identity.
        const detailPhone = egMobile(o.detail?.customer?.phone);
        const verified = phone && detailPhone === phone;
        if (verified) rows.push(db.prepare('INSERT INTO wa_identity (talabat_id,phone_hash,verified_at) VALUES (?,?,?) ON CONFLICT(talabat_id) DO UPDATE SET phone_hash=excluded.phone_hash,verified_at=excluded.verified_at').bind(id,sha256(phone),now));
        rows.push(db.prepare('INSERT OR IGNORE INTO wa_messages (talabat_id, day, phone, created_at, error) VALUES (?,?,?,?,?)')
          .bind(id, businessDay(now), phone, now, phone ? verified ? null : 'customer_identity_pending' : 'الرقم مش موبايل مصري'));
        if (verified) rows.push(db.prepare('UPDATE wa_messages SET phone=?,error=NULL WHERE talabat_id=? AND welcome_at IS NULL AND sending_at IS NULL').bind(phone,id));
      }
      if (rows.length) await db.batch(rows);
    },
  };

  const identityReady = async r => {
    const identity = await db.prepare('SELECT phone_hash FROM wa_identity WHERE talabat_id=?').get(r.talabat_id);
    const order = await db.prepare('SELECT status FROM talabat_orders WHERE id=?').get(r.talabat_id);
    if (!r.phone || !order?.status || DEAD.has(order.status) || identity?.phone_hash !== sha256(r.phone)) {
      await db.prepare("UPDATE wa_messages SET error='customer_identity_pending' WHERE id=?").run(r.id); return false;
    }
    return true;
  };
  async function claim(r, kind, now, protocol) {
    if (!await identityReady(r)) return null;
    const token = randomToken(24);
    const got = await db.prepare(`INSERT INTO wa_claims (message_id,kind,token,claimed_at,state,protocol) VALUES (?,?,?,?,'claimed',?)
      ON CONFLICT(message_id) DO UPDATE SET kind=excluded.kind,token=excluded.token,claimed_at=excluded.claimed_at,state='claimed',protocol=excluded.protocol
      WHERE wa_claims.state='done' AND wa_claims.kind='welcome' AND excluded.kind='survey'`).run(r.id,kind,token,now,protocol);
    if (!got.changes) return null;
    await db.prepare('UPDATE wa_messages SET sending_at=? WHERE id=?').run(now,r.id);
    return token;
  }
  async function settle(id, kind, token, ok, invalid, now) {
    const guard = "EXISTS (SELECT 1 FROM wa_claims WHERE message_id=? AND token=? AND kind=? AND state='claimed')";
    const field = kind === 'survey' ? 'survey_at' : 'welcome_at';
    await db.batch([
      ok ? db.prepare(`UPDATE wa_messages SET ${field}=?,sending_at=NULL,error=NULL${kind==='survey'?',phone=NULL':''} WHERE id=? AND ${guard}`).bind(now,id,id,token,kind)
        : db.prepare(`UPDATE wa_messages SET error=?,tries=CASE WHEN ? THEN 3 ELSE tries END,phone=CASE WHEN ? THEN NULL ELSE phone END WHERE id=? AND ${guard}`).bind(invalid?'الرقم مش على واتساب':'delivery_unconfirmed',invalid?1:0,invalid?1:0,id,id,token,kind),
      db.prepare("UPDATE wa_claims SET state=? WHERE message_id=? AND token=? AND kind=? AND state='claimed'").bind(ok?'done':'unknown',id,token,kind),
    ]);
  }

  // ---- sending: the welcome first, the survey after the delay; numbers erased when done ----
  let busy = false, last = 0;
  app.whatsappTick = async (now = app.now()) => {
    if (busy) return 0;
    busy = true; let sent = 0;
    try {
      // Erase numbers that are not needed any more, whatever the setting.
      await db.prepare('UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL AND created_at < ?').run(now - KEEP_MS);
      const c = await on(); if (!c || c.mode === 'web') return 0;   // web: the monitor PC asks for each message (outbox below)
      const status = async id => (await db.prepare('SELECT status, accepted_at FROM talabat_orders WHERE id = ?').get(id)) || {};
      for (const r of await db.prepare('SELECT * FROM wa_messages WHERE phone IS NOT NULL AND welcome_at IS NULL AND tries < 3 AND created_at > ? ORDER BY created_at LIMIT 10').all(now - WELCOME_WINDOW_MS)) {
        const s = await status(r.talabat_id);
        if (DEAD.has(s.status)) { await db.prepare('UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?').run('الأوردر اتلغى', r.id); continue; }
        const token=await claim(r,'welcome',now,2); if (!token) continue;
        try { await sendTemplate(c,r.phone,c.welcome); await settle(r.id,'welcome',token,true,false,now); sent++; }
        catch { await settle(r.id,'welcome',token,false,false,now); }
      }
      const delay = Math.max(10, Math.min(600, Number(c.delay) || 75)) * 60000;
      for (const r of await db.prepare('SELECT * FROM wa_messages WHERE phone IS NOT NULL AND welcome_at IS NOT NULL AND survey_at IS NULL AND tries < 6 ORDER BY created_at LIMIT 10').all()) {
        const s = await status(r.talabat_id), base = s.accepted_at || r.created_at;
        if (DEAD.has(s.status)) { await db.prepare('UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?').run('الأوردر اتلغى — مفيش استطلاع', r.id); continue; }
        if (now - base < delay) continue;
        if (!c.survey) { await db.prepare('UPDATE wa_messages SET phone = NULL WHERE id = ?').run(r.id); continue; }
        const token=await claim(r,'survey',now,2); if (!token) continue;
        try { await sendTemplate(c,r.phone,c.survey); await settle(r.id,'survey',token,true,false,now); sent++; }
        catch { await settle(r.id,'survey',token,false,false,now); }
      }
    } finally { busy = false; }
    return sent;
  };
  app.afterRequest(async now => { if (now - last < TICK_MS) return; last = now; await app.whatsappTick(now); });

  // ---- «web»: the monitor PC asks for the next message, sends it on WhatsApp Web and reports back ----
  const monitorAuth = async ctx => {
    const hash = await setting('talabat_token_hash'), given = ctx.header('x-talabat-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح شاشة طلبات غير صحيح');
  };
  app.route('POST', '/api/whatsapp/next', async ctx => {
    await monitorAuth(ctx);
    const now = ctx.now, c = await on();
    if (!c || c.mode !== 'web') return { ok: true, message: null, on: false };
    const delay = Math.max(10, Math.min(600, Number(c.delay) || 75)) * 60000, gap = Math.max(20, Number(c.gap) || 40) * 1000;
    // One at a time, never faster than the gap (a person's pace), and uncertain attempts stay held while later orders continue.
    const last = Number(await setting('wa_web_last')) || 0;
    if (now - last < gap) return { ok: true, message: null, on: true, wait: gap - (now - last) };
    // Filter blocked jobs BEFORE LIMIT: old unknown claims must not starve later orders.
    const free = `w.phone IS NOT NULL AND w.tries < 3
      AND EXISTS (SELECT 1 FROM wa_identity i WHERE i.talabat_id=w.talabat_id)
      AND t.status IS NOT NULL AND t.status NOT IN ('CANCELLED','REJECTED')`;
    const claimable = kind => kind === 'welcome'
      ? 'NOT EXISTS (SELECT 1 FROM wa_claims q WHERE q.message_id=w.id)'
      : "NOT EXISTS (SELECT 1 FROM wa_claims q WHERE q.message_id=w.id AND NOT (q.state='done' AND q.kind='welcome'))";
    const status = async id => (await db.prepare('SELECT status, accepted_at FROM talabat_orders WHERE id = ?').get(id)) || {};
    const pick = async (kind, r) => {
      const token = await claim(r,kind,now,ctx.body?.protocol === 2 ? 2 : 1);
      if (!token) return null;
      await put('wa_web_last', now);
      const text = (kind === 'survey' ? c.surveyText : c.welcomeText).replace(/\{code\}/g, r.code || '').replace(/\{branch\}/g, r.store || '').trim();
      return { ok: true, on: true, message: { id: r.id, kind, phone: r.phone, text, claimToken: token } };
    };
    for (const r of await db.prepare('SELECT w.*, t.code, t.store FROM wa_messages w LEFT JOIN talabat_orders t ON t.id = w.talabat_id WHERE ' + free + ' AND ' + claimable('welcome') + ' AND w.welcome_at IS NULL AND w.created_at > ? ORDER BY w.created_at LIMIT 5').all(now - WELCOME_WINDOW_MS)) {
      if (DEAD.has((await status(r.talabat_id)).status)) { await db.prepare('UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?').run('الأوردر اتلغى', r.id); continue; }
      const picked=await pick('welcome',r); if (picked) return picked;
    }
    if (c.surveyText) for (const r of await db.prepare('SELECT w.*, t.code, t.store FROM wa_messages w LEFT JOIN talabat_orders t ON t.id = w.talabat_id WHERE ' + free + ' AND ' + claimable('survey') + ' AND w.welcome_at IS NOT NULL AND w.survey_at IS NULL AND COALESCE(t.accepted_at,w.created_at) <= ? ORDER BY w.created_at LIMIT 20').all(now - delay)) {
      const s = await status(r.talabat_id);
      if (DEAD.has(s.status)) { await db.prepare('UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?').run('الأوردر اتلغى — مفيش استطلاع', r.id); continue; }
      if (now - (s.accepted_at || r.created_at) < delay) continue;
      const picked=await pick('survey',r); if (picked) return picked;
    }
    return { ok: true, on: true, message: null };
  });
  app.route('POST', '/api/whatsapp/result', async ctx => {
    await monitorAuth(ctx);
    const b = ctx.body || {}, id = Number(b.id), now = ctx.now;
    if (!Number.isInteger(id)) fail(400, 'invalid_id');
    if (!['welcome','survey'].includes(b.kind)) fail(400,'invalid_kind');
    const current = await db.prepare('SELECT * FROM wa_claims WHERE message_id=?').get(id);
    if (!current || current.kind !== b.kind || (current.protocol===2 && b.claimToken!==current.token)) fail(409,'stale_claim');
    if (current.state==='done') return {ok:true,duplicate:true};
    if (current.state!=='claimed') fail(409,'delivery_unconfirmed');
    await settle(id,b.kind,current.token,!!b.ok,!!b.invalid,now);
    const c=await config();
    if (b.ok && b.kind==='welcome' && c && !c.surveyText) await db.prepare('UPDATE wa_messages SET phone=NULL WHERE id=?').run(id);
    return { ok: true };
  });

  // ---- admin ----
  app.route('GET', '/api/whatsapp', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const c = await config(), day = businessDay(ctx.now);
    const n = async where => (await db.prepare('SELECT COUNT(*) AS n FROM wa_messages WHERE day = ? AND ' + where).get(day)).n;
    const errors = (await db.prepare('SELECT w.id,w.talabat_id,w.error,w.created_at,q.kind,q.state FROM wa_messages w LEFT JOIN wa_claims q ON q.message_id=w.id WHERE w.day = ? AND w.error IS NOT NULL ORDER BY w.id DESC LIMIT 30').all(day))
      .map(r => ({ id:r.id, kind:r.kind, canConfirm:r.error==='delivery_unconfirmed' && r.state==='unknown', order: r.talabat_id, error: r.error, at: iso(r.created_at) }));
    const raw = await setting('whatsapp_config'); let any = null; try { any = raw ? JSON.parse(await open(raw)) : null; } catch {}
    const delay = Math.max(10, Math.min(600, Number(c?.delay) || 75)) * 60000;
    const ready = await db.prepare(`SELECT COUNT(*) n FROM wa_messages w JOIN talabat_orders t ON t.id=w.talabat_id
      JOIN wa_identity i ON i.talabat_id=w.talabat_id LEFT JOIN wa_claims q ON q.message_id=w.id
      WHERE w.phone IS NOT NULL AND w.tries<3 AND t.status NOT IN ('CANCELLED','REJECTED')
      AND ((w.welcome_at IS NULL AND w.created_at>? AND q.message_id IS NULL)
        OR (? AND w.welcome_at IS NOT NULL AND w.survey_at IS NULL AND COALESCE(t.accepted_at,w.created_at)<=?
          AND (q.message_id IS NULL OR (q.state='done' AND q.kind='welcome'))))`)
      .get(ctx.now-WELCOME_WINDOW_MS, (c?.mode==='web' ? c?.surveyText : c?.survey) ? 1 : 0, ctx.now-delay);
    return { configured: !!c, enabled: !!c?.enabled, mode: any?.mode || 'web', phoneIdEnd: c?.phoneId ? String(c.phoneId).slice(-4) : null, welcome: any?.welcome || '', survey: any?.survey || '', lang: any?.lang || 'ar', delay: any?.delay || 75,
      welcomeText: any?.welcomeText || '', surveyText: any?.surveyText || '', lastWeb: iso(Number(await setting('wa_web_last')) || null),
      unconfirmed: (await db.prepare("SELECT COUNT(*) n FROM wa_claims WHERE state='unknown' OR (state='claimed' AND claimed_at<?)").get(ctx.now-180000)).n,
      today: { ready: ready.n, orders: await n('1 = 1'), welcome: await n('welcome_at IS NOT NULL'), survey: await n('survey_at IS NOT NULL'), waiting: await n('phone IS NOT NULL') }, errors };
  });
  app.route('POST', '/api/whatsapp', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin'), b = ctx.body || {};
    const old = await config();
    const tpl = x => String(x || '').trim().toLowerCase();
    if (b.action === 'confirm_sent') {
      const id=Number(b.id),kind=b.kind;
      if (!Number.isInteger(id) || !['welcome','survey'].includes(kind)) fail(400,'invalid_message');
      const row=await db.prepare('SELECT w.*,q.kind,q.token,q.state,q.claimed_at FROM wa_messages w JOIN wa_claims q ON q.message_id=w.id WHERE w.id=?').get(id);
      if (!row || row.kind!==kind) fail(404,'message_not_found');
      if (row.state==='done') return {ok:true,duplicate:true};
      if (row.state!=='unknown' || row.error!=='delivery_unconfirmed') fail(409,'message_not_reviewable');
      // Restore only the same verified customer's number, within the existing retention window.
      const order=await db.prepare('SELECT status FROM talabat_orders WHERE id=?').get(row.talabat_id);
      let phone=row.phone;
      if (!phone && kind==='welcome' && old?.enabled && old?.surveyText && ctx.now-row.created_at<KEEP_MS && !DEAD.has(order?.status)) {
        const profile=await db.prepare("SELECT data FROM match_profiles WHERE source='talabat' AND ref=?").get(row.talabat_id);
        let customer={};try{customer=JSON.parse(profile?.data||'{}');}catch{}
        const candidate=egMobile(customer.phone || customer.mobile);
        const identity=await db.prepare('SELECT phone_hash FROM wa_identity WHERE talabat_id=?').get(row.talabat_id);
        if (candidate && identity?.phone_hash===sha256(candidate)) phone=candidate;
      }
      const field=kind==='welcome'?'welcome_at':'survey_at';
      await db.batch([
        db.prepare("UPDATE wa_claims SET state='done' WHERE message_id=? AND token=? AND state='unknown'").bind(id,row.token),
        db.prepare(`UPDATE wa_messages SET ${field}=?,sending_at=NULL,error=NULL,phone=? WHERE id=? AND EXISTS (SELECT 1 FROM wa_claims WHERE message_id=? AND token=? AND state='done')`)
          .bind(row.claimed_at,kind==='survey'?null:phone,id,id,row.token),
      ]);
      await app.audit('whatsapp_confirm_sent',null,{actor:who.name,order:row.talabat_id,kind});
      return {ok:true,surveyAvailable:kind==='welcome' && !!phone && !!old?.enabled && !!old?.surveyText};
    }

    if (b.action === 'web') {
      const raw = await setting('whatsapp_config'); let prev = null; try { prev = raw ? JSON.parse(await open(raw)) : null; } catch {}
      const c = { ...(prev || {}), mode: 'web', welcomeText: String(b.welcomeText || '').trim().slice(0, 1000), surveyText: String(b.surveyText || '').trim().slice(0, 1000),
        delay: Math.max(10, Math.min(600, Number(b.delay) || 75)), enabled: !!prev?.enabled && prev?.mode === 'web' };
      if (!c.welcomeText) fail(400, 'اكتب رسالة الترحيب');
      await put('whatsapp_config', await seal(JSON.stringify(c)));
      await app.audit('whatsapp_web_config', null, { actor: who.name });
      return { ok: true };
    }
    if (b.action === 'config') {
      const c = { ...(old || {}), mode: 'cloud', phoneId: String(b.phoneId || old?.phoneId || '').trim(), token: String(b.token || '').trim() || old?.token,
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
      if (b.on && !(old.mode === 'web' ? old.welcomeText : old.welcome)) fail(400, 'اكتب رسالة الترحيب الأول');
      await put('whatsapp_config', await seal(JSON.stringify({ ...old, enabled: !!b.on })));
      if (!b.on) await db.prepare('UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL').run();
      await app.audit('whatsapp_' + (b.on ? 'on' : 'off'), null, { actor: who.name });
      return { ok: true };
    }
    if (b.action === 'test') {
      if (!old) fail(400, 'اربط الرقم الأول');
      if (old.mode === 'web') fail(400, 'في وضع واتساب ويب، التجربة بتتعمل من شاشة طلبات: شغّل الإرسال واضرب أوردر تجربة');
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
