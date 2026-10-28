import { apexAlertText, apexReceipt } from './order-identifiers.js';
// مرصد الأوردرات: the monitor on the restaurant PC reads Apex (read-only) and pushes a summary of the
// operating day here every few seconds. The admin page shows it; its alerts go out through the appropriate
// department group, including replies when an alert changes state (each kind can be switched off from the Telegram settings).
import { businessDay, dayWindow, isOperating, iso, validDate } from './time.js';
import { sha256, randomToken } from './security.js';
import { entrySignature } from './reviews.js';

const KINDS = ['ordersLate', 'ordersCancel', 'ordersComment', 'ordersDiscount', 'ordersEntry', 'ordersEntryLate', 'ordersStale'];
const STALE_MS = 3 * 60000, CHECK_MS = 60000;
// Which group: delays leaving the branch and all cancellations go to the branch managers.
const BRANCH_KINDS = new Set(['ordersLate', 'ordersCancel']);

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const rulesOn = async () => {
    const c = await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get();
    let r = {}; try { r = JSON.parse(c?.rules || '{}'); } catch {}
    return k => r[k] !== false;
  };
  const queue = async (alerts, now) => {
    if (!alerts.length) return;
    const on = await rulesOn();
    await db.batch(alerts.map(a => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(a.key, a.kind, null, a.text, now, a.replyTo || null, on(a.kind) || a.replyTo ? null : now, a.target || (BRANCH_KINDS.has(a.kind) ? 'branches' : 'online'), a.branch || null)));
  };

  // ---- the monitor's key: made once from the admin page, kept only as a hash ----
  app.route('GET', '/api/orders/token', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    const last = Number(await setting('orders_last_push')) || null;
    return { linked: !!await setting('orders_token_hash'), lastPush: iso(last) };
  });
  app.route('POST', '/api/orders/token', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const token = 'ord_' + randomToken(24);
    await put('orders_token_hash', sha256(token));
    await app.audit('orders_token_created', null, { actor: who.name });
    return { token };
  });

  // Area, comments and the branch's current status for an Apex order, as sent by the monitor — the same lines the
  // monitor writes under its own branch messages, for the server's messages (website and Talabat orders).
  const fuzzy = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^\s*(فرع|الدهان)[\s,،]*/g, '').trim();
  app.apexDetails = async day => {
    let d = null; try { const r = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day); d = r ? JSON.parse(r.data) : null; } catch {}
    const det = d?.details || {}, st = d?.branchStatus || {};
    const extra = no => {
      const x = no == null ? null : det[String(no)]; if (!x) return '';
      return (x.loc ? '\n📍 المنطقة: ' + x.loc : '') + (x.note ? '\n💬 ملاحظة الأوردر: ' + x.note : '') +
        (x.items?.length ? '\n🍽️ تعليقات على الأصناف:\n' + x.items.join('\n') : '') + (x.msgs?.length ? '\n📨 كومنتات اتبعتت بعد الضرب:\n' + x.msgs.join('\n') : '');
    };
    const status = branch => {
      if (!branch) return '';
      const key = st[branch] ? branch : Object.keys(st).find(k => { const a = fuzzy(k), b = fuzzy(branch); return a && b && (a.includes(b.split(/[\s،,-]+/)[0]) || b.includes(a.split(/[\s،,-]+/)[0])); });
      return key ? '\n\n' + st[key] : '';
    };
    return { extra, status };
  };

  // ---- the monitor pushes the day ----
  app.route('POST', '/api/orders/push', async ctx => {
    const hash = await setting('orders_token_hash'), given = ctx.header('x-orders-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح مرصد الأوردرات غير صحيح');
    let b = ctx.body;
    if (!validDate(String(b.day || ''))) fail(400, 'invalid_day');
    const existing = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(b.day);
    let before = {}; try { before = JSON.parse(existing?.data || '{}'); } catch {}
    const replay = b.replayAlerts === true;
    if (replay) {
      if (!existing) fail(409, 'snapshot_required_before_alert_replay');
      b = { ...before, day: b.day, alerts: b.alerts };
    }
    const sourceAt = Date.parse(b.generatedAt || ''), previousAt = Date.parse(before.generatedAt || '');
    if (b.generatedAt && !Number.isFinite(sourceAt)) fail(400, 'invalid_snapshot_time');
    if (Number.isFinite(previousAt) && (!Number.isFinite(sourceAt) || sourceAt < previousAt))
      return { ok: true, ignored: 'older_snapshot' };
    // A legacy lightweight retry omits items. Absence is not an empty basket.
    if (Array.isArray(b.online)) {
      const old = new Map((before.online || []).map(o => [String(o.no), o]));
      b.online = b.online.map(o => {
        const prior = old.get(String(o.no));
        return { ...o, ...(!Object.hasOwn(o, 'items') && prior?.items ? { items: prior.items } : {}),
          ...(!Object.hasOwn(o, 'sourceRefs') && prior?.sourceRefs ? { sourceRefs: prior.sourceRefs } : {}) };
      });
    }
    const data = JSON.stringify({ ...b, alerts: undefined });
    if (data.length > 900000) fail(413, 'payload_too_large');
    const previous = Number(await setting('orders_last_push')) || null;
    const stored = replay ? { changes: 1 } : await db.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data, received_at = excluded.received_at WHERE orders_days.data = ?')
      .run(b.day, data, ctx.now, existing?.data ?? null);
    if (!stored.changes) fail(409, 'snapshot_changed_retry');
    if (!replay) await put('orders_last_push', ctx.now);
    app.talabat?.invalidate?.(b.day);
    const alerts = [];
    // Persist each alert's last state per Apex day. A retry must not create a second reply.
    const stateKey = 'orders_alert_states:' + b.day;
    let states = {}; try { states = JSON.parse(await setting(stateKey) || '{}'); } catch {}
    const rows = name => Array.isArray(b[name]) ? b[name] : [];
    // The branch of an order, from any list of the day (for the branch's own Telegram group).
    const findNo = no => no && ['open', 'lateOut', 'cancels', 'online', 'issues'].map(k => rows(k).find(o => String(o.no) === no)).find(Boolean);
    const branchOfNo = no => no && ['open', 'lateOut', 'cancels', 'online', 'issues'].map(k => rows(k).find(o => String(o.no) === no)).find(Boolean)?.branch || null;
    const orderNo = a => String(a.orderNo ?? a.orderId ?? (/^(?:v?late|del|disc|pay|dup|entry|duplicate|cancel|note):([0-9]+)(?::|$)/.exec(String(a.key))?.[1] || ''));
    // Comments never make a message of their own: the monitor writes them inside its alerts (area, order comment,
    // item comments, comments sent after entry). An «ordersComment» from an older monitor is ignored.
    delete states['context:comments'];
    // New warnings first, then the monitor's follow-ups (the current state of orders already warned about).
    for (const a of (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 400).sort((x, y) => !!x?.follow - !!y?.follow)) {
      if (!a || !KINDS.includes(a.kind) || ['ordersStale', 'ordersComment'].includes(a.kind) || !a.key || !a.text) continue;
      if (a.follow && String(a.status || 'active') === 'active') continue;
      const key = 'orders:' + b.day + ':' + String(a.key).slice(0, 80);
      const old = states[key], no = orderNo(a), branch = a.branch || branchOfNo(no);
      const text = apexAlertText(String(a.text).slice(0, 3500), findNo(no) || { no, sn: a.sn });
      const target = BRANCH_KINDS.has(a.kind) ? 'branches' : 'online';
      const status = String(a.status || 'active').slice(0,80);
      const version = sha256(JSON.stringify([status, text]));
      if (!old) {
        if (status === 'resolved' || a.follow) continue; // No original warning to answer.
        // «Very late» answers the «late» warning of the same order instead of a new message.
        const lateKey = /^vlate:/.test(String(a.key)) ? 'orders:' + b.day + ':' + String(a.key).replace(/^v/, '') : null;
        if (lateKey && states[lateKey] && !['resolved', 'deleted'].includes(states[lateKey].status)) {
          alerts.push({ key: 'state:' + key, kind: a.kind, text, replyTo: lateKey, target: states[lateKey].target, branch: states[lateKey].branch });
          states[key] = { no, kind: a.kind, text, status: 'merged', version, target };
          continue;
        }
        // An entry issue whose pattern was answered «مش غلط» enough times is not alerted (it is still listed).
        if (a.kind === 'ordersEntry' && app.learnedOk) {
          const issue = rows('issues').find(i => String(i.no) === no);
          if (issue && await app.learnedOk(entrySignature(issue))) { states[key] = { no, kind: a.kind, text, status: 'learned', version, target }; continue; }
        }
        alerts.push({ key, kind: a.kind, text, target, branch });
        states[key] = { no, sn: a.sn ?? findNo(no)?.sn ?? null, kind: a.kind, text, status, version, target, branch };
      } else if (old.version !== version) {
        // Explicit state changes, including corrected entry errors, answer the original alert.
        // A changing duration in text alone is not a new state.
        // A discount warning sent before its amount was tracked takes the current amount silently (no change seen).
        // An order cancelled on Apex: no message (only Talabat cancellations are sent); the warning is closed quietly.
        const adopt = (a.follow && old.status === 'active' && /^d-?\d+$/.test(status)) || status === 'deleted';
        if (!adopt && (old.status !== status || a.changed === true)) alerts.push({ key: 'state:' + key + ':' + ((old.sequence || 0) + 1), kind: old.kind,
          text, replyTo: key, target: old.target, branch: old.branch });
        states[key] = { ...old, status, version, text, sequence: (old.sequence || 0) + (!adopt && (old.status !== status || a.changed === true) ? 1 : 0) };
      }
    }
    for (const [key, old] of Object.entries(states)) {
      // 'deleted': the monitor already answered that the order was cancelled; 'merged': answered under the late warning.
      if (old.kind === 'ordersComment' || ['resolved', 'learned', 'deleted', 'merged'].includes(old.status) || !old.no) continue;
      const out = rows('lateOut').find(o => String(o.no) === old.no && o.out);
      const cancel = rows('cancels').find(o => String(o.no) === old.no);
      let text = null;
      // The small serial staff use; the internal number only when the monitor never sent one.
      if (old.sn == null) old.sn = out?.sn ?? cancel?.sn ?? findNo(old.no)?.sn ?? null;
      const shown = apexReceipt({ sn: old.sn });
      const clockOf = v => new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
      // Cancelled on Apex: closed without a message (only Talabat cancellations are sent).
      if (old.kind === 'ordersLate' && cancel && !out) { old.status = 'resolved'; continue; }
      if (old.kind === 'ordersLate' && out) text = '🖥️ Apex | ✅ أوردر ' + shown + ' خرج مع الطيار' + (out.pilot ? ' (' + out.pilot + ')' : '') + (out.out ? ' الساعة ' + clockOf(out.out) : '') + (out.wait != null ? '\nخرج بعد ' + out.wait + ' دقيقة من وقت الضرب' : '') + (out.sched ? '\nالميعاد المطلوب كان ' + clockOf(out.sched) : '');
      // Only a complete issues snapshot can prove that a recorded entry issue disappeared.
      if (old.kind === 'ordersEntry' && Array.isArray(b.issues) && Number.isInteger(b.totals?.issues) && b.totals.issues === b.issues.length &&
          old.observedIssue && !b.issues.some(o => String(o.no) === old.no)) text = '🖥️ Apex | ✅ أوردر ' + shown + ': غلطة الضرب اتصلّحت على Apex';
      if (old.kind === 'ordersEntry' && rows('issues').some(o => String(o.no) === old.no)) old.observedIssue = true;
      if (text) { alerts.push({ key: 'resolved:' + key + ':' + ((old.sequence || 0) + 1), kind: old.kind, text, replyTo: key, target: old.target, branch: old.branch }); old.status = 'resolved'; old.sequence = (old.sequence || 0) + 1; }
    }
    // The monitor was reported stopped: say it is back, as a reply to that alert.
    if (previous && !replay) {
      const gone = await db.prepare('SELECT key FROM telegram_log WHERE key = ?').get('orders:stale:' + previous);
      if (gone) alerts.push({ key: 'resolved:' + gone.key, kind: 'ordersStale', replyTo: gone.key,
        text: '🖥️ Apex | ✅ مرصد الأوردرات رجع يقرا من Apex — كان واقف ' + Math.round((ctx.now - previous) / 60000) + ' دقيقة' });
    }
    await queue(alerts, ctx.now);
    await put(stateKey, JSON.stringify(states));
    // Payment / service / platform values the admin marked as officer: the monitor keeps them out of every total.
    let officer = []; try { officer = JSON.parse(await setting('officer_values') || '[]'); } catch {}
    // follow: this server answers warnings from the monitor's follow-ups (status changes, reminders).
    return { ok: true, officer, follow: 1, kinds: KINDS, serverNow: iso(ctx.now),
      acknowledgedAlerts: (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 400).map(a => a?.key).filter(Boolean) };
  }, { limit: 1024 * 1024 });

  // ---- the Talabat codes of past days, sent once by the monitor from Apex's archive (so old days link right too) ----
  app.route('POST', '/api/orders/tags', async ctx => {
    const hash = await setting('orders_token_hash'), given = ctx.header('x-orders-token');
    if (!hash || !given || sha256(given) !== hash) fail(401, 'مفتاح مرصد الأوردرات غير صحيح');
    const b = ctx.body || {};
    if (!validDate(String(b.day || ''))) fail(400, 'invalid_day');
    const r = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(b.day);
    if (!r) return { ok: true, updated: 0 };
    let d; try { d = JSON.parse(r.data); } catch { return { ok: true, updated: 0 }; }
    const tags = b.tags && typeof b.tags === 'object' ? b.tags : {};
    const references = b.references && typeof b.references === 'object' ? b.references : {};
    let updated = 0;
    for (const list of ['online', 'cancels']) for (const o of Array.isArray(d[list]) ? d[list] : []) {
      let changed = false;
      const tg = tags[String(o.no)];
      if (tg && /^\d{3,12}$/.test(String(tg)) && o.tag !== String(tg)) { o.tag = String(tg); changed = true; }
      const source = o.kind === 'طلبات' ? 'talabat' : o.kind === 'الموقع' ? 'site' : null;
      const incoming = source && references[String(o.no)]?.[source];
      if (incoming) {
        const clean = {};
        for (const field of source === 'talabat' ? ['orderId','code'] : ['orderId'])
          if (/^\d{1,20}$/.test(String(incoming[field] ?? ''))) clean[field] = String(incoming[field]);
        if (Object.keys(clean).length) {
          const merged = { ...(o.sourceRefs?.[source] || {}), ...clean };
          if (JSON.stringify(merged) !== JSON.stringify(o.sourceRefs?.[source])) {
            o.sourceRefs = { ...(o.sourceRefs || {}), [source]: merged }; changed = true;
          }
        }
      }
      if (changed) updated++;
    }
    if (updated) { await db.prepare('UPDATE orders_days SET data = ? WHERE day = ?').run(JSON.stringify(d), b.day); app.talabat?.invalidate?.(b.day); }
    return { ok: true, updated };
  });

  // ---- officer values (not sales) ----
  app.route('GET', '/api/orders/officer', async ctx => {
    await app.requireAdmin(ctx);
    let v = []; try { v = JSON.parse(await setting('officer_values') || '[]'); } catch {}
    return { values: v };
  });
  app.route('PUT', '/api/orders/officer', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const values = [...new Set((Array.isArray(ctx.body.values) ? ctx.body.values : []).map(x => String(x).trim()).filter(Boolean).map(x => x.slice(0, 60)))].slice(0, 30);
    await put('officer_values', JSON.stringify(values));
    await app.audit('officer_values', null, { actor: who.name, values });
    return { ok: true, values };
  });

  // ---- the admin page ----
  app.route('GET', '/api/orders/live', async ctx => {
    await app.requireAdmin(ctx);
    // day=latest: the day the monitor pushed last (Apex closes its day on its own clock, not at 9 ص).
    const latest = ctx.query.day === 'latest' ? (await db.prepare('SELECT day FROM orders_days ORDER BY received_at DESC LIMIT 1').get())?.day : null;
    const day = latest || (validDate(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now));
    const row = await db.prepare('SELECT data, received_at FROM orders_days WHERE day = ?').get(day);
    const w = dayWindow(day);
    const alerts = (await db.prepare("SELECT kind, text, created_at, sent_at, error FROM telegram_log WHERE kind LIKE 'orders%' AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 300").all(w.start, w.end))
      .map(r => ({ kind: r.kind, text: r.text, at: iso(r.created_at), sent: !!r.sent_at && !r.error }));
    const last = Number(await setting('orders_last_push')) || null;
    let data = null; try { data = row ? JSON.parse(row.data) : null; } catch {}
    return { day, data, receivedAt: iso(row?.received_at), lastPush: iso(last), ageSeconds: last ? Math.round((ctx.now - last) / 1000) : null,
      linked: !!await setting('orders_token_hash'), alerts, apexNames: app.apexNameMap ? await app.apexNameMap() : {}, serverNow: iso(ctx.now) };
  });

  // ---- the monitor stopped (someone closed it, the PC is off, the network is down) ----
  let lastCheck = 0;
  app.afterRequest(async now => {
    if (now - lastCheck < CHECK_MS) return;
    lastCheck = now;
    const last = Number(await setting('orders_last_push')) || null;
    if (!last || now - last < STALE_MS || !isOperating(now)) return;
    if (await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get('orders:stale:' + last)) return;
    const at = new Date(last).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    await queue([{ key: 'orders:stale:' + last, kind: 'ordersStale', text: '🖥️ Apex | ⚠️ مرصد الأوردرات مش بيقرا من Apex من ' + at + ' (' + Math.round((now - last) / 60000) + ' دقيقة)\nاتأكد إن جهاز الكاشير شغال ومتوصل بالنت' }], now);
  });
}

export { setup, KINDS };
