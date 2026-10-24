'use strict';
// Arabicss agent page: who is working (password once), what Arabicss shows (ready / call / break),
// breaks with the server's permission, alerts and admin messages.
(() => {
  const M = globalThis.MARSAD;
  if (location.hostname !== M.ARABICSS_HOST || /^\/themes\/arabicssReportsInclude/i.test(location.pathname) || window.__marsadAgent) return;
  window.__marsadAgent = true;

  const IDENTITY_GRACE_MS = 20 * 60000, BEAT_MS = 30000, LONG_CALL_S = 240;
  const KEY = 'marsad_identity';
  const bg = message => browser.runtime.sendMessage(message);
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const fmt = s => { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  const minutes = s => { const n = Math.max(0, Math.round(s)); return Math.floor(n / 60) + ' دقيقة' + (n % 60 ? ' و' + (n % 60) + ' ثانية' : ''); };

  // ---------- server time ----------
  let offset = null;
  const now = () => Date.now() + (offset ?? 0);
  const iso = ms => new Date(ms).toISOString();
  async function syncClock() { try { const r = await bg({ type: 'CLOCK' }); if (r?.offset != null) offset = r.offset; } catch {} return offset !== null; }
  setInterval(syncClock, 60000);

  // ---------- identity ----------
  // { employee: {id, name, employeeCode}, token, extension, identityAt }
  let id = null, passive = false, notice = '';
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(id)); } catch {} if (id) bg({ type: 'UPDATE', token: id.token, identity: id }).catch(() => {}); };
  const ext = () => (($('#issabel-callcenter-titulo-consola')?.textContent || '').match(/(?:SIP|IAX2|PJSIP)\/(\d+)/i) || [])[1] || '';

  async function api(path, method = 'GET', body) {
    const r = await bg({ type: 'API', path, method, body, token: id?.token });
    if (r?.offset != null) offset = r.offset;
    return r;
  }

  // ---------- what Arabicss shows ----------
  let snap = null, snapAt = 0, call = null, brk = null, permit = null, lastState = '', lastBeat = 0;
  const canonical = v => String(v || '').match(/(?:incoming-q\d+-|outgoing-)?(\d+)$/)?.[1] || String(v || '');
  function callData(r = {}) {
    const html = String(r.llamada_informacion || ''), text = (html ? new DOMParser().parseFromString(html, 'text/html').body.textContent : $('#issabel-callcenter-llamada-info')?.textContent || '').replace(/\s+/g, ' ');
    const visible = (text.match(/Internal Call ID:\s*(\S+)/i) || [])[1] || '';
    return {
      callId: canonical(r.callid || r.callId || visible),
      phone: String(r.txt_contacto_telefono || r.phone || r.phonenumber || (text.match(/Phone number:\s*([+\d]+)/i) || [])[1] || ''),
      queue: String(r.queue || (visible.match(/incoming-q(\d+)-/) || [])[1] || ''),
      callType: r.calltype || r.callType || (visible.startsWith('incoming') ? 'incoming' : visible ? 'outgoing' : null),
    };
  }
  const fresh = () => snap?.console && performance.now() - snapAt < 5000;
  function state() {
    if (!fresh() || snap.connection !== 'connected') return 'unknown';
    if (brk) return 'break';
    if (call) return 'on_call';
    if (snap.waiting || snap.onHold) return 'unknown';
    return 'ready';
  }

  // ---------- events to the server ----------
  const delivered = new Map();
  async function send(eventType, fields = {}) {
    if (!id || passive) return null;
    const extension = id.extension || ext();
    if (!extension) return null;
    if (offset === null) await syncClock();
    const at = now(), eventKey = extension + ':' + eventType + ':' + at + ':' + crypto.randomUUID();
    const { payload, ...top } = fields;
    const event = { eventType, eventKey, extension, occurredAt: iso(at), clientVersion: M.VERSION, ...top,
      payload: { ...payload, sourceConnection: snap?.connection || 'unknown', connectorVersion: M.VERSION, eventClock: { method: offset === null ? 'local_clock' : 'server_date' } } };
    await bg({ type: 'EVENT', token: id.token, event });
    return eventKey;
  }
  const waitDelivered = (key, ms = 6000) => new Promise(resolve => {
    if (!key) return resolve(false);
    const t = setTimeout(() => { delivered.delete(key); resolve(false); }, ms);
    delivered.set(key, ok => { clearTimeout(t); resolve(ok); });
  });
  browser.runtime.onMessage.addListener(m => {
    if (m?.type !== 'DELIVERED') return;
    delivered.get(m.eventKey)?.(m.ok);
    delivered.delete(m.eventKey);
    if ([401, 403].includes(m.status) && id && m.token === id.token) { const t = id.token; finish('session_rejected', 'انتهت جلسة الموظف من الإدارة أو تغير الباسورد؛ أدخل الباسورد من جديد.', t); }
  });
  function beat(force = false) {
    const st = state();
    if (!force && st === lastState && performance.now() - lastBeat < BEAT_MS) return null;
    lastState = st; lastBeat = performance.now();
    return send('heartbeat', { state: st, payload: { waitingOrHeld: !!(snap?.waiting || snap?.onHold), breakStartedAt: brk?.startedAt || null, callStartedAt: call?.startedAt || null,
      callId: call?.callId || '', phone: call?.phone || '', callType: call?.callType || '', queue: call?.queue || '' } });
  }

  function startCall(r) {
    const c = callData(r);
    if (!c.callId || call?.callId === c.callId) return;
    if (call) endCall();
    call = { ...c, startedAt: now(), observed: false };
    const raw = JSON.stringify(r).length > 20000 ? { ...r, llamada_informacion: undefined } : r;
    send('agentlinked', { ...c, state: 'on_call', durationSeconds: 0, payload: { source: raw } });
  }
  function endCall() {
    if (!call) return;
    const c = call; call = null;
    if (c.startedAt) send('agentunlinked', { callId: c.callId, phone: c.phone, queue: c.queue, callType: c.callType, state: 'ready', durationSeconds: Math.round((now() - c.startedAt) / 1000), payload: { durationKnown: true } });
    else send('call_observed_end', { state: 'ready', payload: { callId: c.callId, durationKnown: false } });
  }
  function startBreak() {
    if (brk) return;
    const ok = permit && permit.until > now() && permit.extension === (id?.extension || ext());
    brk = ok ? { startedAt: now(), allowedSeconds: permit.allowedSeconds, graceSeconds: permit.graceSeconds } : { startedAt: null, allowedSeconds: 900, graceSeconds: 0 };
    if (ok) send('break_start', { state: 'break', permissionId: permit.id, payload: { durationKnown: true } });
    else send('break_observed', { state: 'break', payload: { durationKnown: false, breakPolicyEstimated: true } });
    permit = null;
  }
  function endBreak() {
    if (!brk) return;
    const b = brk; brk = null;
    if (b.startedAt) send('break_end', { state: 'ready', durationSeconds: Math.round((now() - b.startedAt) / 1000), payload: { durationKnown: true } });
    else send('break_end_unknown', { state: 'ready', durationSeconds: 0, payload: { durationKnown: false } });
  }

  function onSnapshot(s) {
    snap = s; snapAt = performance.now();
    if (!id || passive) return;
    if (s.console && s.extension) {
      if (!id.extension) { id.extension = s.extension; save(); send('session_login', { state: 'bound' }); setTimeout(() => { loadBreaks(); loadMessages(); }, 1000); }
      else if (id.extension !== s.extension) return finish('extension_changed', 'تغيرت التحويلة؛ أدخل الباسورد لبدء جلسة على التحويلة الجديدة.');
    }
    if (s.console && s.connection === 'connected') {
      if (s.breakId != null && !brk) startBreak();
      else if (s.breakId == null && brk) endBreak();
      const cid = canonical(s.callId);
      if (cid && call && cid !== call.callId) { send('call_observed_end', { state: 'unknown', payload: { callId: call.callId, durationKnown: false, nextCallId: cid } }); call = null; }
      if (cid && !call) { call = { ...callData({ callid: cid, calltype: s.callType }), startedAt: null, observed: true }; send('call_observed', { state: 'on_call', payload: { callId: cid, startedBeforeObservation: true } }); }
      else if (!cid && call && !s.waiting && !s.onHold) endCall();
    }
    beat();
  }
  function onEvent(r) {
    if (!id || passive) return;
    if (r.event === 'agentloggedout') return finish('extension_logout', 'سجّلت خروج من التحويلة، فانتهت جلسة العمل. أدخل الباسورد تاني لما ترجع.');
    if (r.event === 'logged-out') return finish('arabicss_logout', 'خرجت من أرابيكس، فانتهت جلسة العمل. أدخل الباسورد تاني لما ترجع.');
    if (r.event === 'breakenter') startBreak();
    else if (r.event === 'breakexit') endBreak();
    else if (r.event === 'agentlinked') startCall(r);
    else if (r.event === 'agentunlinked') endCall();
    beat(true);
  }
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'MARSAD_HOOK') return;
    let data; try { data = JSON.parse(e.data.data); } catch { return; }
    if (e.data.type === 'snapshot') onSnapshot(data); else { onEvent(data); render(); }   // snapshots are drawn by the 1 s render
  });

  // ---------- Arabicss sign-in pages ----------
  // At the start of a shift the password is entered once: it stays valid (up to 20 minutes) while the employee goes
  // through the Arabicss login and the agent console login. Once the console has opened on an extension, any login
  // page means the work ended: back to the Arabicss login = left Arabicss; the agent console login = logged out of the extension.
  function loginPage() {
    const f = $('.login-form form');
    if (f && $('input[name="input_user"]', f) && $('input[name="input_pass"][type="password"]', f)) return 'arabicss';
    const mine = n => n.closest('#marsad-box,#marsad-gate,#marsad-messages');
    const text = document.body?.innerText || '';
    return /agent\s+console/i.test(text) && /callback\s+extension/i.test(text) && [...document.querySelectorAll('input[type="password"]')].some(i => !mine(i))
      && [...document.querySelectorAll('button,input[type="submit"]')].some(b => !mine(b) && /^\s*log\s*in\s*$/i.test(b.textContent || b.value || '')) ? 'extension' : '';
  }
  setInterval(() => {
    if (!id || passive || ext()) return;
    const page = loginPage();
    if (!page || !(id.extension || now() - id.identityAt > IDENTITY_GRACE_MS)) return;
    if (page === 'extension') finish('extension_logout', 'سجّلت خروج من التحويلة، فانتهت جلسة العمل. أدخل الباسورد تاني لما ترجع.');
    else finish('arabicss_login_page', 'خرجت من أرابيكس، فانتهت جلسة العمل. أدخل الباسورد تاني لما ترجع.');
  }, 1000);

  // ---------- start / end ----------
  async function start(pin) {
    const r = await api('/api/session/start', 'POST', { pin, extension: ext() });
    if (!r.ok) {
      const e = r.data?.error;
      throw Error(r.status === 401 ? 'الباسورد غير صحيح' : r.status === 429 ? 'محاولات كثيرة؛ انتظر 15 دقيقة'
        : e === 'session_active' ? 'الموظف ده شغال دلوقتي على تحويلة تانية' : e === 'extension_in_use' ? 'التحويلة دي عليها موظف تاني شغال دلوقتي'
        : e === 'password_not_unique' ? 'الباسورد مشترك بين أكثر من موظف؛ اطلب من الإدارة تغييره' : e === 'invalid_device' ? 'الإضافة مش مربوطة بالسيرفر؛ راجع الإدارة' : 'تعذر بدء الجلسة');
    }
    id = { employee: r.data.employee, token: r.data.token, extension: '', identityAt: now() };
    passive = false; notice = ''; lastState = '';
    const reg = await bg({ type: 'REGISTER', token: id.token, identity: id });
    if (!reg?.ok) passive = true;
    save();
    if (snap) onSnapshot(snap);
  }
  function finish(reason, message, token = id?.token) {
    if (!id || id.token !== token) return;
    const was = id;
    if (!passive && was.extension) send(reason === 'manual' ? 'session_logout' : 'arabicss_logout', { state: reason });
    id = null; call = null; brk = null; permit = null; passive = false; lastState = '';
    try { sessionStorage.removeItem(KEY); } catch {}
    if (reason !== 'session_rejected') bg({ type: 'END', token: was.token, reason }).catch(() => {});
    notice = message || '';
    render();
  }
  window.addEventListener('pagehide', () => { if (id && !passive && id.extension) send('page_closed', { state: 'navigation_or_closed' }); });

  // ---------- breaks ----------
  let policy = null, request = null, breakNote = '', busy = false, passNative = false;
  async function loadBreaks() {
    if (!id?.extension || passive) return;
    if (permit && permit.until <= now()) { permit = null; breakNote = 'انتهى السماح غير المستخدم؛ تقدر تبدأ من جديد، ومتحسبش بريك.'; }
    try { const r = await api('/api/break-requests'); if (r.ok) { policy = r.data.breakPolicy; request = (r.data.requests || []).find(x => ['pending', 'approved', 'starting'].includes(x.status)) || null; } } catch {}
    render();
  }
  setInterval(loadBreaks, 5000);
  const readyNow = () => id?.extension && !passive && state() === 'ready' && offset !== null;
  async function confirmReady() {
    if (!readyNow()) throw Error('البريك يبدأ وانت متاح، مش أثناء مكالمة أو انقطاع');
    if (!await waitDelivered(await beat(true))) throw Error('السيرفر لسه مأكدش إنك متاح؛ حاول تاني بعد ثواني');
  }
  function openNative() {
    const button = $('#btn_togglebreak'), select = $('#break_select');
    if (!button || button.disabled || !select || ![...select.options].some(o => o.value === permit.reasonId)) throw Error('مش لاقي زرار البريك في أرابيكس');
    select.value = permit.reasonId;
    passNative = true; try { button.click(); } finally { passNative = false; }
  }
  async function takeBreak(kind) {
    if (busy) return;
    busy = true; breakNote = 'جارٍ التأكد من الرصيد والجاهزية…'; render();
    try {
      await confirmReady();
      if (permit && permit.until > now()) { openNative(); breakNote = 'أكد بدء البريك من نافذة أرابيكس أو الغِ السماح من المرصد.'; return; }
      const r = await api('/api/break-requests', 'POST', kind === 'approved' ? { action: 'start', id: request.id } : { action: 'regular_start' });
      if (!r.ok) throw Error({ approval_required: 'خلص رصيد البريكين؛ اطلب بريك إضافي من المشرف', not_ready: 'السيرفر شايفك مش متاح دلوقتي', permission_pending: 'فيه سماح بريك لسه مستخدمش' }[r.data?.error] || 'تعذر بدء البريك');
      permit = { id: r.data.permissionId, until: Number(r.data.expiresAt), allowedSeconds: r.data.allowedSeconds, graceSeconds: r.data.graceSeconds, extension: id.extension, reasonId: kind === 'approved' ? String(request.reasonId || '2') : '2' };
      openNative();
      breakNote = 'أكد بدء البريك من نافذة أرابيكس. المتاح: ' + minutes(permit.allowedSeconds) + '.';
    } catch (e) { breakNote = e.message; } finally { busy = false; render(); }
  }
  async function cancelPermission() {
    if (busy || !permit) return;
    busy = true; render();
    try {
      const r = await api('/api/break-requests', 'POST', { action: 'cancel_permission', permissionId: permit.id });
      if (!r.ok) throw Error(r.data?.error === 'permission_already_used' ? 'البريك بدأ بالفعل؛ انهيه من أرابيكس' : 'تعذر إلغاء السماح؛ حاول تاني');
      permit = null; breakNote = 'اتلغى السماح غير المستخدم ومتحسبش بريك.';
      await loadBreaks();
    } catch (e) { breakNote = e.message; } finally { busy = false; render(); }
  }
  async function askExtra(mins) {
    if (busy) return;
    busy = true;
    try {
      const r = await api('/api/break-requests', 'POST', { action: 'request', id: 'break-request:' + crypto.randomUUID(), reasonId: '2', reason: 'بريك إضافي', requestedMinutes: mins });
      breakNote = r.ok ? 'الطلب وصل للمشرف؛ كمل شغلك لحد الموافقة.' : 'تعذر إرسال الطلب';
      if (r.ok) request = r.data.request;
    } finally { busy = false; render(); }
  }
  // Arabicss's own break button only works with a permission from the server.
  document.addEventListener('click', e => {
    const b = e.target?.closest?.('button');
    if (!b || !id?.extension || passive) return;
    if (b.id === 'btn_togglebreak') {
      if (passNative || brk || b.classList.contains('issabel-callcenter-boton-unbreak')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      breakNote = 'ابدأ البريك من زرار «بدء البريك» في لوحة المرصد.'; render(); return;
    }
    const dialog = b.closest('.ui-dialog');
    if (dialog?.getAttribute('aria-describedby') === 'issabel-callcenter-seleccion-break' && b.textContent.trim() === 'Take Break') {
      if (permit && permit.until > now() && $('#break_select')?.value === permit.reasonId) return;
      e.preventDefault(); e.stopImmediatePropagation();
      breakNote = 'البريك محتاج سماح من المرصد؛ ابدأه من لوحة المرصد.'; render();
    }
  }, true);

  // ---------- alerts ----------
  const notified = new Set();   // asked once per page; the background keeps the durable list
  function alerts() {
    const list = [];
    if (call?.startedAt && now() - call.startedAt > LONG_CALL_S * 1000) list.push(['call:' + id?.token + ':' + call.callId, 'مكالمة طويلة', 'مكالمتك عدت 4 دقايق']);
    if (brk?.startedAt) {
      const age = (now() - brk.startedAt) / 1000, limit = Math.max(60, brk.allowedSeconds);
      if (age >= limit) list.push(['break-end:' + brk.startedAt, 'خلصت مدة البريك', 'ارجع لاستقبال المكالمات']);
      else if (age >= limit - 60) list.push(['break-warn:' + brk.startedAt, 'باقي دقيقة على نهاية البريك', 'المتاح لهذا البريك ' + minutes(limit)]);
    }
    for (const [key, title, message] of list) if (!notified.has(key)) { notified.add(key); bg({ type: 'NOTIFY', key, title, message }).catch(() => {}); }
    return list.map(x => x[2]);
  }

  // ---------- messages from the admin ----------
  let messages = [], messagesKey = '';
  async function loadMessages() {
    if (!id?.extension || passive) return;
    try {
      const r = await api('/api/messages');
      if (!r.ok) return;
      messages = r.data.messages || [];
      for (const m of messages) if (!m.delivered_at) api('/api/messages', 'PATCH', { id: m.id, action: 'delivered' }).catch(() => {});
      renderMessages();
    } catch {}
  }
  setInterval(loadMessages, 15000);
  function renderMessages() {
    const key = messages.map(m => m.id).join(',');
    if (key === messagesKey && (!key || $('#marsad-messages'))) return;
    messagesKey = key;
    $('#marsad-messages')?.remove();
    if (!messages.length || !document.body) return;
    const box = el('section', { id: 'marsad-messages', dir: 'rtl' });
    for (const m of messages) {
      const ok = el('button', { type: 'button', textContent: 'تم الاطلاع' });
      ok.onclick = async () => { ok.disabled = true; const r = await api('/api/messages', 'PATCH', { id: m.id, action: 'acknowledged' }).catch(() => null); if (r?.ok) { messages = messages.filter(x => x.id !== m.id); renderMessages(); } else { ok.disabled = false; ok.textContent = 'لم يُحفظ؛ حاول تاني'; } };
      box.append(el('article', { className: m.priority === 'urgent' ? 'urgent' : '' }, el('strong', { textContent: (m.priority === 'urgent' ? 'عاجل — ' : '') + m.title }), el('p', { textContent: m.message }), ok));
    }
    document.body.append(box);
  }

  // ---------- screen ----------
  let skipped = false, failures = 0;
  async function probe() {
    if (id) return;
    try { const r = await api('/api/employees/list'); failures = r?.ok ? 0 : r?.status >= 500 ? failures + 1 : 0; } catch { failures++; }
    const skip = $('#marsad-gate button.secondary'); if (skip) skip.hidden = failures < 3;
  }
  setInterval(probe, 10000);
  function showLater() {
    if ($('#marsad-later')) return;
    const later = el('button', { id: 'marsad-later', type: 'button', textContent: 'غير مسجل في المرصد — سجّل الباسورد' });
    later.onclick = () => { skipped = false; later.remove(); render(); };
    document.body.append(later);
  }
  function render() {
    if (!document.body) return;
    const gate = $('#marsad-gate'), box = $('#marsad-box');
    if (!id) {
      box?.remove(); $('#marsad-messages')?.remove(); messagesKey = '';
      if (!gate) {
        const pin = el('input', { type: 'password', inputMode: 'numeric', autocomplete: 'off', placeholder: 'باسورد الموظف' });
        const go = el('button', { type: 'submit', textContent: 'بدء الشيفت' }), err = el('p', { className: 'error', role: 'status' }), note = el('p', { className: 'note' });
        const form = el('form', {}, el('h2', { textContent: 'مرصد الأداء' }), el('p', { textContent: 'اكتب الباسورد بتاعك عشان تتسجل مكالماتك وبريكاتك باسمك.' }), note, pin, go, err);
        form.onsubmit = async e => {
          e.preventDefault(); e.stopPropagation();
          if (!/^\d+$/.test(pin.value)) { err.textContent = 'الباسورد أرقام بس'; return; }
          go.disabled = true; err.textContent = 'جارٍ التحقق…';
          try { await start(pin.value); pin.value = ''; } catch (x) { err.textContent = x.message; } finally { go.disabled = false; render(); }
        };
        // If the server cannot be reached, Arabicss must stay usable: the employee can continue unregistered.
        const skip = el('button', { type: 'button', className: 'secondary', hidden: true, textContent: 'السيرفر مش متاح — كمّل شغلك من غير تسجيل' });
        skip.onclick = () => { skipped = true; $('#marsad-gate')?.remove(); render(); };
        form.append(skip);
        document.body.append(el('div', { id: 'marsad-gate', dir: 'rtl' }, form));
        setTimeout(() => pin.focus(), 50);
      }
      if (skipped) { $('#marsad-gate')?.remove(); showLater(); return; }
      const n = $('#marsad-gate .note'); if (n && n.textContent !== notice) n.textContent = notice;
      return;
    }
    gate?.remove(); $('#marsad-later')?.remove();
    let b = box;
    if (!b) {
      b = el('aside', { id: 'marsad-box', dir: 'rtl' });
      b.innerHTML = '<header><strong data-name></strong><span data-state></span></header><p data-note></p><p data-alert></p><details data-breaks><summary>البريك</summary><p data-policy></p><p data-break-note></p><div data-actions></div></details>';
      document.body.append(b);
    }
    const set = (sel, text) => { const e = $(sel, b); text = String(text ?? ''); if (e.textContent !== text) e.textContent = text; };
    const st = state(), label = { ready: 'متاح', on_call: 'في مكالمة', break: 'بريك', unknown: 'الحالة غير مؤكدة' }[st];
    set('[data-name]', id.employee.name);
    set('[data-state]', passive ? 'التبويب ده مش بيسجل' : !id.extension ? 'ادخل أرابيكس' : label + (st === 'on_call' && call?.startedAt ? ' ' + fmt((now() - call.startedAt) / 1000) : st === 'break' && brk?.startedAt ? ' ' + fmt((now() - brk.startedAt) / 1000) : ''));
    set('[data-note]', passive ? 'جلستك شغالة في تبويب تاني؛ المرصد بيسجل من هناك.' : !id.extension ? 'الباسورد اتسجل. ادخل أرابيكس والكونسول، والمرصد هيربط تحويلتك تلقائيًا.' : 'تحويلة ' + id.extension);
    set('[data-alert]', id.extension ? alerts().join(' — ') : '');
    const p = policy;
    set('[data-policy]', !p ? 'جارٍ قراءة رصيد البريك…' : 'البريكات العادية: ' + Math.min(p.startsUsed, 2) + ' من 2 — المتبقي من 30 دقيقة: ' + minutes(p.remainingSeconds) + (p.regularAvailable ? ' — المتاح للبريك الجاي: ' + minutes(p.nextAllowedSeconds) : ''));
    set('[data-break-note]', breakNote);
    const actions = $('[data-actions]', b), wanted = !id.extension || passive || brk ? 'none' : permit && permit.until > now() ? 'permission' : request?.status === 'approved' ? 'approved' : request?.status === 'pending' ? 'pending' : p?.regularAvailable ? 'regular' : p ? 'extra' : 'none';
    if (actions.dataset.mode !== wanted) {
      actions.dataset.mode = wanted; actions.replaceChildren();
      if (wanted === 'permission') { const resume = el('button', { type: 'button', textContent: 'تأكيد بدء البريك' }), cancel = el('button', { type: 'button', textContent: 'إلغاء السماح' }); resume.onclick = () => takeBreak('regular'); cancel.onclick = cancelPermission; cancel.dataset.cancelPermission = '1'; actions.append(resume, cancel); }
      if (wanted === 'regular') { const go = el('button', { type: 'button', textContent: 'بدء البريك' }); go.onclick = () => takeBreak('regular'); actions.append(go); }
      if (wanted === 'approved') { const go = el('button', { type: 'button', textContent: 'بدء البريك الموافق عليه (' + request.requestedMinutes + ' دقيقة)' }); go.onclick = () => takeBreak('approved'); actions.append(go); }
      if (wanted === 'pending') actions.append(el('p', { textContent: 'طلب البريك الإضافي مستني موافقة المشرف.' }));
      if (wanted === 'extra') {
        const sel = el('select', {}); for (const m of [15, 30, 45, 60]) sel.append(el('option', { value: m, textContent: m + ' دقيقة' }));
        const go = el('button', { type: 'button', textContent: 'طلب بريك إضافي من المشرف' }); go.onclick = () => askExtra(Number(sel.value));
        actions.append(sel, go);
      }
    }
    for (const x of actions.querySelectorAll('button')) x.disabled = busy || (!x.dataset.cancelPermission && !readyNow());
  }
  setInterval(render, 1000);

  // ---------- page start ----------
  (async () => {
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('hook.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).append(script);
    await syncClock();
    try { id = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { id = null; }
    if (!id) id = (await bg({ type: 'RECOVER' }).catch(() => null))?.identity || null;   // same tab, after a cross-origin navigation
    if (id) {
      const reg = await bg({ type: 'REGISTER', token: id.token, identity: id }).catch(() => null);
      if (reg?.closed) { id = null; notice = 'الجلسة دي انتهت (اتقفل المتصفح أو الصفحة أو سجّلت خروج). أدخل الباسورد تاني.'; try { sessionStorage.removeItem(KEY); } catch {} }
      else { passive = !reg?.ok; save(); }
    }
    const ready = () => { render(); loadBreaks(); loadMessages(); };
    if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready, { once: true });
  })();
})();
