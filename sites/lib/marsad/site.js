// الموقع (eldahan.com.eg): the server reads the WooCommerce orders and their notes with a read-only REST key, every
// minute, and keeps per order only the times the reports need (received, sent to the branch, out with the driver,
// delivered) plus the branch and driver names. No customer data is stored.
// The two reports («تقرير أداء الموقع للفروع» and «تقرير أداء الكول سنتر») are drawn from these rows on the admin page.
import { businessDay, iso, validDate } from './time.js';
import { sha256Bytes, randomBytes, b64, fromB64 } from './security.js';

const SYNC_MS = 60000, FIRST_HOURS = 36, NOTES_PER_RUN = 30, OPEN_HOURS = 14;
const EXCLUDED = new Set(['cancelled', 'failed', 'wallet-failed']);
const PREP_MIN = 30, DELIVERY_MIN = 30, TRANSFER_MIN = 5;
const KINDS = ['sitePrep', 'siteTransfer'];

// The rules of the daily reports, applied to the order notes (exact seconds).
function readNotes(notes) {
  const list = notes.map(n => ({ at: Date.parse(String(n.date_created_gmt || n.date_created || '').replace(/Z?$/, 'Z')), text: String(n.note || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter(n => Number.isFinite(n.at)).sort((a, b) => a.at - b.at);
  const first = f => list.find(f)?.at ?? null, last = f => [...list].reverse().find(f);
  const transferNote = last(n => n.text.includes('تم إرسال الطلب إلى')), outNote = last(n => n.text.includes('خرج الطلب للتوصيل'));
  return {
    received: first(n => n.text.includes('to تم الاستلام') && !n.text.includes('من الفرع')),
    transfer: first(n => n.text.includes('تم إرسال الطلب إلى')),
    branch: transferNote?.text.match(/إلى (?:فرع )?(.*?) (?:من )?لوحة/)?.[1]?.trim() || null,
    out: first(n => n.text.includes('خرج الطلب للتوصيل')),
    driver: outNote?.text.match(/مع (.*?)\. وقت/)?.[1]?.trim() || null,
    delivered: first(n => /أكد المندوب تسليم|تم التوصيل/.test(n.text)),
    scheduled: list.some(n => n.text.includes('موعد التوصيل')),
  };
}

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => v == null ? db.prepare('DELETE FROM settings WHERE key = ?').run(k) : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const doFetch = app.config.siteFetch || ((...a) => fetch(...a));

  // The key and secret are stored encrypted with the server secret (like the Telegram bot token).
  let aesKey = null;
  const aes = () => aesKey ??= crypto.subtle.importKey('raw', sha256Bytes('site:' + app.config.secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const seal = async text => { const iv = randomBytes(12); return b64(iv) + '.' + b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), new TextEncoder().encode(text)))); };
  const open = async sealed => { try { const [iv, data] = sealed.split('.').map(fromB64); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aes(), data)); } catch { return null; } };
  async function creds() {
    const raw = await setting('site_wc');
    if (!raw) return null;
    try { const c = JSON.parse(await open(raw)); return c?.key && c.secret ? c : null; } catch { return null; }
  }
  async function wc(c, path, params = {}) {
    const url = new URL(c.url.replace(/\/$/, '') + '/wp-json/wc/v3/' + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await doFetch(url.toString(), { headers: { authorization: 'Basic ' + btoa(c.key + ':' + c.secret), accept: 'application/json', 'user-agent': 'MarsadEldahan/1.0' }, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    let body = null; try { body = JSON.parse(text); } catch {}
    if (!r.ok) throw Error('الموقع رد ' + r.status + (body?.message ? ': ' + String(body.message).slice(0, 120) : ''));
    if (body == null) throw Error('الموقع رد بحاجة مش JSON (ممكن الحماية قافلة الطلب)');
    return body;
  }

  // ---- one sync: orders changed since the last run, then notes for changed and still-open orders ----
  let running = false;
  async function sync(now) {
    if (running) return { skipped: true };
    running = true;
    try {
      const c = await creds();
      if (!c) return { skipped: true };
      const last = Number(await setting('site_sync_at')) || (now - FIRST_HOURS * 3600000);
      const after = new Date(last - 5 * 60000).toISOString().slice(0, 19);
      const changed = [];
      for (let page = 1; page <= 6; page++) {
        const list = await wc(c, 'orders', { per_page: 50, page, modified_after: after, dates_are_gmt: 'true', orderby: 'modified', order: 'asc', _fields: 'id,status,date_created_gmt,date_modified_gmt,meta_data' });
        if (!Array.isArray(list)) throw Error('رد غير متوقع من الموقع');
        changed.push(...list);
        if (list.length < 50) break;
      }
      const upsert = [];
      for (const o of changed) {
        const ful = (o.meta_data || []).find(m => m.key === '_eldahan_app_fulfillment')?.value || null;
        const created = Date.parse(String(o.date_created_gmt) + 'Z');
        if (!Number.isFinite(created)) continue;
        upsert.push(db.prepare('INSERT INTO site_orders (id, day, status, fulfillment, created_at, modified_at, notes_at) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET status = excluded.status, fulfillment = excluded.fulfillment, modified_at = excluded.modified_at, notes_at = CASE WHEN excluded.modified_at > IFNULL(site_orders.modified_at, 0) THEN NULL ELSE site_orders.notes_at END')
          .bind(o.id, businessDay(created), String(o.status), ful ? String(ful) : null, created, Date.parse(String(o.date_modified_gmt) + 'Z') || created));
      }
      if (upsert.length) await db.batch(upsert);
      // Notes: orders never read since they changed first, then open orders (their notes change without a status change).
      const due = await db.prepare(`SELECT id FROM site_orders WHERE created_at >= ? AND status NOT IN ('cancelled','failed','wallet-failed') AND (notes_at IS NULL OR (delivered_at IS NULL AND notes_at < ?))
        ORDER BY notes_at IS NOT NULL, notes_at, created_at LIMIT ?`).all(now - OPEN_HOURS * 3600000, now - 50000, NOTES_PER_RUN);
      for (const { id } of due) {
        const notes = await wc(c, 'orders/' + id + '/notes', { per_page: 100, _fields: 'date_created_gmt,note' });
        const x = readNotes(Array.isArray(notes) ? notes : []);
        await db.prepare('UPDATE site_orders SET received_at = ?, transfer_at = ?, branch = ?, out_at = ?, driver = ?, delivered_at = ?, scheduled = ?, notes_at = ? WHERE id = ?')
          .run(x.received, x.transfer, x.branch, x.out, x.driver, x.delivered, x.scheduled ? 1 : 0, now, id);
      }
      await put('site_sync_at', now); await put('site_error', null);
      await alerts(now);
      return { orders: changed.length, notes: due.length };
    } catch (e) {
      await put('site_error', String(e.message).slice(0, 300)); await put('site_error_at', now);
      return { error: e.message };
    } finally { running = false; }
  }

  // ---- alerts: prep over 30 min to the branches, transfer over 5 min to the call center's online group ----
  async function alerts(now) {
    const rows = await db.prepare(`SELECT * FROM site_orders WHERE created_at >= ? AND status NOT IN ('cancelled','failed','wallet-failed') AND delivered_at IS NULL AND scheduled = 0`).all(now - OPEN_HOURS * 3600000);
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
    const list = [], clock = ms => new Date(ms).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    for (const o of rows) {
      if (o.received_at && !o.transfer_at && now - o.received_at > TRANSFER_MIN * 60000)
        list.push({ key: 'site:transfer:' + o.id, kind: 'siteTransfer', target: 'online', text: '⏳ أوردر موقع ماتحوّلش للفرع — #' + o.id + '\nمستني من ' + Math.round((now - o.received_at) / 60000) + ' دقيقة (اتستلم ' + clock(o.received_at) + ')' });
      if (o.fulfillment === 'delivery' && o.transfer_at && !o.out_at && now - o.transfer_at > PREP_MIN * 60000)
        list.push({ key: 'site:prep:' + o.id, kind: 'sitePrep', target: 'branches', text: '🟠 أوردر موقع لسه بيتجهز — ' + (o.branch || 'فرع غير معروف') + '\n#' + o.id + ' بقاله ' + Math.round((now - o.transfer_at) / 60000) + ' دقيقة من التحويل (' + clock(o.transfer_at) + ')' });
    }
    if (list.length) await db.batch(list.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target) VALUES (?,?,?,?,?,?,?)').bind(a.key, a.kind, null, a.text, now, r[a.kind] === false ? now : null, a.target)));
  }

  let lastRun = 0;
  app.afterRequest(async now => {
    if (now - lastRun < SYNC_MS) return;
    lastRun = now;
    await sync(now);
  });

  // ---- admin: the key, the status, a manual sync ----
  app.route('GET', '/api/site', async ctx => {
    await app.requireAdmin(ctx);
    const c = await creds();
    return { linked: !!c, url: c?.url || 'https://eldahan.com.eg', keyEnd: c ? c.key.slice(-4) : null, lastSync: iso(Number(await setting('site_sync_at')) || null),
      error: await setting('site_error'), errorAt: iso(Number(await setting('site_error_at')) || null), serverNow: iso(ctx.now) };
  });
  app.route('POST', '/api/site', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body;
    if (b.action === 'key') {
      const key = String(b.key || '').trim(), secret = String(b.secret || '').trim(), url = String(b.url || 'https://eldahan.com.eg').trim();
      if (!/^ck_[a-f0-9]{20,64}$/.test(key) || !/^cs_[a-f0-9]{20,64}$/.test(secret)) fail(400, 'المفتاح لازم يبدأ بـ ck_ والسر بـ cs_');
      if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) fail(400, 'invalid_url');
      const c = { url, key, secret };
      try { await wc(c, 'orders', { per_page: 1, _fields: 'id' }); } catch (e) { fail(400, 'المفتاح مش شغال: ' + e.message); }
      await put('site_wc', await seal(JSON.stringify(c))); await put('site_sync_at', null); await put('site_error', null);
      await app.audit('site_key_set', null, { actor: who.name, keyEnd: key.slice(-4) });
      return { ok: true, sync: await sync(ctx.now) };
    }
    if (b.action === 'sync') return { ok: true, sync: await sync(ctx.now) };
    if (b.action === 'unlink') { await put('site_wc', null); await app.audit('site_key_removed', null, { actor: who.name }); return { ok: true }; }
    fail(400, 'invalid_action');
  });

  // ---- the day's rows for the two reports ----
  app.route('GET', '/api/site/day', async ctx => {
    await app.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare('SELECT * FROM site_orders WHERE day = ? ORDER BY id').all(day);
    return { day, linked: !!await creds(), lastSync: iso(Number(await setting('site_sync_at')) || null), error: await setting('site_error'), live: day === businessDay(ctx.now),
      orders: rows.map(o => ({ id: o.id, status: o.status, fulfillment: o.fulfillment, excluded: EXCLUDED.has(o.status), scheduled: !!o.scheduled, branch: o.branch, driver: o.driver,
        createdAt: iso(o.created_at), receivedAt: iso(o.received_at), transferAt: iso(o.transfer_at), outAt: iso(o.out_at), deliveredAt: iso(o.delivered_at), notesRead: !!o.notes_at })),
      rules: { prep: PREP_MIN, delivery: DELIVERY_MIN, transfer: TRANSFER_MIN }, serverNow: iso(ctx.now) };
  });
  app.siteSync = sync;
}

export { setup, readNotes, KINDS };
