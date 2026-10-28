'use strict';
// مرصد الدهان — admin page (v2): الكول سنتر والفروع. One file, no framework. Talks only to the new server.
(() => {
  const API = window.MARSAD_API;
  const BASE = new URL('.', document.currentScript?.src || location.href).href;
  const $ = id => document.getElementById(id);
  const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null)); return e; };
  const TOKEN = 'marsadAdminToken';

  // ---------- formatting ----------
  const dur = s => { if (s == null || !Number.isFinite(Number(s))) return '—'; s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  const clock = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', ...(state.day !== state.to ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  // Hour and minute (with ص/م); in a date range the day comes with it.
  const hm = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', ...(state.day !== state.to ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit' }) : '—';
  const hms = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const stamp = v => v ? new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const pct = v => v == null ? 'غير متاح' : Number(v).toFixed(1) + '%';
  const secs = v => v == null ? 'غير متاح' : Number(v).toFixed(1) + ' ث';
  const ampm = v => String(v || '').replace(/\bAM\b/i, 'ص').replace(/\bPM\b/i, 'م');
  const cairoToday = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); const d = p.year + '-' + p.month + '-' + p.day; return +p.hour < 9 ? new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10) : d; };
  const REASON = { arabicss_logout: 'خرج من أرابيكس', arabicss_login_page: 'خرج من أرابيكس', extension_logout: 'خرج من التحويلة', tab_closed: 'قفل صفحة أرابيكس', browser_restarted: 'قفل المتصفح', expired_or_disconnected: 'انقطاع', work_resumed: 'دخل تاني', explicit_logout: 'خروج', session_logout: 'خروج', extension_changed: 'غيّر التحويلة', password_changed: 'اتغير الباسورد', employee_disabled: 'اتوقف من الإدارة' };
  // Time outside the extension is explanation only (never counted): why the employee was out.
  const OUT = { arabicss: 'خرج من أرابيكس', extension: 'خرج من التحويلة', browser: 'قفل المتصفح أو الصفحة', gap: 'انقطاع رصد' };
  const outTotal = x => (x.gapSeconds || 0) + (x.outArabicssSeconds || 0) + (x.outExtensionSeconds || 0) + (x.outBrowserSeconds || 0);
  const outDetail = x => [['outArabicssSeconds', 'arabicss'], ['outExtensionSeconds', 'extension'], ['outBrowserSeconds', 'browser'], ['gapSeconds', 'gap']].filter(([k]) => x[k] > 0).map(([k, o]) => OUT[o] + ' ' + dur(x[k])).join(' · ');
  const STATE = { ready_night: 'متاح (بعد 3 الفجر)', on_call_night: 'في مكالمة (بعد 3 الفجر)', break_night: 'بريك (بعد 3 الفجر)', unknown_night: 'انقطاع رصد (بعد 3 الفجر)', ready: 'متاح', on_call: 'في مكالمة', break: 'بريك', unknown: 'انقطاع رصد', logged_in: 'سجّل ولسه مدخلش الكونسول', offline: 'برّه التحويلة', logged_out: 'خرج', out_arabicss: 'خرج من أرابيكس', out_extension: 'خرج من التحويلة', out_browser: 'قفل المتصفح', out_gap: 'انقطاع رصد', disconnected: 'انقطع الاتصال', not_started: 'مبدأش', no_session: 'لم يسجل', shift_ended: 'خلص الشيفت', post_call: 'أنهى مكالمة', break_unconfirmed: 'بريك بلا طرفين مؤكدين' };
  const QUEUE = q => ({ 0: 'خارج ساعات العمل', 1: 'طلب أوردر', 2: 'متابعة أوردر', 3: 'شكاوى' })[String(q || '').slice(-1)] || 'غير معروف';
  const MISSED = { counted: 'محتسبة', short_exempt: 'قصيرة ≤7ث — للتوضيح', after_hours: 'خارج ساعات العمل', unknown_wait: 'انتظار غير معروف', unknown_queue: 'نوع طلب غير معروف' };
  const ROLE = { admin: 'مدير', supervisor: 'مشرف', viewer: 'مشاهدة فقط' };

  // ---------- server ----------
  let token = sessionStorage.getItem(TOKEN) || '', who = null, offset = 0;
  const serverNow = () => Date.now() + offset;
  async function api(path, { method = 'GET', body, timeout } = {}) {
    const r = await fetch(API + path, { method, cache: 'no-store', signal: timeout ? AbortSignal.timeout(timeout) : undefined, headers: { 'x-admin-password': token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { logout('انتهى الدخول؛ ادخل تاني'); throw Error('انتهى الدخول'); }
    if (!r.ok) throw Error(d.error || 'تعذر الاتصال بالسيرفر');
    if (d.serverNow) offset = Date.parse(d.serverNow) - Date.now();
    return d;
  }
  const canWrite = () => ['admin', 'supervisor'].includes(who?.role), isAdmin = () => who?.role === 'admin';

  // ---------- tables ----------
  // columns: { title, get(row), show?(row), type: 'text'|'number'|'duration'|'datetime'|'percent', cls? }
  function table(container, columns, rows, { onRow, limit = 500, empty = 'لا توجد بيانات' } = {}) {
    const box = typeof container === 'string' ? $(container) : container;
    const state = box._sort || (box._sort = { col: -1, dir: 1 });
    let list = rows;
    if (state.col >= 0) { const c = columns[state.col]; list = [...rows].sort((a, b) => { const x = c.get(a), y = c.get(b); return (x == null) - (y == null) || (x < y ? -1 : x > y ? 1 : 0) * state.dir; }); }
    const head = h('tr', {}, ...columns.map((c, i) => { const th = h('th', { textContent: c.title, scope: 'col', tabIndex: 0 }); th.setAttribute('aria-sort', state.col === i ? (state.dir > 0 ? 'ascending' : 'descending') : 'none'); th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); } }; th.onclick = () => { state.dir = state.col === i ? -state.dir : 1; state.col = i; table(box, columns, rows, { onRow, limit, empty }); }; return th; }));
    const body = h('tbody');
    for (const r of list.slice(0, limit)) {
      const tr = h('tr', { className: onRow ? 'click' : '' }, ...columns.map(c => { const v = c.show ? c.show(r) : c.get(r); const td = h('td', { className: (c.type && c.type !== 'text' ? 'num ' : '') + (c.cls?.(r) || '') }); if (v instanceof Node) td.append(v); else td.textContent = v ?? '—'; return td; }));
      if (onRow) tr.onclick = () => onRow(r);
      body.append(tr);
    }
    if (!list.length) body.append(h('tr', {}, h('td', { colSpan: columns.length, textContent: empty, className: 'muted' })));
    box.replaceChildren(h('div', { className: 'tablewrap', tabIndex: 0 }, h('table', {}, h('thead', {}, head), body)), list.length > limit ? h('p', { className: 'muted', textContent: 'معروض أول ' + limit + ' من ' + list.length + '؛ التصدير فيه الكل.' }) : '');
  }
  function exportSheets(file, sheets) {
    window.MarsadXlsx.download(file + '-' + periodLabel(), sheets.map(([sheet, columns, rows]) => ({ name: sheet, columns: columns.map(c => ({ title: c.title, type: c.type })), rows: rows.map(r => columns.map(c => { const v = c.get(r); return v instanceof Node ? v.textContent : v; })) })));
  }
  function exportRows(name, columns, rows) {
    window.MarsadXlsx.download(name + '-' + periodLabel(), columns.map(c => ({ title: c.title, type: c.type })), rows.map(r => columns.map(c => { const v = c.get(r); return v instanceof Node ? v.textContent : v; })));
  }
  const pill = (text, kind = '') => h('span', { className: 'pill ' + kind, textContent: text });
  const C = window.MarsadCharts;
  // A number card. tone: good | warn | bad | info | a state name.
  const kpi = (label, value, tone = '', sub = '') => h('div', { className: 'kpi ' + tone }, h('span', { textContent: label }), h('b', { textContent: value ?? '—' }), sub ? h('small', { textContent: sub }) : null);
  const toneHigh = (v, good, warn) => v == null ? '' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad';   // higher is better
  const toneLow = (v, good, warn) => v == null ? '' : v <= good ? 'good' : v <= warn ? 'warn' : 'bad';    // lower is better
  const ms = v => v == null ? null : Date.parse(v);
  // Hours of the data day in order (9 ص … 8 ص) and the Cairo hour of a moment / of an Arabicss "11:52 PM" time.
  const DAY_HOURS = [...Array(24)].map((_, i) => (i + 9) % 24);
  const hourLabel = hr => (hr % 12 || 12) + (hr < 12 ? 'ص' : 'م');
  const cairoHour = v => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(v)));
  const textHour = t => { const m = String(t || '').match(/(\d{1,2}):\d{2}(?::\d{2})?\s*([AP]M)?/i); if (!m) return null; let hr = +m[1] % 12; if (!m[2]) hr = +m[1]; else if (/p/i.test(m[2])) hr += 12; return hr % 24; };
  // Per-hour buckets for a bar chart; hours after 3 الفجر only when something happened in them.
  function hourly(list, hourOf, valuesOf, tipOf) {
    const by = new Map(DAY_HOURS.map(hr => [hr, []]));
    for (const x of list) { const hr = hourOf(x); if (hr != null && by.has(hr)) by.get(hr).push(x); }
    return DAY_HOURS.filter(hr => by.get(hr).length || (hr >= 9 || hr < 3)).map(hr => ({ label: hourLabel(hr), values: valuesOf(by.get(hr)), tip: tipOf ? tipOf(by.get(hr), hr) : null }));
  }
  const avg = list => list.length ? list.reduce((n, v) => n + v, 0) / list.length : null;
  const rankList = (list, value, show, color) => { const max = Math.max(1, ...list.map(value)); return h('div', { className: 'ranks' }, ...list.map(x => h('div', { className: 'r' }, h('span', { textContent: x.name }), h('b', { textContent: show(x) }), C.meter(value(x), max, color)))); };

  // ---------- state ----------
  const state = { view: 'now', day: cairoToday(), to: cairoToday(), employees: [], names: new Map(), live: null, queue: null, day_: {}, requests: null };
  const name = id => state.names.get(Number(id)) || 'موظف #' + id;
  async function loadEmployees() {
    const d = await api('/api/employees');
    state.employees = d.employees;
    state.names = new Map([...d.employees, ...(d.archivedEmployees || [])].map(e => [e.id, e.name]));
    const opts = [h('option', { value: '', textContent: 'كل الموظفين' }), ...d.employees.map(e => h('option', { value: e.id, textContent: e.name }))];
    $('callEmployee').replaceChildren(...opts.map(o => o.cloneNode(true)));
    $('reviewForm').elements.employeeId.replaceChildren(h('option', { value: '', textContent: 'من غير موظف' }), ...d.employees.map(e => h('option', { value: e.id, textContent: e.name })));
    $('messageForm').elements.to.replaceChildren(h('option', { value: 'all', textContent: 'كل الموظفين النشطين' }), ...d.employees.filter(e => e.active).map(e => h('option', { value: e.id, textContent: e.name })));
  }
  const cache = new Map();
  async function cached(key, ms, load) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    return value;
  }
  const rangeKey = () => 'day:' + state.day + ':' + state.to;
  const periodQuery = () => 'from=' + state.day + '&to=' + state.to;
  const periodLabel = () => state.day === state.to ? state.day : state.day + ' إلى ' + state.to;
  const dayData = (force = false) => { if (force) cache.delete(rangeKey()); return cached(rangeKey(), state.to === cairoToday() ? 20000 : 600000, () => api('/api/day?' + periodQuery())); };
  const dayHistory = async (force = false) => (await dayData(force)).history;

  function syncStatus(ok, text) { const s = $('sync'); s.textContent = text || (ok ? 'آخر تحديث ' + hms(Date.now()) : 'تعذر التحديث'); s.classList.toggle('bad', !ok); }
  function showError(e) { $('error').hidden = !e; $('error').textContent = e ? e.message || String(e) : ''; }
  // الفروع وضرب الأوردرات (orders.js).
  let INS = null;
  const rerender = () => { if (DAY_VIEWS.includes(state.view) || ['talabat', 'branchFile', 'sales'].includes(state.view)) show(state.view); };
  const OR = window.MarsadOrders({ api, h, $, table, kpi, pill, C, exportRows, serverNow, cairoToday, state, hm: v => hm(v), showError, review: () => INS });
  const SITE = window.MarsadSite({ api, h, $, table, kpi, pill, serverNow, state, showError, exportRows, canWrite: () => canWrite(), extensionCall: (...a) => extensionCall(...a), review: () => INS });
  INS = window.MarsadInsights({ api, h, $, table, kpi, pill, C, state, exportRows, canWrite: () => canWrite(), isAdmin: () => isAdmin(), showError, rerender: () => rerender(), OR, SITE });

  // ---------- الآن ----------
  let arc = null;
  // Hour and minute only (no day), for the now screen.
  const hmNow = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }) : '—';
  async function refreshNow() {
    const d = await api('/api/live', { timeout: 4000 });
    state.live = d; state.queue = d.queue; state.liveAt = Date.now();
    renderNow(); state.drawnAt = Date.now();
  }
  
  function renderNow() {
    const d = state.live;
    if (!d) return;
    // Old data is never shown as live: after 5 s without a successful update the screen says so and greys out.
    const stale = Date.now() - (state.liveAt || 0) > 5000;
    $('nowStale').hidden = !stale; $('nowStale').textContent = stale ? 'البيانات مش بتتحدث — آخر تحديث ناجح ' + hms(state.liveAt) + '. الأرقام والعدادات دي قديمة.' : '';
    $('view-now').classList.toggle('stale', stale);
    const now = stale ? (state.liveAt || Date.now()) + offset : serverNow(), people = d.employees.map(p => ({ ...p, s: ['unknown', 'disconnected'].includes(p.state) ? 'unknown' : p.state, elapsed: p.since ? (now - Date.parse(p.since)) / 1000 : null }));
    const count = s => people.filter(p => p.s === s).length;
    const q = state.queue, qAge = q ? (now - Date.parse(q.observedAt)) / 1000 : null, qFresh = q && qAge < 30;
    const waiting = qFresh ? q.waiting : [];
    if (!arc && window.MarsadArc) { arc = window.MarsadArc({ api, QUEUE, OUT, hm: hmNow, hms, canWrite, waitNow }); $('nowArc').replaceChildren(arc.root); }
    if (arc) arc.update(d, now, qAge);
    const longestWait = waiting.reduce((m, r) => Math.max(m, waitNow(r.wait, qAge) || 0), 0);
    $('nowCards').replaceChildren(kpi('متاحين', count('ready'), count('ready') ? 'ready' : 'bad'), kpi('في مكالمة', count('on_call'), 'on_call'), kpi('في بريك', count('break'), 'break'),
      kpi('انقطاع رصد', count('unknown'), count('unknown') ? 'unknown' : ''), kpi('سجّلوا ولسه مدخلوش الكونسول', count('logged_in')),
      kpi('عملاء منتظرين', qFresh ? waiting.length : 'غير متاح', !qFresh ? '' : waiting.length && !count('ready') ? 'bad' : waiting.length ? 'warn' : 'good', qFresh && waiting.length ? 'أطول انتظار ' + dur(longestWait) : ''));
    const order = ['on_call', 'break', 'ready', 'unknown', 'logged_in', 'logged_out', 'shift_ended', 'no_session'];
    const groups = order.map(s => [s, people.filter(p => p.s === s).sort((a, b) => (b.elapsed || 0) - (a.elapsed || 0))]).filter(([, list]) => list.length);
    // People who are not working right now only take one line each group.
    // Same people in the same states: only the running timers change, so only they are redrawn (keeps hover and selection).
    const staffKey = JSON.stringify(groups.map(([s, list]) => [s, list.map(p => [p.employeeId, p.name, p.extension, p.phone, p.queue, p.outKind, p.since, p.state, p.lastEvidence,
      (s === 'break' && p.elapsed > 900) || (s === 'on_call' && p.elapsed > 240)])]));
    if (staffKey === state.staffKey && $('staffNow').firstChild) { for (const t of $('staffNow').querySelectorAll('time[data-since]')) t.textContent = dur((now - Number(t.dataset.since)) / 1000); }
    else if (!groups.length) $('staffNow').replaceChildren(h('p', { className: 'muted', textContent: 'مفيش موظفين مسجلين في المرصد دلوقتي' }));
    else $('staffNow').replaceChildren(...groups.map(([s, list]) => ['no_session', 'logged_out', 'shift_ended'].includes(s) ? h('div', { className: 'group' }, h('h3', { textContent: (STATE[s] || s) + ' — ' + list.length }),
      h('div', { className: 'inline' }, ...list.map(p => pill(p.name + (s === 'logged_out' ? (p.outKind ? ' · ' + OUT[p.outKind] : '') + (p.since ? ' ' + hm(p.since) : '') : ''))))) : h('div', { className: 'group' }, h('h3', { textContent: (STATE[s] || s) + ' — ' + list.length }),
      h('div', { className: 'tiles' }, ...list.map(p => {
        const over = (s === 'break' && p.elapsed > 900) || (s === 'on_call' && p.elapsed > 240);
        return h('div', { className: 'tile ' + s + (over ? ' over' : ''), title: 'آخر إشارة ' + stamp(p.lastEvidence) + (s === 'unknown' ? (p.state === 'disconnected' ? ' · جلسة انقطعت من غير خروج مسجل' : ' · الإشارة متوقفة والجلسة لم تُغلق') : '') },
          ['on_call', 'break'].includes(s) && p.elapsed != null ? (t => { t.dataset.since = String(Date.parse(p.since)); return t; })(h('time', { textContent: dur(p.elapsed) })) : null,
          h('strong', { textContent: p.name }),
          h('small', { textContent: [p.extension && 'تحويلة ' + p.extension, s === 'on_call' && p.phone, s === 'on_call' && p.queue && QUEUE(p.queue)].filter(Boolean).join(' · ') || ' ' }));
      })))));
    state.staffKey = staffKey;
    $('queueAge').textContent = q ? (qFresh ? 'تحديث منذ ' + Math.round(qAge) + ' ث' : 'آخر بيانات ' + clock(q.observedAt) + ' — قديمة') : 'الموصل مش شغال';
    table('queueNow', [
      { title: 'نوع الطلب', get: r => QUEUE(r.queue) },
      { title: 'الرقم', get: r => r.phone },
      { title: 'الانتظار', get: r => waitNow(r.wait, qAge), show: r => dur(waitNow(r.wait, qAge)), type: 'duration', cls: r => waitNow(r.wait, qAge) > 7 ? 'warn' : '' },
    ], waiting, { empty: qFresh ? 'مفيش حد منتظر' : 'بيانات الانتظار غير متاحة الآن' });
  }

  // Wait shown by Arabicss at the snapshot, plus the seconds since then.
  function waitNow(v, age) { const m = String(v).match(/^(\d+):(\d\d):(\d\d)$/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + Math.max(0, Math.round(age || 0)) : null; }

  // Requests are visible in every view, with a permanent inbox in the navigation.
  const BREAK_REQUEST_STATUS = { pending: 'مستني موافقة', approved: 'موافق عليه — مستني الموظف يبدأ', starting: 'البريك بدأ', completed: 'البريك انتهى', rejected: 'مرفوض', expired: 'انتهت الصلاحية', cancelled: 'اتلغى' };
  function requestActions(r) {
    if (r.status !== 'pending') return pill(BREAK_REQUEST_STATUS[r.status] || r.status);
    if (!state.requests.canDecide) return pill('للعرض فقط — القبول للمدير والمشرف');
    const box = h('span', { className: 'inline' });
    for (const [action, label, cls] of [['approve', 'قبول البريك', ''], ['reject', 'رفض', 'danger']]) {
      const b = h('button', { textContent: label, className: cls });
      b.onclick = async () => {
        for (const x of box.querySelectorAll('button')) x.disabled = true;
        try { await api('/api/break-requests', { method: 'POST', body: { action, id: r.id } }); }
        catch (e) { showError(e); }
        await refreshRequests();
      }; box.append(b);
    } return box;
  }
  let requestsBusy = false;
  async function refreshRequests() {
    if (requestsBusy) return;
    requestsBusy = true;
    try {
    try { state.requests = await api('/api/break-requests'); } catch (e) { if (state.view === 'requests') showError(e); return; }
    const rows = state.requests.requests, pending = rows.filter(r => r.status === 'pending');
    document.title = (pending.length ? '(' + pending.length + ') ' : '') + 'مرصد الدهان — الإدارة';
    $('reqBadge').hidden = !pending.length; $('reqBadge').textContent = pending.length;
    $('breakRequests').replaceChildren(...(pending.length && state.view !== 'requests' ? [h('div', { className: 'requests' }, h('h2', { textContent: 'طلبات بريك مستنية موافقة — ' + pending.length }),
      ...pending.map(r => h('div', { className: 'row' }, h('span', { textContent: r.employee + ' · تحويلة ' + (r.extension || '—') + ' · ' + r.requestedMinutes + ' دقيقة · من ' + clock(r.createdAt) }), requestActions(r))))] : []));
    const cnt = st => rows.filter(r => st.includes(r.status)).length;
    $('requestCards').replaceChildren(kpi('مستنية موافقة', pending.length, pending.length ? 'warn' : 'good'), kpi('اتوافق عليها', cnt(['approved', 'starting', 'completed']), 'good'),
      kpi('اترفضت', cnt(['rejected']), cnt(['rejected']) ? 'bad' : ''), kpi('انتهت أو اتلغت', cnt(['expired', 'cancelled'])), kpi('إجمالي الطلبات', rows.length, 'info'));
    table('breakRequestHistory', [{ title: 'الموظف', get: r => r.employee }, { title: 'التحويلة', get: r => r.extension }, { title: 'المدة المطلوبة', get: r => r.requestedMinutes, show: r => r.requestedMinutes + ' دقيقة' },
      { title: 'وقت الطلب', get: r => r.createdAt, show: r => stamp(r.createdAt) }, { title: 'الحالة', get: r => BREAK_REQUEST_STATUS[r.status] || r.status }, { title: 'القرار', get: requestActions }, { title: 'اتخذ القرار', get: r => r.decidedBy || '—' }], rows, { empty: 'مفيش طلبات بريك إضافي اليوم' });
    } finally { requestsBusy = false; }
  }

  // ---------- ملخص اليوم ----------
  async function renderDay() {
    const d = await dayData(), hd = d.history, r = hd.report;
    $('dayNote').textContent = (r ? 'فترة التشغيل ' + periodLabel() + ' من 9 ص لحد 9 ص اليوم اللي بعده (التشغيل لحد 3 الفجر) · آخر سحب للسجل ' + stamp(r.importedAt) + (r.verifiedTotal ? '' : ' · السجل غير مكتمل التحقق') + (r.missingCalendarDates?.length ? ' · ناقص سجل يوم ' + r.missingCalendarDates.join('، ') : '') : 'مفيش سجل أرابيكس محفوظ لليوم ده؛ أرقام المكالمات والانتظار هتظهر لما الموصل يسحب السجل.');
    $('dayCards').replaceChildren(...(r ? [kpi('مكالمات محتسبة', r.calls, 'info', r.shortAbandoned + ' فائتة قصيرة ≤7ث مش محسوبة'), kpi('تم الرد', r.answered, 'good'), kpi('فائتة محتسبة', r.abandoned, r.abandoned ? toneLow(r.abandonmentRate, 5, 10) : 'good'),
      kpi('الرد خلال 10 ث', pct(r.sla), toneHigh(r.sla, 80, 60)), kpi('متوسط انتظار الرد', secs(r.asa), toneLow(r.asa, 10, 20)), kpi('نسبة الفائتة', pct(r.abandonmentRate), toneLow(r.abandonmentRate, 5, 10)),
      kpi('متوسط مدة المكالمة', dur(r.meanCallSeconds)), kpi('خارج ساعات العمل', r.afterHours)] : []));
    const e = d.employees, sum = k => e.reduce((n, x) => n + (x[k] || 0), 0);
    const overBreak = e.filter(x => (x.overBreakDays ?? (x.breakSeconds > 1800 ? 1 : 0)) > 0).length;
    $('teamCards').replaceChildren(kpi('موظفين اشتغلوا', e.length, 'info'), kpi('إجمالي ساعات العمل', dur(sum('workSeconds'))), kpi('وقت المكالمات', dur(sum('callSeconds')), 'on_call'), kpi('وقت المتاح', dur(sum('readySeconds')), 'ready'),
      kpi('إجمالي البريك', dur(sum('breakSeconds')), 'break', overBreak ? overBreak + ' موظف عدّى 30 دقيقة في يوم واحد على الأقل' : ''), kpi('برّه التحويلة — للتوضيح بس', dur(e.reduce((n, x) => n + outTotal(x), 0)), 'unknown', outDetail({ gapSeconds: sum('gapSeconds'), outArabicssSeconds: sum('outArabicssSeconds'), outExtensionSeconds: sum('outExtensionSeconds'), outBrowserSeconds: sum('outBrowserSeconds') }) || 'مش داخل في أي حساب'),
      kpi('مكالمات من غير موظف مسجل', (hd.unattributed || []).length, (hd.unattributed || []).length ? 'bad' : 'good'));
    C.slots($('dayChart'), d.slots.filter(x => x.operating));
    const qs = (hd.queues || []).filter(q => q.calls), maxQ = Math.max(1, ...qs.map(q => q.calls));
    $('queueBars').replaceChildren(h('div', { className: 'ranks' }, ...qs.sort((a, b) => b.calls - a.calls).map(q => h('div', { className: 'r' }, h('span', { textContent: q.label + ' · ' + q.calls + ' مكالمة' }), h('small', { className: 'muted', textContent: 'رد خلال 10ث ' + pct(q.sla) + ' · فائتة ' + q.abandoned }), C.meter(q.calls, maxQ)))));
    table('queueTable', queueColumns, hd.queues || []);
    const rank = (title, list, value, show, color) => { const max = Math.max(1, ...list.map(value)); return [h('h3', { textContent: title }), !list.length ? h('p', { className: 'muted', textContent: 'مفيش لسه' }) : h('div', { className: 'ranks' }, ...list.map(x => h('div', { className: 'r' }, h('span', { textContent: x.name }), h('b', { textContent: show(x) }), C.meter(value(x), max, color))))]; };
    const top = (k, n = 5) => [...e].filter(x => x[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n);
    $('dayRanks').replaceChildren(...rank('أكتر مكالمات', top('calls'), x => x.calls, x => x.calls, 'var(--call)'), ...rank('أطول بريك', top('breakSeconds'), x => x.breakSeconds, x => dur(x.breakSeconds), 'var(--break)'),
      ...rank('أكتر وقت برّه التحويلة (للتوضيح)', [...e].filter(x => outTotal(x) > 0).sort((a, b) => outTotal(b) - outTotal(a)).slice(0, 5), outTotal, x => dur(outTotal(x)), 'var(--unknown)'));
  }

  // ---------- على مدار اليوم ----------
  const slotColumns = [
    { title: 'من', get: x => x.start, show: x => hm(x.start), type: 'datetime' }, { title: 'مكالمات محتسبة', get: x => x.calls, type: 'number' }, { title: 'تم الرد', get: x => x.answered, type: 'number' },
    { title: 'فائتة محتسبة', get: x => x.abandoned, type: 'number', cls: x => x.abandoned ? 'bad' : '' }, { title: 'فائتة قصيرة', get: x => x.shortAbandoned, type: 'number' },
    { title: 'الرد خلال 10 ث', get: x => x.sla, show: x => pct(x.sla), type: 'percent', cls: x => x.sla != null && x.sla < 60 ? 'bad' : x.sla != null && x.sla < 80 ? 'warn' : '' },
    { title: 'متوسط الانتظار (ث)', get: x => x.asa == null ? null : Math.round(x.asa * 10) / 10, type: 'number' },
    { title: 'متوسط المتاحين', get: x => x.ready, type: 'number', cls: x => x.calls && x.ready < 1 ? 'bad' : '' }, { title: 'متوسط في مكالمة', get: x => x.onCall, type: 'number' }, { title: 'متوسط في بريك', get: x => x.onBreak, type: 'number' },
    { title: 'أقصى منتظرين', get: x => x.waitingMax, type: 'number' }];
  const hourRows = d => d.slots.filter(x => $('hoursAll').checked || x.operating);
  async function renderHours() {
    const d = await dayData(), list = hourRows(d);
    C.slots($('hoursChart'), list);
    const op = list.filter(x => x.operating && x.calls), peak = [...op].sort((a, b) => b.calls - a.calls)[0], worst = [...op].filter(x => x.sla != null).sort((a, b) => a.sla - b.sla)[0];
    const thin = op.filter(x => x.ready < 1).length, missedSlots = op.filter(x => x.abandoned).length, slot = x => x ? hm(x.start) : '—';
    $('hoursCards').replaceChildren(kpi('أعلى نص ساعة ضغط', peak ? peak.calls + ' مكالمة' : '—', 'info', peak ? 'من ' + slot(peak) : ''), kpi('أقل رد خلال 10 ث', worst ? pct(worst.sla) : '—', worst ? toneHigh(worst.sla, 80, 60) : '', worst ? 'من ' + slot(worst) : ''),
      kpi('نص ساعات فيها فائتة', missedSlots, missedSlots ? 'warn' : 'good'), kpi('نص ساعات المتاحين فيها أقل من واحد', thin, thin ? 'bad' : 'good', 'في وقت فيه مكالمات'),
      kpi('أقصى متوسط في بريك مع بعض', op.length ? Math.max(...op.map(x => x.onBreak)) : '—', op.some(x => x.onBreak >= 2) ? 'warn' : ''));
    table('hoursTable', slotColumns, list);
  }
  $('hoursAll').onchange = () => renderHours().catch(showError);

  const queueColumns = [
    { title: 'نوع الطلب', get: q => q.label }, { title: 'رقم القائمة', get: q => q.queue },
    { title: 'محتسبة', get: q => q.calls, type: 'number' }, { title: 'تم الرد', get: q => q.answered, type: 'number' }, { title: 'فائتة', get: q => q.abandoned, type: 'number' },
    { title: 'الرد خلال 10 ث', get: q => q.sla, show: q => pct(q.sla), type: 'percent' }, { title: 'متوسط الانتظار (ث)', get: q => q.asa == null ? null : Math.round(q.asa * 10) / 10, type: 'number' },
    { title: 'نسبة الفائتة', get: q => q.abandonmentRate, show: q => pct(q.abandonmentRate), type: 'percent' }];

  // ---------- الموظفون ----------
  const teamRows = d => d.employees.map(e => ({ id: e.employeeId, name: e.name, calls: e.calls, answered: e.answered, aht: e.averageCallSeconds, work: e.workSeconds, ready: e.readySeconds,
    onCall: e.callSeconds, unknown: outTotal(e), outDetail: outDetail(e), breakSeconds: e.breakSeconds, breakCount: e.breakCount, overBreakDays: e.overBreakDays, fromHistory: e.fromHistory, firstLogin: e.firstLogin, lastLogout: e.lastLogout }));
  const teamColumns = [
    { title: 'الموظف', get: r => r.name }, { title: 'توزيع الوقت (نسبة الانشغال من وقت الشغل)', get: r => r.onCall + r.ready ? Math.round(r.onCall / (r.onCall + r.ready) * 100) : null, show: r => C.usage([{ state: 'ready', value: r.ready, label: 'متاح ' + dur(r.ready) }, { state: 'on_call', value: r.onCall, label: 'في مكالمة ' + dur(r.onCall) }, { state: 'break', value: r.breakSeconds, label: 'بريك ' + dur(r.breakSeconds) }]) },
    { title: 'نسبة الانشغال', get: r => r.onCall + r.ready ? Math.round(r.onCall / (r.onCall + r.ready) * 100) : null, show: r => r.onCall + r.ready ? Math.round(r.onCall / (r.onCall + r.ready) * 100) + '%' : '—', type: 'percent' },
    { title: 'مكالمات', get: r => r.calls, type: 'number' }, { title: 'تم الرد', get: r => r.answered, type: 'number' }, { title: 'منها من سجل أرابيكس', get: r => r.fromHistory, type: 'number' },
    { title: 'متوسط مدة المكالمة', get: r => r.aht, show: r => dur(r.aht), type: 'duration' }, { title: 'مدة العمل', get: r => r.work, show: r => dur(r.work), type: 'duration' },
    { title: 'متاح', get: r => r.ready, show: r => dur(r.ready), type: 'duration' }, { title: 'في مكالمة', get: r => r.onCall, show: r => dur(r.onCall), type: 'duration' },
    { title: 'برّه التحويلة (للتوضيح — مش محسوب)', get: r => r.unknown, show: r => r.unknown ? h('span', { title: r.outDetail }, dur(r.unknown), h('small', { className: 'muted', textContent: ' ' + r.outDetail })) : '—', type: 'duration' },
    { title: 'البريك', get: r => r.breakSeconds, show: r => (r.overBreakDays ?? (r.breakSeconds > 1800 ? 1 : 0)) > 0 ? pill(dur(r.breakSeconds), 'warn') : dur(r.breakSeconds), type: 'duration' }, { title: 'عدد البريكات', get: r => r.breakCount, type: 'number' },
    { title: 'أول دخول', get: r => r.firstLogin, show: r => clock(r.firstLogin), type: 'datetime' }, { title: 'آخر خروج', get: r => r.lastLogout, show: r => clock(r.lastLogout), type: 'datetime' }];
  async function renderTeam() {
    const d = await dayData(), rows = teamRows(d);
    const busy = rows.filter(r => r.onCall + r.ready > 0).map(r => r.onCall / (r.onCall + r.ready) * 100);
    const answered = d.employees.reduce((n,e) => n + (e.answered || 0), 0);
    const teamAht = answered ? d.employees.reduce((n,e) => n + (e.talkSeconds || 0), 0) / answered : null;
    const topCalls = [...rows].sort((a, b) => b.calls - a.calls)[0], overBreak = rows.filter(r => (r.overBreakDays ?? (r.breakSeconds > 1800 ? 1 : 0)) > 0).length, gaps = rows.filter(r => r.unknown > 900).length;
    $('teamViewCards').replaceChildren(kpi('موظفين اشتغلوا', rows.length, 'info'), kpi('متوسط نسبة الانشغال', busy.length ? Math.round(avg(busy)) + '%' : '—', '', 'وقت المكالمات ÷ (المكالمات + المتاح)'),
      kpi('متوسط مدة المكالمة', dur(teamAht)), kpi('أكتر واحد مكالمات', topCalls ? topCalls.calls : '—', 'on_call', topCalls?.name || ''),
      kpi('عدّوا الـ 30 دقيقة بريك', overBreak, overBreak ? 'bad' : 'good'), kpi('برّه التحويلة أكتر من 15 د', gaps, gaps ? 'warn' : 'good', 'للتوضيح بس'));
    table('teamTable', teamColumns, rows, { onRow: r => { state.profile = r.id; show('profile'); } });
  }

  // ---------- ملف الموظف ----------
  const stateLabel = s => ['offline', 'unknown'].includes(s.state) && s.outKind ? OUT[s.outKind] : STATE[s.state] || s.state;
  const segmentsOf = (d, id) => d.states.filter(s => s.employeeId === id).map(s => ({ from: ms(s.startedAt), to: ms(s.endedAt), state: s.state === 'offline' ? 'unknown' : s.state, label: stateLabel(s) }));
  const profileTables = {};
  async function renderProfile() {
    const d = await dayData();
    const list = [...d.employees].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    if (!list.some(e => e.employeeId === state.profile)) state.profile = list[0]?.employeeId ?? null;
    $('profileEmployee').replaceChildren(...list.map(e => h('option', { value: e.employeeId, textContent: e.name, selected: e.employeeId === state.profile })));
    const body = $('profileBody');
    const e = list.find(x => x.employeeId === state.profile);
    if (!e) { body.replaceChildren(h('p', { className: 'muted', textContent: 'مفيش موظفين اشتغلوا في اليوم ده.' })); return; }
    const busy = e.callSeconds + e.readySeconds ? Math.round(e.callSeconds / (e.callSeconds + e.readySeconds) * 100) : null;
    const ses = d.sessions.filter(s => s.employeeId === e.employeeId && s.workStartedAt != null);
    const states = d.states.filter(s => s.employeeId === e.employeeId && s.durationSeconds >= 1).map(s => s.outsideHours ? { ...s, state: s.state + '_night' } : s).sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
    const breaks = d.states.filter(b => b.employeeId === e.employeeId && b.state === 'break').sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
    const calls = d.calls.filter(c => c.employeeId === e.employeeId);
    const parts = { cards: h('div', { className: 'cards' }), line: h('div'), sessions: h('div'), breaks: h('div'), states: h('div'), calls: h('div') };
    parts.cards.append(kpi('مكالمات', e.calls, 'info', e.fromHistory ? e.fromHistory + ' منها من سجل أرابيكس' : ''), kpi('متوسط مدة المكالمة', dur(e.averageCallSeconds), '', e.longCalls ? e.longCalls + ' مكالمة أطول من 4 دقايق' : ''), kpi('مدة العمل', dur(e.workSeconds)),
      kpi('متاح', dur(e.readySeconds), 'ready'), kpi('في مكالمة', dur(e.callSeconds), 'on_call'), kpi('نسبة الانشغال', busy == null ? '—' : busy + '%', '', 'وقت المكالمات ÷ (المكالمات + المتاح)'),
      kpi('البريك', dur(e.breakSeconds), (e.overBreakDays ?? (e.breakSeconds > 1800 ? 1 : 0)) > 0 ? 'bad' : 'break', e.breakCount + ' بريك'), kpi('برّه التحويلة — للتوضيح', dur(outTotal(e)), outTotal(e) > 900 ? 'warn' : '', outDetail(e) || 'مش داخل في أي حساب'), kpi('أول دخول', clock(e.firstLogin)), kpi('آخر خروج', clock(e.lastLogout)));
    const w = d.window;
    // Zoomed to this employee's own hours, on the half hour.
    const segs = segmentsOf(d, e.employeeId), H = 1800000;
    const from = segs.length ? Math.max(ms(w.start), Math.floor((Math.min(...segs.map(x => x.from)) - H) / H) * H) : ms(w.start);
    const to = segs.length ? Math.min(ms(w.end), Math.ceil((Math.max(...segs.map(x => x.to)) + H) / H) * H) : ms(w.operatingEnd);
    C.timeline(parts.line, [{ name: e.name, segments: segs }], from, to);
    body.replaceChildren(parts.cards, h('article', { className: 'panel' }, h('h2', { textContent: 'خط اليوم' }), parts.line), h('div', { className: 'two' },
      h('article', { className: 'panel' }, h('h2', { textContent: 'الجلسات' }), parts.sessions), h('article', { className: 'panel' }, h('h2', { textContent: 'البريكات' }), parts.breaks)),
      h('article', { className: 'panel' }, h('h2', { textContent: 'المكالمات' }), parts.calls), h('article', { className: 'panel' }, h('h2', { textContent: 'كل الحالات خلال اليوم' }), parts.states));
    profileTables.sessions = [sessionColumns, ses]; profileTables.breaks = [breakColumns.slice(1), breaks]; profileTables.calls = [callColumns.slice(1), calls]; profileTables.states = [stateColumns, states];
    table(parts.sessions, sessionColumns.slice(1), ses);
    table(parts.breaks, breakColumns.slice(1), breaks, { empty: 'مفيش بريك' });
    table(parts.calls, callColumns.slice(1), calls, { empty: 'مفيش مكالمات' });
    table(parts.states, stateColumns, states);
    // The same person's orders on Apex (via «توحيد الأسماء مع Apex»), entry errors and Talabat entry speed.
    const ordersBox = h('div');
    body.append(h('article', { className: 'panel' }, h('h2', { textContent: 'الأوردرات اللي ضربها' }), ordersBox));
    INS.employeeOrders(e.name, ordersBox);
  }
  $('profileEmployee').onchange = () => { state.profile = Number($('profileEmployee').value); renderProfile().catch(showError); };
  const stateColumns = [{ title: 'الحالة', get: s => { const night = /_night$/.test(s.state), base = { ...s, state: s.state.replace(/_night$/, '') };
    return (night ? stateLabel(base) + ' (بعد 3 الفجر)' : stateLabel(base)) + (['offline', 'unknown'].includes(base.state) ? ' — للتوضيح، مش محسوب' : ''); } }, { title: 'من', get: s => s.startedAt, show: s => clock(s.startedAt), type: 'datetime' }, { title: 'إلى', get: s => s.endedAt, show: s => clock(s.endedAt), type: 'datetime' }, { title: 'المدة', get: s => s.durationSeconds, show: s => dur(s.durationSeconds), type: 'duration' }];
  const sessionColumns = [{ title: 'الموظف', get: s => name(s.employeeId) }, { title: 'التحويلة', get: s => s.extension }, { title: 'البداية', get: s => s.workStartedAt ?? s.startedAt, show: s => stamp(s.workStartedAt ?? s.startedAt), type: 'datetime' },
    { title: 'النهاية', get: s => s.endedAt || s.observedThrough, show: s => s.running ? 'شغالة' : stamp(s.endedAt || s.observedThrough), type: 'datetime' },
    { title: 'المدة في اليوم', get: s => s.daySeconds, show: s => dur(s.daySeconds), type: 'duration' }, { title: 'انتهت إزاي', get: s => s.running ? 'شغالة' : s.closureKnown ? REASON[s.reason] || s.reason : 'من غير خروج مسجل — محسوبة لحد آخر حالة' }];
  const breakColumns = [{ title: 'الموظف', get: b => name(b.employeeId) }, { title: 'من', get: b => b.startedAt, show: b => clock(b.startedAt), type: 'datetime' }, { title: 'إلى', get: b => b.endedAt, show: b => b.running ? 'لسه في بريك' : clock(b.endedAt), type: 'datetime' },
    { title: 'المدة', get: b => b.durationSeconds, show: b => b.durationSeconds > 1200 ? pill(dur(b.durationSeconds), 'warn') : dur(b.durationSeconds), type: 'duration' }, { title: 'ملاحظة', get: b => b.outsideHours ? 'بعد 3 الفجر' : '' }];

  // ---------- الحضور والبريك ----------
  const att = {};
  async function renderAttendance() {
    const d = await dayData(), w = d.window;
    const people = [...new Set([...d.employees.map(e => e.employeeId), ...d.sessions.filter(s => s.workStartedAt != null).map(s => s.employeeId)])];
    const rows = people.map(id => ({ id, name: name(id), segments: segmentsOf(d, id) })).filter(r => r.segments.length).sort((a, b) => Math.min(...a.segments.map(x => x.from)) - Math.min(...b.segments.map(x => x.from)));
    C.timeline($('dayTimeline'), rows, ms(w.start), Math.max(ms(w.operatingEnd), ...rows.flatMap(r => r.segments.map(x => Math.min(x.to, ms(w.end))))), { onName: r => { state.profile = r.id; show('profile'); } });
    const breaks = d.states.filter(s => s.state === 'break').sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
    att.totals = d.employees.filter(e => e.breakSeconds || e.breakCount).map(e => { const mine = breaks.filter(b => b.employeeId === e.employeeId); return { name: e.name, count: e.breakCount, total: e.breakSeconds, over: e.overBreakDays ?? (e.breakSeconds > 1800 ? 1 : 0), allowance: 1800 * (e.daysWorked || 1), longest: Math.max(0, ...mine.map(b => b.durationSeconds)), running: e.ongoingBreakSeconds }; }).sort((a, b) => b.total - a.total);
    const brk = breaks.filter(b => !b.outsideHours), longest = brk.reduce((m, b) => b.durationSeconds > (m?.durationSeconds || 0) ? b : m, null);
    const unknownLogout = d.sessions.filter(s => s.workStartedAt != null && !s.running && !s.closureKnown).length;
    $('attendanceCards').replaceChildren(kpi('موظفين حضروا', rows.length, 'info'), kpi('عدد البريكات', brk.length, 'break'), kpi('إجمالي البريك', dur(brk.reduce((n, b) => n + b.durationSeconds, 0)), 'break'),
      kpi('عدّوا الـ 30 دقيقة', att.totals.filter(x => x.over > 0).length, att.totals.some(x => x.over > 0) ? 'bad' : 'good'), kpi('أطول بريك', longest ? dur(longest.durationSeconds) : '—', longest && longest.durationSeconds > 1200 ? 'warn' : '', longest ? name(longest.employeeId) : ''),
      kpi('جلسات خلصت من غير خروج مسجل', unknownLogout, unknownLogout ? 'warn' : 'good'));
    table('breakTotals', att.totalColumns = [{ title: 'الموظف', get: x => x.name }, { title: 'عدد البريكات', get: x => x.count, type: 'number' }, { title: 'الإجمالي', get: x => x.total, show: x => x.over > 0 ? pill(dur(x.total), 'bad') : dur(x.total), type: 'duration' },
      { title: 'أطول بريك', get: x => x.longest, show: x => x.longest > 1200 ? pill(dur(x.longest), 'warn') : dur(x.longest), type: 'duration' }, { title: 'من المسموح في الفترة', get: x => Math.round(x.total / x.allowance * 100) , show: x => C.meter(x.total, x.allowance, x.over > 0 ? 'var(--bad)' : 'var(--break)') }], att.totals, { empty: 'مفيش بريك' });
    // Moments with two or more on break at once, and how many were available then.
    const marks = breaks.filter(b => !b.outsideHours).flatMap(b => [[ms(b.startedAt), 1, b.employeeId], [ms(b.endedAt), -1, b.employeeId]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const on = new Map(), overlaps = [];
    let open = null;
    for (const [t, k, id] of marks) {
      if (open && on.size < 2) open = null;
      on.set(id, (on.get(id) || 0) + k); if (on.get(id) <= 0) on.delete(id);
      if (on.size >= 2 && !open) { open = { from: t, people: new Set(on.keys()), max: on.size }; overlaps.push(open); }
      else if (open) { for (const x of on.keys()) open.people.add(x); open.max = Math.max(open.max, on.size); if (on.size < 2) { open.to = t; open = null; } }
    }
    att.overlaps = overlaps.filter(o => o.to && o.to - o.from >= 60000).map(o => {
      const mid = (o.from + o.to) / 2, ready = new Set(d.states.filter(s => s.state === 'ready' && ms(s.startedAt) <= mid && mid < ms(s.endedAt)).map(s => s.employeeId)).size;
      return { from: new Date(o.from).toISOString(), to: new Date(o.to).toISOString(), seconds: (o.to - o.from) / 1000, max: o.max, names: [...o.people].map(name).join('، '), ready };
    });
    table('breakOverlaps', att.overlapColumns = [{ title: 'من', get: o => o.from, show: o => clock(o.from), type: 'datetime' }, { title: 'إلى', get: o => o.to, show: o => clock(o.to), type: 'datetime' }, { title: 'المدة', get: o => o.seconds, show: o => dur(o.seconds), type: 'duration' },
      { title: 'في بريك مع بعض', get: o => o.max, type: 'number', cls: o => o.max >= 3 ? 'bad' : 'warn' }, { title: 'متاحين وقتها', get: o => o.ready, type: 'number', cls: o => o.ready < 2 ? 'bad' : '' }, { title: 'مين', get: o => o.names, cls: () => 'wrap' }], att.overlaps, { empty: 'مفيش بريكات اتقابلت' });
    att.breaks = breaks;
    table('breakList', breakColumns, breaks, { empty: 'مفيش بريك' });
    att.sessions = d.sessions.filter(s => s.workStartedAt != null).sort((a, b) => (a.workStartedAt ?? 0) - (b.workStartedAt ?? 0));
    table('sessionList', sessionColumns, att.sessions);
  }

  // ---------- نهاية الشيفت ----------
  const DECISION = { include: 'محسوب عليه (خرج قبل ميعاده)', exclude: 'الشيفت خلص فعلًا' };
  const shiftColumns = [...sessionColumns, { title: 'قرار المشرف', get: s => s.decision ? DECISION[s.decision.action] + ' — ' + s.decision.note : '', show: s => s.decision ? h('span', {}, pill(DECISION[s.decision.action], s.decision.action === 'include' ? 'warn' : 'ok'), ' ' + s.decision.note + ' · ' + (s.decision.decidedBy || '')) : s.running || s.closureKnown ? '—' : pill('مستني قرار', 'info') }];
  let shiftRows = [];
  async function renderShifts() {
    const d = await dayData();
    shiftRows = d.sessions.filter(s => s.workStartedAt != null).sort((a, b) => (a.workStartedAt ?? 0) - (b.workStartedAt ?? 0));
    const cols = canWrite() ? [...shiftColumns, { title: '', get: () => '', show: s => s.running ? '' : h('span', { className: 'inline' }, btn('محسوب عليه', () => decide(s, 'include')), btn('الشيفت خلص', () => decide(s, 'exclude'))) }] : shiftColumns;
    table('shiftTable', cols, shiftRows);
    const ended = shiftRows.filter(s => !s.running), open = ended.filter(s => !s.closureKnown && !s.decision);
    // Same extension, one employee after another.
    const byExt = new Map();
    for (const s of shiftRows) if (s.extension) { if (!byExt.has(s.extension)) byExt.set(s.extension, []); byExt.get(s.extension).push(s); }
    const hand = [];
    for (const [ext, list] of byExt) for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (a.employeeId === b.employeeId) continue;
      const end = ms(a.endedAt || a.observedThrough), start = b.workStartedAt;
      hand.push({ ext, prev: name(a.employeeId), end, next: name(b.employeeId), start, gap: (start - end) / 1000, open: a.running });
    }
    table('handoverTable', [{ title: 'التحويلة', get: x => x.ext }, { title: 'الموظف السابق', get: x => x.prev }, { title: 'خرج', get: x => x.end, show: x => x.open ? 'لسه شغال' : clock(new Date(x.end).toISOString()), type: 'datetime' },
      { title: 'الموظف التالي', get: x => x.next }, { title: 'دخل', get: x => x.start, show: x => clock(new Date(x.start).toISOString()), type: 'datetime' },
      { title: 'الفرق', get: x => x.gap, show: x => x.open || x.gap < 0 ? pill('اتنين على نفس التحويلة في نفس الوقت', 'bad') : dur(x.gap), type: 'duration' }], hand, { empty: 'مفيش تبديل على نفس التحويلة' });
    const clash = hand.filter(x => x.open || x.gap < 0).length;
    $('shiftCards').replaceChildren(kpi('جلسات', shiftRows.length, 'info', shiftRows.filter(s => s.running).length + ' شغالة دلوقتي'), kpi('خلصت بخروج مسجل', ended.filter(s => s.closureKnown).length, 'good'),
      kpi('مستنية قرار', open.length, open.length ? 'warn' : 'good', 'خلصت من غير خروج مسجل'), kpi('قرارات اتاخدت', ended.filter(s => s.decision).length),
      kpi('اتنين على تحويلة واحدة', clash, clash ? 'bad' : 'good'), kpi('تبديل على نفس التحويلة', hand.length));
  }
  async function decide(s, action) {
    const note = prompt((action === 'include' ? 'الجلسة دي هتتحسب عليه (خرج قبل ميعاده).' : 'تأكيد إن الشيفت خلص.') + ' اكتب السبب:');
    if (!note || !note.trim()) return;
    try { await api('/api/shifts', { method: 'POST', body: { action, note: note.trim(), sessionId: Number(s.id), employeeId: s.employeeId, requestId: crypto.randomUUID() } }); await dayData(true); renderShifts(); } catch (e) { alert(e.message); }
  }

  // ---------- المكالمات ----------
  const callColumns = [
    { title: 'الموظف', get: c => c.employee || name(c.employeeId) }, { title: 'التحويلة', get: c => c.extension }, { title: 'الرقم', get: c => c.phone },
    { title: 'البداية', get: c => c.startedAt, show: c => stamp(c.startedAt), type: 'datetime' },
    { title: 'المدة', get: c => c.complete ? c.durationSeconds : null, show: c => c.complete ? dur(c.durationSeconds) : 'بدون نهاية مسجلة', type: 'duration' },
    { title: 'المصدر', get: c => c.source === 'history' ? 'من سجل أرابيكس' : c.source === 'manual' ? 'اتنسبت يدوي' + (c.assignedBy ? ' — ' + c.assignedBy : '') : 'الإضافة' },
    { title: 'ملاحظة', get: c => c.outsideHours ? 'خارج ساعات التشغيل' : '' }];
  function filteredCalls(d) {
    const q = $('callSearch').value.trim(), emp = $('callEmployee').value, st = $('callStatus').value;
    return d.calls.filter(c => (!emp || c.employeeId === Number(emp)) && (!st || (st === 'complete') === c.complete) && (!q || (name(c.employeeId) + ' ' + c.phone).includes(q)));
  }
  async function renderCalls() {
    const d = await dayData(), list = filteredCalls(d), done = list.filter(c => c.complete);
    $('callsNote').textContent = list.length + ' مكالمة · متوسط المدة ' + dur(done.length ? done.reduce((n, c) => n + c.durationSeconds, 0) / done.length : null);
    table('callsTable', callColumns, list);
    const filtered = $('callSearch').value.trim() || $('callEmployee').value || $('callStatus').value;
    const r = d.history.report, longCalls = done.filter(c => c.durationSeconds > 240).length, outgoing = list.filter(c => c.callType === 'outgoing').length;
    // The totals: the same numbers as the day summary (Arabicss record); with a filter, the filtered calls.
    $('callsCards').replaceChildren(...(r && !filtered ? [
      kpi('إجمالي المكالمات', r.calls, 'info', 'نفس رقم ملخص اليوم'), kpi('اترد عليها', r.answered, 'good'),
      kpi('فائتة', r.abandoned, r.abandoned ? toneLow(r.abandonmentRate, 5, 10) : 'good', 'نسبة الفائتة ' + pct(r.abandonmentRate)),
      kpi('صادرة', outgoing), kpi('متوسط مدة المكالمة', dur(r.meanCallSeconds)), kpi('أطول من 4 دقايق', longCalls, longCalls ? 'warn' : ''),
      kpi('فائتة قصيرة ≤7 ث', r.shortAbandoned, '', 'مش محسوبة'), kpi('خارج ساعات العمل', r.afterHours)
    ] : [
      kpi('المكالمات', list.length, 'info', filtered ? 'حسب الفلتر' : ''), kpi('اترد عليها', done.length, 'good'), kpi('صادرة', outgoing),
      kpi('متوسط المدة', dur(avg(done.map(c => c.durationSeconds)))), kpi('أطول من 4 دقايق', longCalls, longCalls ? 'warn' : '')
    ]));
    C.bars($('callsChart'), hourly(list, c => cairoHour(c.startedAt), g => ({ inc: g.filter(c => c.callType !== 'outgoing').length, out: g.filter(c => c.callType === 'outgoing').length })),
      [{ key: 'inc', label: 'واردة', color: '--call' }, { key: 'out', label: 'صادرة', color: '--accent' }]);
    const per = new Map(); for (const c of list) { const k = c.employeeId; const x = per.get(k) || { name: c.employee || name(k), calls: 0, talk: 0 }; x.calls++; if (c.complete) x.talk += c.durationSeconds; per.set(k, x); }
    $('callsRanks').replaceChildren(rankList([...per.values()].sort((a, b) => b.calls - a.calls).slice(0, 8), x => x.calls, x => x.calls + ' · ' + dur(x.talk), 'var(--call)'));
    renderUnattributed(d);
  }

  // Answered calls nobody was signed in for: grouped into stretches (same extension, < 30 min apart), each with the
  // most likely employee from the day's data, assignable in one click (the whole stretch or call by call).
  const CONF = { high: ['ثقة عالية', 'ok'], medium: ['ثقة متوسطة', 'info'], low: ['ثقة ضعيفة', 'warn'], none: ['مفيش ترشيح', ''] };
  function renderUnattributed(d) {
    const u = d.history.unattributed || [], done = d.history.assigned || [];
    $('unattributedNote').textContent = u.length ? u.length + ' مكالمة اترد عليها في أرابيكس وقت ما مكانش فيه موظف مسجل في المرصد على التحويلة. المرصد رشّح مين غالبًا ردّ عليها من شغل اليوم (مين كان على التحويلة قبلها أو بعدها، ومين كان برّه أو منقطع وقتها، ومين مستحيل يكون هو لأنه كان شغال على تحويلة تانية). اختار وانسب.'
      : done.length ? 'كل المكالمات اتنسبت.' : 'كل المكالمات المردود عليها في سجل أرابيكس معروف مين ردّ عليها.';
    const groups = new Map(); for (const x of u) { const k = (x.businessDate || '') + ':' + x.group; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const assign = async (keys, employeeId, btn) => {
      if (!employeeId) return alert('اختار الموظف');
      btn.disabled = true; btn.textContent = 'جارٍ النسب…';
      try { await api('/api/call-assignments', { method: 'POST', body: { action: 'assign', keys, employeeId: Number(employeeId) } }); await dayData(true); await renderCalls(); }
      catch (e) { btn.disabled = false; btn.textContent = 'تعذر: ' + e.message; }
    };
    const picker = sug => {
      const sel = h('select', { ariaLabel: 'الموظف' }, h('option', { value: '', textContent: 'اختار الموظف…' }));
      if (sug.length) sel.append(h('optgroup', { label: 'المرشحين' }, ...sug.map(x => h('option', { value: x.employeeId, textContent: x.name }))));
      sel.append(h('optgroup', { label: 'كل الموظفين' }, ...state.employees.filter(e => e.active && !sug.some(x => x.employeeId === e.id)).map(e => h('option', { value: e.id, textContent: e.name }))));
      if (sug[0]) sel.value = String(sug[0].employeeId);
      return sel;
    };
    const cards = [...groups.values()].map(items => {
      const g = items[0], sug = g.suggestions || [], [cl, ck] = CONF[g.confidence || 'none'];
      const sel = picker(sug), all = h('button', { type: 'button', textContent: items.length > 1 ? 'انسب الـ ' + items.length + ' مكالمات' : 'انسب المكالمة' });
      all.onclick = () => assign(items.map(x => x.key), sel.value, all);
      const head = h('div', { className: 'inline' }, h('strong', { textContent: (g.extension ? 'تحويلة ' + g.extension : 'من غير تحويلة') + ' · ' + (items.length > 1 ? 'من ' + ampm(g.groupFrom) + ' لـ ' + ampm(g.groupTo) + ' · ' + items.length + ' مكالمات' : ampm(g.time)) + (g.businessDate ? ' · ' + g.businessDate : '') }), pill(cl, ck));
      const why = sug.length ? h('div', { className: 'stack' }, ...sug.map((x, n) => h('small', { className: n ? 'muted' : '', textContent: (n ? '' : '⭐ ') + x.name + ': ' + x.reasons.join(' · ') + (x.conflicts ? ' — بس كان شغال على تحويلة تانية وقت ' + x.conflicts + ' منهم' : '') })))
        : h('small', { className: 'muted', textContent: 'مفيش حد اشتغل على التحويلة دي ولا كان برّه وقتها؛ اختار يدوي.' });
      const list = h('details', {}, h('summary', { textContent: 'المكالمات (' + items.length + ') — تقدر تنسب كل واحدة لوحدها' }),
        ...items.map(x => { const one = picker(sug), b = h('button', { type: 'button', className: 'ghost', textContent: 'انسب' }); b.onclick = () => assign([x.key], one.value, b);
          return h('div', { className: 'inline' }, h('span', { textContent: ampm(x.time) + ' · ' + x.phone + ' · ' + QUEUE(x.queue) }), canWrite() ? one : '', canWrite() ? b : ''); }));
      return h('div', { className: 'panel' }, head, why, canWrite() ? h('div', { className: 'inline' }, sel, all) : '', list);
    });
    const undo = async (keys, btn) => { btn.disabled = true; try { await api('/api/call-assignments', { method: 'POST', body: { action: 'remove', keys } }); await dayData(true); await renderCalls(); } catch (e) { btn.disabled = false; btn.textContent = e.message; } };
    const doneBox = h('div');
    if (done.length) table(doneBox, [{ title: 'الوقت', get: x => ampm(x.time) }, { title: 'الرقم', get: x => x.phone }, { title: 'التحويلة', get: x => x.extension || '—' }, { title: 'اتنسبت لـ', get: x => x.name },
      { title: 'بواسطة', get: x => x.by + ' · ' + stamp(x.decidedAt) }, { title: '', get: () => '', show: x => { if (!canWrite()) return '—'; const b = h('button', { type: 'button', className: 'ghost', textContent: 'تراجع' }); b.onclick = () => undo([x.key], b); return b; } }], done);
    $('unattributedTable').replaceChildren(...cards, done.length ? h('h3', { textContent: 'اتنسبت يدوي — ' + done.length }) : '', doneBox);
  }

  // ---------- الفائتة ----------
  const missedColumns = [
    { title: 'الوقت', get: m => ampm(m.end || m.start) }, { title: 'الرقم', get: m => m.phone }, { title: 'نوع الطلب', get: m => m.queueLabel },
    { title: 'الانتظار', get: m => m.waitSeconds, show: m => dur(m.waitSeconds), type: 'duration' }, { title: 'التصنيف', get: m => MISSED[m.classification] || m.classification, show: m => pill(MISSED[m.classification] || m.classification, m.classification === 'counted' ? 'bad' : '') },
    { title: '', get: () => '', show: m => { const b = h('button', { className: 'ghost small', textContent: 'مين كان متاح؟' }); b.onclick = e => { e.stopPropagation(); showContext(m); }; return b; } }];
  async function renderMissed() {
    const hd = await dayHistory(), f = $('missedClass').value, all = hd.missed || [], r = hd.report;
    table('missedTable', missedColumns, all.filter(m => !f || m.classification === f), { empty: hd.report ? 'مفيش مكالمات فائتة' : 'مفيش سجل أرابيكس لليوم ده' });
    const by = k => all.filter(m => m.classification === k), counted = by('counted'), waits = counted.map(m => m.waitSeconds).filter(v => v != null);
    $('missedCards').replaceChildren(kpi('فائتة محتسبة', counted.length, counted.length ? toneLow(r?.abandonmentRate, 5, 10) : 'good', 'العميل استنى أكتر من 7 ث'), kpi('نسبة الفائتة', pct(r?.abandonmentRate), toneLow(r?.abandonmentRate, 5, 10)),
      kpi('قصيرة ≤7 ث', by('short_exempt').length, '', 'مش محسوبة'), kpi('خارج ساعات العمل', by('after_hours').length), kpi('متوسط انتظار اللي قفلوا', waits.length ? secs(avg(waits)) : '—', waits.length ? toneLow(avg(waits), 20, 40) : ''),
      kpi('أطول انتظار قبل ما يقفل', waits.length ? dur(Math.max(...waits)) : '—', waits.length && Math.max(...waits) > 60 ? 'bad' : ''));
    C.bars($('missedChart'), hourly(all.filter(m => m.classification !== 'after_hours'), m => textHour(m.end || m.start), g => ({ counted: g.filter(m => m.classification === 'counted').length, short: g.filter(m => m.classification === 'short_exempt').length })),
      [{ key: 'counted', label: 'محتسبة', color: '--bad' }, { key: 'short', label: 'قصيرة ≤7ث', color: '--muted' }]);
    const qs = new Map(); for (const m of counted) { const x = qs.get(m.queueLabel) || { name: m.queueLabel, n: 0 }; x.n++; qs.set(m.queueLabel, x); }
    $('missedQueues').replaceChildren(qs.size ? rankList([...qs.values()].sort((a, b) => b.n - a.n), x => x.n, x => x.n + ' فائتة', 'var(--bad)') : h('p', { className: 'muted', textContent: 'مفيش فائتة محتسبة' }));
  }
  async function showContext(m) {
    const dlg = $('contextDialog');
    $('contextTitle').textContent = ampm(m.end || m.start) + ' — ' + m.phone + ' — ' + m.queueLabel;
    $('contextNote').textContent = 'جارٍ المراجعة…'; $('contextTable').replaceChildren(); dlg.showModal();
    try {
      const c = await api('/api/missed?date=' + (m.businessDate || state.day) + '&index=' + m.index);
      $('contextNote').textContent = 'العميل دخل الطابور ' + clock(c.call.enteredAt) + ' وقفل ' + clock(c.call.leftAt) + ' بعد انتظار ' + dur(m.waitSeconds) + ' · ' + (c.readyCount ? c.readyCount + ' موظف كان متاح في الوقت ده' : 'مفيش موظف كان متاح')
        + (c.call.precision === 'minute' ? ' · توقيت السجل بالدقيقة، فالحالة اللي اتغيرت جوه نفس الدقيقة متعلّم عليها «غير محسومة».' : '');
      table('contextTable', [{ title: 'الموظف', get: e => e.name }, { title: 'لما العميل دخل', get: e => (STATE[e.atEntry] || e.atEntry) + (e.uncertain ? ' (غير محسومة)' : '') },
        { title: 'من بقاله', get: e => e.sinceSeconds, show: e => ['ready', 'on_call', 'break'].includes(e.atEntry) ? dur(e.sinceSeconds) : '—', type: 'duration' },
        { title: 'بقى متاح أثناء الانتظار', get: e => e.readyDuringWait ? 'أيوه من ' + clock(e.readyAt) : '—', cls: e => e.readyDuringWait ? 'warn' : '' },
        { title: 'لما العميل قفل', get: e => STATE[e.atExit] || e.atExit }, { title: 'التحويلة', get: e => e.extension || '—' }], c.employees, { empty: 'مفيش موظفين كانوا في الشيفت وقتها' });
    } catch (e) { $('contextNote').textContent = 'تعذر التحديد: ' + e.message; }
  }
  $('contextDialog').querySelector('[data-close]').onclick = () => $('contextDialog').close();

  // ---------- المتابعة والتقارير ----------
  const REVIEW = { new: ['جديدة', 'info'], in_progress: ['جاري المتابعة', 'warn'], resolved: ['اتحلت', 'ok'], reviewed: ['تمت المراجعة', ''] };
  let reviewRows = [];
  const reviewColumns = () => [{ title: 'التاريخ', get: r => r.date }, { title: 'الموضوع', get: r => r.title, cls: () => 'wrap' }, { title: 'الموظف', get: r => r.employeeId ? name(r.employeeId) : '—' },
    { title: 'الحالة', get: r => REVIEW[r.status]?.[0], show: r => !canWrite() ? pill(...REVIEW[r.status]) : (() => { const sel = h('select', { ariaLabel: 'الحالة' }, ...Object.entries(REVIEW).map(([k, [t]]) => h('option', { value: k, textContent: t, selected: k === r.status }))); sel.onclick = e => e.stopPropagation(); sel.onchange = async () => { try { await api('/api/reviews', { method: 'POST', body: { id: r.id, status: sel.value } }); renderFollowup(); } catch (e) { alert(e.message); } }; return sel; })() },
    { title: 'المسؤول', get: r => r.owner || '—' }, { title: 'الملاحظة', get: r => r.note || '', cls: () => 'wrap' }, { title: 'آخر تعديل', get: r => r.updatedAt, show: r => stamp(r.updatedAt) + (r.updatedBy ? ' · ' + r.updatedBy : ''), type: 'datetime' }];
  async function renderFollowup() {
    $('reviewForm').hidden = !canWrite(); $('saveReport').hidden = !canWrite();
    const [day, open, saved] = await Promise.all([api('/api/reviews?' + periodQuery()), api('/api/reviews?open=1'), api('/api/saved-reports?' + periodQuery())]);
    reviewRows = day.reviews;
    const st = (list, k) => list.filter(r => r.status === k).length;
    $('followupCards').replaceChildren(kpi('متابعات الفترة', day.reviews.length, 'info'), kpi('جديدة', st(day.reviews, 'new'), st(day.reviews, 'new') ? 'warn' : ''), kpi('جاري المتابعة', st(day.reviews, 'in_progress')),
      kpi('اتحلت', st(day.reviews, 'resolved') + st(day.reviews, 'reviewed'), 'good'), kpi('مفتوحة من أيام تانية', open.reviews.filter(r => r.date !== state.day).length, open.reviews.some(r => r.date !== state.day) ? 'warn' : 'good'), kpi('تقارير محفوظة', saved.reports.length));
    table('reviewTable', reviewColumns(), day.reviews, { empty: 'مفيش متابعات لليوم ده' });
    table('openReviews', reviewColumns(), open.reviews.filter(r => r.date !== state.day), { empty: 'مفيش متابعات مفتوحة' });
    table('savedReports', [{ title: 'وقت الحفظ', get: r => r.createdAt, show: r => stamp(r.createdAt), type: 'datetime' }, { title: 'حفظه', get: r => r.filters?.by || '—' },
      { title: '', get: () => '', show: r => btn('تنزيل Excel', () => downloadSaved(r.id)) }], saved.reports, { empty: 'مفيش تقارير محفوظة لليوم ده' });
  }
  $('reviewForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target.elements;
    try { await api('/api/reviews', { method: 'POST', body: { date: state.day, title: f.title.value.trim(), employeeId: f.employeeId.value || null, owner: f.owner.value.trim(), status: f.status.value, note: f.note.value.trim() } }); e.target.reset(); say('reviewNote', 'اتضافت'); renderFollowup(); } catch (x) { say('reviewNote', x.message); }
  };
  $('saveReport').onclick = async () => { try { await api('/api/saved-reports', { method: 'POST', body: { date: state.day, to: state.to } }); renderFollowup(); } catch (e) { alert(e.message); } };
  async function downloadSaved(id) {
    const r = await api('/api/saved-reports?id=' + id), p = r.payload, rep = p.report || {};
    const summary = [['مكالمات محتسبة', rep.calls], ['تم الرد', rep.answered], ['فائتة محتسبة', rep.abandoned], ['الرد خلال 10 ث %', rep.sla == null ? null : Math.round(rep.sla * 10) / 10], ['متوسط انتظار الرد (ث)', rep.asa == null ? null : Math.round(rep.asa * 10) / 10], ['نسبة الفائتة %', rep.abandonmentRate == null ? null : Math.round(rep.abandonmentRate * 10) / 10]];
    window.MarsadXlsx.download('تقرير-محفوظ-' + r.date + '-' + stamp(r.createdAt).replace(/[^\d]+/g, '-'), [
      { name: 'ملخص اليوم', columns: [{ title: 'المؤشر' }, { title: 'القيمة', type: 'number' }], rows: summary },
      { name: 'أداء الموظفين', columns: teamColumns.map(c => ({ title: c.title, type: c.type })), rows: teamRows(p).map(x => teamColumns.map(c => { const v = c.get(x); return v instanceof Node ? v.textContent : v; })) },
      { name: 'على مدار اليوم', columns: slotColumns.map(c => ({ title: c.title, type: c.type })), rows: (p.slots || []).map(x => slotColumns.map(c => c.get(x))) }]);
  }

  // ---------- حالة النظام ----------
  const AUDIT = { old_data_imported: 'نقل بيانات من النظام القديم', old_data_backfilled: 'إكمال بيانات ناقصة من النظام القديم', master_password_set: 'اختيار الباسورد الرئيسي', report_saved: 'حفظ تقرير اليوم',
    review_added: 'متابعة جديدة', review_updated: 'تعديل متابعة', shift_changed: 'قرار نهاية شيفت', employee_created: 'إضافة موظف', employee_changed: 'تعديل موظف', employee_deleted: 'حذف موظف (قديم)',
    admin_account_created: 'إضافة مستخدم إدارة', admin_account_changed: 'تعديل مستخدم إدارة', admin_account_deleted: 'حذف مستخدم إدارة (قديم)', break_request_decided: 'قرار طلب بريك',
    calls_assigned: 'نسبة مكالمات لموظف', calls_unassigned: 'إلغاء نسبة مكالمات', message_sent: 'رسالة للموظفين', telegram_settings: 'إعدادات تليجرام', telegram_bot_linked: 'ربط بوت تليجرام', telegram_group_linked: 'ربط جروب تليجرام', collector_linked: 'ربط الموصل' };
  let auditRows = [];
  const auditColumns = [{ title: 'الوقت', get: a => a.at, show: a => stamp(a.at), type: 'datetime' }, { title: 'التغيير', get: a => AUDIT[a.action] || a.action }, { title: 'بواسطة', get: a => a.actor || '—' }, { title: 'الموظف', get: a => a.employee || '—' },
    { title: 'التفاصيل', get: a => Object.entries(a.details || {}).filter(([k]) => !['actor', 'legacyId'].includes(k)).map(([k, v]) => k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(' · ').slice(0, 300), cls: () => 'wrap' }];
  async function renderSystem() {
    const d = await api('/api/system'), now = Date.parse(d.serverNow), ago = v => v ? Math.round((now - Date.parse(v)) / 1000) : null;
    const c = d.collector, hAge = ago(c.lastHistory?.at), lAge = ago(c.lastLive);
    const since = s => s == null ? 'أبدًا' : s < 90 ? 'من ' + s + ' ث' : s < 5400 ? 'من ' + Math.round(s / 60) + ' دقيقة' : 'من ' + Math.round(s / 3600) + ' ساعة';
    $('systemCards').replaceChildren(kpi('الموصل', c.linked ? 'مربوط' : 'مش مربوط', c.linked ? 'good' : 'bad', c.linkedAt ? 'اتربط ' + stamp(c.linkedAt) : 'اربطه من «الإدارة» على جهاز المشرف'),
      kpi('آخر سحب لسجل أرابيكس', since(hAge), hAge != null && hAge < 900 ? 'good' : 'warn', c.lastHistory ? 'سجل يوم ' + c.lastHistory.date : ''),
      kpi('آخر لقطة انتظار مباشر', since(lAge), lAge != null && lAge < 30 ? 'good' : 'warn'),
      kpi('أجهزة شغالة دلوقتي', d.devices.filter(x => x.open && ago(x.lastSeen) < 120).length, 'info', d.devices.length + ' جهاز آخر 24 ساعة'),
      ...(c.report ? [kpi('جهاز المشرف بيقول', c.report.historyError || c.report.liveError ? 'فيه مشكلة' : 'تمام', c.report.historyError || c.report.liveError ? 'bad' : 'good',
        [c.report.historyError ? 'السجل: ' + c.report.historyError : '', c.report.liveError ? 'الانتظار: ' + c.report.liveError : '', (c.report.historyDays || []).join(' · '), 'نسخة ' + (c.report.version || '—') + ' · ' + since(ago(c.report.receivedAt))].filter(Boolean).join(' — '))] : []));
    table('deviceTable', [{ title: 'الموظف', get: x => x.name }, { title: 'التحويلة', get: x => x.extension || '—' }, { title: 'نسخة الإضافة', get: x => x.version || '—' },
      { title: 'آخر إشارة', get: x => x.lastSeen, show: x => { const a = ago(x.lastSeen); return pill(since(a), x.open && a < 120 ? 'ok' : x.open ? 'warn' : ''); }, type: 'datetime' },
      { title: 'الجلسة', get: x => x.open ? 'مفتوحة' : 'مقفولة' }, { title: 'بدأت', get: x => x.startedAt, show: x => stamp(x.startedAt), type: 'datetime' }], d.devices, { empty: 'مفيش أجهزة اشتغلت على السيستم الجديد آخر 24 ساعة' });
    auditRows = d.audit;
    table('auditTable', auditColumns, d.audit, { limit: 300 });
  }

  // ---------- الإدارة ----------
  function askPasswords(title, { minLength = 1, digits = true } = {}) {
    return new Promise(resolve => {
      const a = h('input', { type: 'password', inputMode: digits ? 'numeric' : 'text', placeholder: 'الباسورد الجديد', required: true }), b = h('input', { type: 'password', inputMode: digits ? 'numeric' : 'text', placeholder: 'تأكيد الباسورد', required: true });
      const err = h('p', { className: 'error' }), ok = h('button', { type: 'submit', textContent: 'حفظ' }), cancel = h('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
      const form = h('form', { className: 'stack' }, h('h2', { textContent: title }), a, b, err, h('div', { className: 'inline' }, ok, cancel));
      const dlg = h('dialog', {}, form); document.body.append(dlg); dlg.showModal(); a.focus();
      const done = v => { dlg.close(); dlg.remove(); resolve(v); };
      cancel.onclick = () => done(null);
      form.onsubmit = e => { e.preventDefault(); if (digits && !/^\d+$/.test(a.value)) err.textContent = 'أرقام بس'; else if (a.value.length < minLength) err.textContent = 'لازم ' + minLength + ' أو أكتر'; else if (a.value !== b.value) err.textContent = 'التأكيد مش مطابق'; else done(a.value); };
    });
  }
  const say = (id, text) => { $(id).textContent = text; };
  const ERR = { password_in_use: 'الباسورد مستخدم لموظف تاني', password_confirmation_mismatch: 'التأكيد مش مطابق', employee_code_exists: 'الكود موجود قبل كده' };
  async function renderManage() {
    await loadEmployees();
    const act_ = state.employees.filter(e => e.active).length;
    $('manageCards').replaceChildren(kpi('موظفين نشطين', act_, 'good'), kpi('موقوفين', state.employees.length - act_, state.employees.length - act_ ? 'warn' : ''), kpi('دورك', ROLE[who?.role] || '—', 'info', who?.name || ''));
    table('employeesTable', [{ title: 'الاسم', get: e => e.name }, { title: 'الكود', get: e => e.employeeCode }, { title: 'الحالة', get: e => e.active ? 'نشط' : 'موقوف', show: e => pill(e.active ? 'نشط' : 'موقوف', e.active ? 'ok' : 'warn') },
      { title: '', get: () => '', show: e => !isAdmin() ? '' : h('span', { className: 'inline' },
        btn('الباسورد', async () => { const pin = await askPasswords('باسورد جديد لـ ' + e.name); if (pin == null) return; await act('employeeMessage', () => api('/api/employees', { method: 'PATCH', body: { id: e.id, pin, pinConfirmation: pin } }), 'اتغير الباسورد وانتهت جلسته الحالية'); }),
        btn(e.active ? 'إيقاف' : 'تفعيل', () => act('employeeMessage', () => api('/api/employees', { method: 'PATCH', body: { id: e.id, active: !e.active } }), 'اتحفظ'))) }],
    state.employees);
    const m = await api('/api/messages?date=' + cairoToday()), groups = new Map();
    for (const r of m.messages) { const g = groups.get(r.id) || { ...r, total: 0, delivered: 0, read: 0 }; g.total++; if (r.delivered_at) g.delivered++; if (r.acknowledged_at) g.read++; groups.set(r.id, g); }
    table('messagesTable', [{ title: 'الوقت', get: g => g.created_at, show: g => clock(g.created_at), type: 'datetime' }, { title: 'العنوان', get: g => g.title }, { title: 'المستلمين', get: g => g.total, type: 'number' }, { title: 'ظهرت عندهم', get: g => g.delivered, type: 'number' }, { title: 'ضغطوا تم الاطلاع', get: g => g.read, type: 'number' }], [...groups.values()], { empty: 'مفيش رسائل النهارده' });
    $('adminUsersPanel').hidden = !isAdmin();
    if (isAdmin()) {
      const a = await api('/api/admin-access');
      table('adminsTable', [{ title: 'الاسم', get: x => x.name }, { title: 'الدور', get: x => ROLE[x.role] }, { title: 'الحالة', get: x => x.active ? 'مفعّل' : 'موقوف' },
        { title: '', get: () => '', show: x => h('span', { className: 'inline' },
          btn('الباسورد', async () => { const p = await askPasswords('باسورد جديد لـ ' + x.name, { minLength: 6, digits: false }); if (p == null) return; await act('adminMessage', () => api('/api/admin-access', { method: 'PATCH', body: { id: x.id, password: p, confirmation: p } }), 'اتغير'); }),
          x.id === who?.id ? null : btn(x.active ? 'إيقاف' : 'تفعيل', () => act('adminMessage', () => api('/api/admin-access', { method: 'PATCH', body: { id: x.id, active: !x.active } }), 'اتحفظ'))) }], a.accounts || []);
    }
    $('telegramPanel').hidden = !isAdmin();
    if (isAdmin()) api('/api/import-old').then(r => { $('importPanel').hidden = !r.available && !r.backfill; $('importLast').textContent = r.lastImportAt ? 'آخر نقل: ' + new Date(r.lastImportAt).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' }) : ''; }).catch(() => {});
    if (isAdmin()) renderTelegram().catch(e => say('tgNote', e.message));
    OR.renderKey(isAdmin()).catch(e => say('ordersKeyNote', e.message));
    renderDesks().catch(e => say('desksNote', e.message));
    renderLearned().catch(() => {});
    SITE.renderKey(isAdmin()).catch(e => say('siteKeyNote', e.message));
    SITE.renderTalabatKey(isAdmin()).catch(e => say('talKeyNote', e.message));
    SITE.renderWhatsApp(isAdmin()).catch(e => say('waNote', e.message));
    for (const f of ['addEmployee', 'addAdmin', 'messageForm']) $(f).hidden = f === 'messageForm' ? !canWrite() : !isAdmin();
    $('linkCollector').hidden = !canWrite();
  }
  const btn = (text, fn, cls = 'ghost small') => { const b = h('button', { type: 'button', className: cls === 'danger' ? 'danger small' : cls, textContent: text }); b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
  async function act(note, fn, done) { try { await fn(); say(note, done); renderManage(); } catch (e) { say(note, ERR[e.message] || e.message); } }
  $('addEmployee').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    if (!/^\d+$/.test(f.elements.pin.value)) return say('employeeMessage', 'الباسورد أرقام بس');
    await act('employeeMessage', () => api('/api/employees', { method: 'POST', body: { name: f.elements.name.value.trim(), employeeCode: f.elements.code.value.trim(), pin: f.elements.pin.value, pinConfirmation: f.elements.pin2.value } }), 'اتضاف الموظف');
    f.reset();
  };
  $('addAdmin').onsubmit = async e => { e.preventDefault(); const f = e.target; await act('adminMessage', () => api('/api/admin-access', { method: 'POST', body: { name: f.elements.name.value.trim(), role: f.elements.role.value, password: f.elements.password.value, confirmation: f.elements.password2.value } }), 'اتضاف المستخدم'); f.reset(); };
  $('messageForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { const r = await api('/api/messages', { method: 'POST', body: { id: crypto.randomUUID(), title: f.elements.title.value.trim(), message: f.elements.message.value.trim(), priority: f.elements.priority.value, hours: Number(f.elements.hours.value), recipients: f.elements.to.value === 'all' ? 'all' : [Number(f.elements.to.value)] } }); say('messageNote', 'اتبعتت لـ ' + r.recipients + ' موظف'); f.reset(); renderManage(); } catch (x) { say('messageNote', x.message); }
  };
  $('importButton').onclick = async () => {
    const f = $('importFile').files[0];
    if (!f) return say('importNote', 'اختار الملف الأول');
    if (!confirm('نقل بيانات النظام القديم للسيرفر ده؟ اللي اتنقل قبل كده مش هيتكرر.')) return;
    $('importButton').disabled = true;
    try {
      const { run } = await import('./import-old.js?v=3');
      const post = async body => {
        const r = await fetch(API + '/api/import-old/rows', { method: 'POST', headers: { 'x-admin-password': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { const e = Error(d.error || 'تعذر النقل (' + r.status + ')'); e.status = r.status; throw e; }
        return d;
      };
      const status = await api('/api/import-old');
      const postBackfill = async body => {
        const r = await fetch(API + '/api/import-old/backfill', { method: 'POST', headers: { 'x-admin-password': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { const e = Error(d.error || 'تعذر النقل (' + r.status + ')'); e.status = r.status; throw e; }
        return d;
      };
      const x = await run({ file: f, post, postBackfill, mode: status.available ? 'full' : 'backfill', say: t => say('importNote', t), base: BASE });
      if (x.backfill) { say('importNote', 'اتنقل الناقص من النظام القديم: ' + x.backfill.sessions + ' جلسة، ' + x.backfill.events + ' حدث، ' + x.backfill.historyDays + ' يوم من سجل أرابيكس (اللي كان موجود قبل كده متكررش، والأيام اللي الموصل الجديد سحبها فضلت زي ما هي).'); renderManage(); return; }
      say('importNote', 'اتنقل: ' + x.employees + ' موظف، ' + x.adminAccounts + ' مستخدم إدارة، ' + x.sessions + ' جلسة، ' + x.events + ' حدث، ' + x.historyDays + ' يوم من سجل أرابيكس.');
      renderManage();
    } catch (e) { say('importNote', (e.message || 'تعذر النقل') + ' — تقدر تعيد المحاولة بنفس الملف، اللي اتنقل مش هيتكرر.'); } finally { $('importButton').disabled = false; }
  };

  // ---------- توحيد الأسماء مع Apex ----------
  const norm = x => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  async function renderDesks() {
    const d = await api('/api/apex-names'), admin = isAdmin();
    const apexOf = id => d.apexNames.filter(a => a.employeeId === id).map(a => a.apexName);
    const taken = new Set(d.apexNames.map(a => a.apexName));
    const apexSel = e => {
      const mine = apexOf(e.id), first = norm(e.name).split(' ')[0];
      if (!admin) return mine.join('، ') || '—';
      const sel = h('select', { ariaLabel: 'اسمه في Apex' }, h('option', { value: '', textContent: mine.length ? '—' : 'اختار…' }));
      // Suggested: Apex names not tied to anyone that start like this employee's name.
      const free = d.apexSeen.filter(n => !taken.has(n)), sug = free.filter(n => first && norm(n).split(' ')[0] === first);
      if (sug.length) sel.append(h('optgroup', { label: 'مقترح' }, ...sug.map(n => h('option', { value: n, textContent: n }))));
      sel.append(h('optgroup', { label: 'كل الأسماء' }, ...free.filter(n => !sug.includes(n)).map(n => h('option', { value: n, textContent: n }))));
      sel.onchange = async () => { if (!sel.value) return; try { await api('/api/apex-names', { method: 'PUT', body: { apexName: sel.value, employeeId: e.id } }); renderDesks(); } catch (x) { say('desksNote', x.message); } };
      return h('span', { className: 'inline' }, ...mine.map(n => h('span', { className: 'pill ok chip' }, n + ' ', btn('×', async () => { await api('/api/apex-names', { method: 'PUT', body: { apexName: n, employeeId: null } }); renderDesks(); }, 'ghost small icon'))), sel);
    };
    table('desksTable', [{ title: 'الموظف', get: e => e.name }, { title: 'اسمه في Apex', get: e => apexOf(e.id).join('، '), show: apexSel }], state.employees.filter(e => e.active));
    const left = d.apexSeen.filter(n => !taken.has(n));
    $('apexLeft').replaceChildren(left.length ? h('div', { className: 'inline' }, ...left.map(n => pill(n))) : h('p', { className: 'muted', textContent: d.apexSeen.length ? 'كل الأسماء متربطة' : 'الأسماء هتظهر هنا أول ما مرصد الأوردرات يبعت من جهاز الكاشير' }));
  }

  // ---------- اللي المرصد اتعلمه ----------
  const LEARN_KIND = { 'branch:talabat': 'فرع طلبات ← فرع Apex', 'branch:site': 'فرع الموقع ← فرع Apex', unknown: 'حاجة جديدة ظهرت' };
  async function renderLearned() {
    const d = await api('/api/learned');
    const delays = new Map(d.delays.map(x => [x.branch, x.evidence]));
    table('learnedTable', [{ title: 'النوع', get: x => LEARN_KIND[x.kind] || x.kind }, { title: 'من', get: x => x.kind === 'unknown' ? ({ talabat: 'طلبات', site: 'الموقع' })[x.a] || x.a : x.a },
      { title: 'اتعلم إنه', get: x => x.b }, { title: 'الأدلة', get: x => x.evidence, show: x => x.evidence + (x.kind === 'unknown' ? ' أوردر' : ' ربط أكيد'), type: 'number' },
      { title: 'وقت الضرب المعتاد', get: x => delays.get(x.a) || 0, show: x => x.kind === 'branch:talabat' ? (delays.get(x.a) >= 10 ? 'اتعلمه من ' + delays.get(x.a) + ' أوردر' : 'لسه (' + (delays.get(x.a) || 0) + ' من 10)') : '—' },
      { title: 'آخر مرة', get: x => x.last, show: x => stamp(x.last), type: 'datetime' },
      { title: '', get: () => '', show: x => !isAdmin() || x.kind === 'unknown' ? '' : btn('انسى ده', async () => { if (!confirm('ينسى إن «' + x.a + '» هو «' + x.b + '»؟')) return; await api('/api/learned', { method: 'POST', body: { kind: x.kind, a: x.a, b: x.b } }); renderLearned(); }) }],
      d.facts, { empty: 'لسه ماتعلمش حاجة. أول ما أوردرات طلبات تتربط بالهاشتاج هيبدأ يتعلم.' });
  }

  // ---------- تليجرام ----------
  async function renderTelegram() {
    const t = await api('/api/telegram');
    const group = (label, chat, target, note) => h('div', { className: 'tg-group' }, h('span', { className: 'muted', textContent: label }),
      chat ? h('strong', { textContent: chat.title || chat.id }) : pill('مش مربوط', 'warn'), note ? h('small', { className: 'muted', textContent: note }) : null,
      h('span', { className: 'inline' }, chat ? btn('رسالة تجربة', () => tgTest(target)) : null, chat && target === 'branches' ? btn('فك الربط', async () => { if (!confirm('فك ربط جروب الفروع؟ تنبيهات الفروع هتنتظر لحد ربط جروب الفروع تاني.')) return; try { await api('/api/telegram', { method: 'POST', body: { action: 'unlinkBranches' } }); say('tgNote', 'اتفك ربط جروب الفروع.'); renderTelegram(); } catch (x) { say('tgNote', x.message); } }) : null));
    $('tgStatus').replaceChildren(h('p', {}, !t.configured ? 'البوت مش مربوط.' : 'البوت: @' + t.botName + ' · ' + (t.enabled ? 'التنبيهات شغالة' : 'التنبيهات متوقفة')),
      group('جروب الكول سنتر — المكالمات', t.chat, 'main', 'المكالمات والانتظار والموظفين وتغيّر حالة تنبيهاتهم.'),
      group('جروب الكول سنتر — الأونلاين وضرب الأوردر', t.onlineChat, 'online', 'أخطاء الضرب والتكرار والخصومات وتأخير الضرب وتغيّر حالتها. لازم يتربط عشان يستقبل التنبيهات.'),
      group('جروب إدارات الفروع', t.branchChat, 'branches', t.branchChat ? 'تأخير خروج الأوردرات وكل الإلغاءات.' : 'تنبيهات الفروع بتنتظر لحد ربط جروبها؛ مش بتروح للكول سنتر.'));
    // One group per branch: each branch's delays and cancellations also go to its own group.
    const bg = t.branchGroups || {}, names = [...new Set([...(t.branchNames || []), ...Object.keys(bg)])].sort();
    tgBranchNames = names;
    $('tgBranchGroups').replaceChildren(h('h3', { textContent: 'جروب لكل فرع' }), h('p', { className: 'muted', textContent: 'تأخير خروج أوردرات الفرع وإلغاءاته (Apex وطلبات والموقع) بتروح لجروب الفرع بس، ومش بتروح لأي جروب مشترك. الفرع اللي لسه مالوش جروب، رسايله بتتسجل هنا ومش بتتبعت. ضيف البوت لجروب الفرع وابعت فيه رسالة، ودوس «دور على الجروب» واختار الفرع.' }),
      ...(names.length ? names.map(n => h('div', { className: 'tg-group' }, h('span', { className: 'muted', textContent: n }), bg[n] ? h('strong', { textContent: bg[n].title || bg[n].id }) : pill('مش مربوط', 'warn'),
        h('span', { className: 'inline' }, bg[n] ? btn('رسالة تجربة', async () => { try { await api('/api/telegram', { method: 'POST', body: { action: 'test', target: 'branch', branch: n } }); say('tgNote', 'اتبعتت رسالة تجربة لجروب فرع ' + n + '.'); } catch (x) { say('tgNote', x.message); } }) : null,
          bg[n] ? btn('فك الربط', async () => { if (!confirm('فك ربط جروب فرع ' + n + '؟')) return; try { await api('/api/telegram', { method: 'POST', body: { action: 'unlinkBranch', branch: n } }); renderTelegram(); } catch (x) { say('tgNote', x.message); } }) : null)))
        : [h('p', { className: 'muted', textContent: 'أسماء الفروع هتظهر هنا أول ما مرصد الأوردرات يبعت من جهاز الكاشير.' })]));
    $('tgSettings').elements.enabled.checked = t.enabled;
    const box = (title, list) => list.length ? [h('h3', { textContent: title }), ...list.map(r => h('label', {}, h('input', { type: 'checkbox', name: 'rule', value: r.key, checked: r.on }), ' ' + r.label.replace(/^الأوردرات: /, '')))] : [];
    $('tgRules').replaceChildren(...box('الكول سنتر', t.rules.filter(r => !r.key.startsWith('orders'))), ...box('الفروع', t.rules.filter(r => ['ordersLate', 'ordersCancel'].includes(r.key))), ...box('الأونلاين وضرب الأوردر', t.rules.filter(r => r.key.startsWith('orders') && !['ordersLate', 'ordersCancel'].includes(r.key))));
    const log = (await api('/api/telegram?log=1&date=' + cairoToday())).log;
    table('tgLog', [{ title: 'الوقت', get: x => x.createdAt, show: x => clock(x.createdAt), type: 'datetime' }, { title: 'الجروب', get: x => x.group || 'الكول سنتر' }, { title: 'النوع', get: x => x.label }, { title: 'الرسالة', get: x => x.text.split('\n')[0] },
      { title: 'اتبعت', get: x => x.sentAt ? 'أيوه' : 'لأ' + (x.error ? ' — ' + x.error : '') }], log, { empty: 'مفيش تنبيهات النهارده', limit: 100 });
  }
  let tgBranchNames = [];
  async function tgTest(target) { try { await api('/api/telegram', { method: 'POST', body: { action: 'test', target } }); say('tgNote', 'اتبعتت رسالة تجربة لجروب ' + (target === 'branches' ? 'الفروع' : target === 'online' ? 'الأونلاين وضرب الأوردر' : 'المكالمات') + '.'); } catch (x) { say('tgNote', x.message); } }
  $('tgToken').onsubmit = async e => { e.preventDefault(); try { const r = await api('/api/telegram', { method: 'POST', body: { action: 'token', token: e.target.elements.token.value.trim() } }); e.target.reset(); say('tgNote', 'اتربط البوت @' + r.botName + '. ضيفه للجروب وابعت رسالة، وبعدين دوس «دور على الجروب».'); renderTelegram(); } catch (x) { say('tgNote', x.message); } };
  $('tgDiscover').onclick = async () => {
    try { const { chats } = await api('/api/telegram', { method: 'POST', body: { action: 'discover' } });
      if (!chats.length) return say('tgNote', 'البوت مش شايف أي جروب لسه. ضيفه للجروب وابعت فيه رسالة وجرب تاني.');
      $('tgChats').replaceChildren(...chats.map(c => h('option', { value: c.id, textContent: c.title }))); $('tgChats').hidden = $('tgChoose').hidden = $('tgChooseOnline').hidden = $('tgChooseBranches').hidden = false;
      $('tgBranchPick').replaceChildren(...tgBranchNames.map(n => h('option', { value: n, textContent: n }))); $('tgBranchPick').hidden = $('tgChooseBranch').hidden = !tgBranchNames.length; say('tgNote', 'اختار الجروب وحدد: المكالمات، الأونلاين وضرب الأوردر، أو الفروع.');
    } catch (x) { say('tgNote', x.message); }
  };
  const tgChoose = target => async () => { const o = $('tgChats').selectedOptions[0]; if (!o) return; try { await api('/api/telegram', { method: 'POST', body: { action: 'chat', chatId: o.value, title: o.textContent, target } }); say('tgNote', 'اتربط «' + o.textContent + '» كجروب ' + (target === 'branches' ? 'إدارات الفروع' : target === 'online' ? 'الأونلاين وضرب الأوردر' : 'المكالمات') + ' وجاتلكم رسالة تأكيد.'); $('tgChats').hidden = $('tgChoose').hidden = $('tgChooseOnline').hidden = $('tgChooseBranches').hidden = $('tgBranchPick').hidden = $('tgChooseBranch').hidden = true; renderTelegram(); } catch (x) { say('tgNote', x.message); } };
  $('tgChooseBranch').onclick = async () => { const o = $('tgChats').selectedOptions[0], n = $('tgBranchPick').value; if (!o || !n) return;
    try { await api('/api/telegram', { method: 'POST', body: { action: 'chat', chatId: o.value, title: o.textContent, target: 'branch', branch: n } }); say('tgNote', 'اتربط «' + o.textContent + '» كجروب فرع ' + n + ' وجاتلكم رسالة تأكيد.'); $('tgChats').hidden = $('tgChoose').hidden = $('tgChooseOnline').hidden = $('tgChooseBranches').hidden = $('tgBranchPick').hidden = $('tgChooseBranch').hidden = true; renderTelegram(); } catch (x) { say('tgNote', x.message); } };
  $('tgChooseOnline').onclick = tgChoose('online'); $('tgChoose').onclick = tgChoose('main'); $('tgChooseBranches').onclick = tgChoose('branches');
  $('tgSettings').onsubmit = async e => { e.preventDefault(); const f = e.target, rules = Object.fromEntries([...f.querySelectorAll('[name=rule]')].map(i => [i.value, i.checked]));
    try { await api('/api/telegram', { method: 'POST', body: { action: 'settings', enabled: f.elements.enabled.checked, rules } }); say('tgNote', 'اتحفظ.'); renderTelegram(); } catch (x) { say('tgNote', x.message); } };

  // The extension on this PC (if installed) receives the collector credentials through the page.
  function extensionCall(message, ms = 4000) {
    return new Promise(resolve => {
      const request = crypto.randomUUID(), t = setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, ms);
      const on = e => { if (e.source === window && e.data?.source === 'MARSAD_EXTENSION' && e.data.request === request) { clearTimeout(t); window.removeEventListener('message', on); resolve(e.data.reply); } };
      window.addEventListener('message', on);
      window.postMessage({ source: 'MARSAD_ADMIN', request, ...message }, location.origin);
    });
  }
  $('linkCollector').onclick = async () => {
    say('collectorNote', 'جارٍ الربط…');
    if (!await extensionCall({ type: 'COLLECTOR_STATUS' }, 2000)) return say('collectorNote', 'الإضافة مش متثبتة على الجهاز ده (أو الصفحة مفتوحة من رابط غير رابط الإدارة).');
    try {
      const t = await api('/api/history', { method: 'POST', body: { action: 'token' } });
      const r = await extensionCall({ type: 'LINK_COLLECTOR', token: t.token, refreshToken: t.refreshToken });
      if (!r?.ok) { await api('/api/history', { method: 'POST', body: { action: 'revoke', refreshToken: t.refreshToken } }).catch(() => {}); return say('collectorNote', 'الإضافة رفضت الربط: ' + (r?.error || 'بدون رد')); }
      say('collectorNote', 'اتربط. الجهاز ده هيسحب سجل أرابيكس كل 15 دقيقة والانتظار لايف، طول ما تقارير أرابيكس متسجل فيها دخول.');
    } catch (e) { say('collectorNote', e.message); }
  };

  // ---------- exports ----------
  document.addEventListener('click', async e => {
    const kind = e.target.closest('[data-export]')?.dataset.export;
    if (!kind) return;
    try {
      if (OR.exportKind(kind) || SITE.exportKind(kind) || INS.exportKind(kind)) return;
      if (kind === 'queues') exportRows('انواع-الطلبات', queueColumns, (await dayHistory()).queues || []);
      if (kind === 'team') exportRows('اداء-الموظفين', teamColumns, teamRows(await dayData()));
      if (kind === 'calls') exportRows('المكالمات', callColumns, filteredCalls(await dayData()));
      if (kind === 'hours') exportRows('على-مدار-اليوم', slotColumns, hourRows(await dayData()));
      if (kind === 'profile') { await dayData(); const t = profileTables; exportSheets('ملف-' + name(state.profile), [['الجلسات', ...t.sessions], ['البريكات', ...t.breaks], ['المكالمات', ...t.calls], ['الحالات', ...t.states]]); }
      if (kind === 'breakTotals') exportRows('البريك-لكل-موظف', att.totalColumns.slice(0, 4), att.totals);
      if (kind === 'overlaps') exportRows('بريكات-مع-بعض', att.overlapColumns, att.overlaps);
      if (kind === 'breaks') exportRows('البريكات', breakColumns, att.breaks);
      if (kind === 'sessions') exportRows('الدخول-والخروج', sessionColumns, att.sessions);
      if (kind === 'shifts') exportRows('نهاية-الشيفت', shiftColumns, shiftRows);
      if (kind === 'reviews') exportRows('المتابعة', reviewColumns().map(c => c.title === 'الحالة' ? { ...c, show: undefined } : c), reviewRows);
      if (kind === 'audit') exportRows('سجل-التغييرات', auditColumns, auditRows);
      if (kind === 'missed') exportRows('الفائتة', missedColumns.slice(0, -1), ((await dayHistory()).missed || []).filter(m => !$('missedClass').value || m.classification === $('missedClass').value));
    } catch (x) { showError(x); }
  });

  // ---------- navigation ----------
  const VIEWS = { now: ['الآن', null], day: ['ملخص اليوم', renderDay], hours: ['على مدار اليوم', renderHours], team: ['أداء الموظفين', renderTeam], profile: ['ملف الموظف', renderProfile], requests: ['طلبات البريك', refreshRequests], attendance: ['الحضور والبريك', renderAttendance],
    shifts: ['نهاية الشيفت والرجوع للشغل', renderShifts], calls: ['المكالمات', renderCalls], missed: ['المكالمات الفائتة', renderMissed], followup: ['المتابعة والتقارير', renderFollowup], system: ['حالة النظام', renderSystem], manage: ['الإدارة', renderManage], guide: ['طريقة حساب الأرقام', async () => {}],
    entry: ['ضرب الأوردرات', () => OR.renderEntry()], branchesNow: ['الفروع الآن', null], branches: ['أداء الفروع', () => OR.renderBranches()], cancels: ['الإلغاءات', () => Promise.all([OR.renderCancels(), SITE.renderBranchTalabatCancels(), INS.renderCancelOwners()])],
    siteBranches: ['تقرير أداء الموقع للفروع', () => SITE.renderBranches()], siteTransfer: ['تحويل أوردرات الموقع للفروع', () => SITE.renderTransfer()], talabat: ['أوردرات طلبات', () => SITE.renderTalabat()],
    branchFile: ['ملف الفرع', () => INS.renderBranch()], sales: ['المبيعات', () => INS.renderSales()] };
  const DAY_VIEWS = ['day', 'hours', 'team', 'profile', 'attendance', 'shifts', 'calls', 'missed', 'followup', 'entry', 'branches', 'cancels', 'siteBranches', 'siteTransfer', 'talabat', 'branchFile', 'sales'];
  // Two sections, each with its own views; the system views are shared and keep the section you came from.
  const SECTION_OF = { branchesNow: 'branches', branches: 'branches', cancels: 'branches', siteBranches: 'branches', branchFile: 'branches', sales: 'branches' };
  const SHARED = ['followup', 'system', 'manage', 'guide'];
  const lastIn = { calls: 'now', branches: 'branchesNow' };
  function setSection(sec) {
    state.section = sec;
    for (const b of document.querySelectorAll('#sections [data-section]')) { const on = b.dataset.section === sec; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }
    for (const n of document.querySelectorAll('#nav .navsec')) n.hidden = n.dataset.sec !== sec;
  }
  $('sections').onclick = e => { const sec = e.target.closest('[data-section]')?.dataset.section; if (sec && sec !== state.section) show(lastIn[sec]); };
  async function show(view, force = false) {
    state.view = view;
    if (!SHARED.includes(view)) { const sec = SECTION_OF[view] || 'calls'; lastIn[sec] = view; if (sec !== state.section) setSection(sec); }
    for (const b of document.querySelectorAll('#nav [data-view]')) b.classList.toggle('active', b.dataset.view === view);
    for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + view;
    $('title').textContent = VIEWS[view][0];
    $('dayPicker').hidden = !DAY_VIEWS.includes(view);
    showError(null);
    refreshRequests();
    if (view === 'now') return tick();
    if (view === 'branchesNow') { OR.drawBoard(); return OR.refreshBoard().then(() => syncStatus(true)).catch(e => { syncStatus(false); showError(e); }); }
    try { syncStatus(true, 'جارٍ التحميل…'); if (force) cache.delete(rangeKey()); await VIEWS[view][1](); syncStatus(true); } catch (e) { syncStatus(false); showError(e); }
  }
  document.querySelector('#nav nav').onclick = e => { const v = e.target.closest('[data-view]')?.dataset.view; if (v) { show(v); setMenu(false); } };
  // Narrow screens: the sections fold behind one button.
  const setMenu = open => { $('nav').classList.toggle('open', open); $('menuToggle').setAttribute('aria-expanded', String(open)); };
  $('menuToggle').onclick = () => setMenu(!$('nav').classList.contains('open'));
  const setDay = d => { const today = cairoToday(); state.day = !d || d > today ? today : d; state.to = state.day; $('dayTo').value = state.to; $('day').value = state.day; $('dayNext').disabled = state.day >= today; show(state.view); };
  const shiftDay = n => new Date(Date.parse(state.day + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  $('applyRange').onclick = () => { const from = $('day').value, to = $('dayTo').value; if (!from || !to || to < from || to > cairoToday()) return showError(Error('اختار فترة صحيحة من وإلى')); if ((Date.parse(to) - Date.parse(from)) / 864e5 >= 93) return showError(Error('اختار فترة لا تتجاوز 93 يوم')); state.day = from; state.to = to; $('dayNext').disabled = to >= cairoToday(); show(state.view); };
  $('dayPrev').onclick = () => setDay(shiftDay(-1)); $('dayNext').onclick = () => setDay(shiftDay(1)); $('dayToday').onclick = () => setDay(cairoToday());
  for (const id of ['callSearch', 'callEmployee', 'callStatus']) $(id).addEventListener('input', () => renderCalls().catch(showError));
  $('missedClass').onchange = () => renderMissed().catch(showError);

  let ticking = false;
  async function tick() {
    if (!token || state.view !== 'now' || document.hidden || ticking) return;
    ticking = true;
    try { await refreshNow(); syncStatus(true); showError(null); } catch (e) { syncStatus(false); } finally { ticking = false; }
  }
  // One draw per second: fetch, then draw (timers keep counting from the last good data).
  setInterval(() => { tick(); if (state.view === 'now' && Date.now() - (state.drawnAt || 0) > 900) { renderNow(); state.drawnAt = Date.now(); } }, 1000);
  setInterval(() => { if (token && !document.hidden) refreshRequests(); }, 10000);
  // الفروع الآن: timers every second, the summary every 5 seconds; elsewhere only the late badge, every 30 seconds.
  let boardBusy = false, boardAt = 0;
  setInterval(() => {
    if (!token || document.hidden) return;
    if (state.view === 'branchesNow') OR.tickBoard();
    const every = state.view === 'branchesNow' ? 5000 : 60000;
    if (boardBusy || Date.now() - boardAt < every) return;
    boardBusy = true; boardAt = Date.now();
    OR.refreshBoard().then(() => { if (state.view === 'branchesNow') { syncStatus(true); showError(null); } }).catch(() => { if (state.view === 'branchesNow') syncStatus(false); }).finally(() => { boardBusy = false; });
  }, 1000);
  // The day picker's latest day follows the 9am change.
  setInterval(() => { const t = cairoToday(); if ($('day').max !== t) { $('day').max = t; $('dayTo').max = t; $('dayNext').disabled = state.to >= t; } }, 60000);
  // Today's numbers on the open page refresh every minute.
  // Skipped while the supervisor is choosing or typing something on the page, or has a section open, so nothing they picked is lost.
  const busyHere = () => { const a = document.activeElement, v = document.querySelector('.view:not([hidden])'); return !!v && ((a && v.contains(a) && /^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName)) || !!v.querySelector('details[open]')); };
  setInterval(() => { if (token && DAY_VIEWS.includes(state.view) && state.view !== 'followup' && state.to === cairoToday() && !document.hidden && !busyHere()) show(state.view, true); }, 60000);

  // ---------- sign in ----------
  async function enter() {
    const d = await api('/api/admin-access');
    who = d.identity;
    $('who').textContent = who.name + ' · ' + ROLE[who.role];
    $('login').hidden = true; $('app').hidden = false;
    $('dayTo').value = state.to; $('dayTo').max = cairoToday(); $('day').value = state.day; $('day').max = cairoToday(); $('dayNext').disabled = true;
    await loadEmployees();
    refreshRequests();
    setSection('calls');
    show('now');
  }
  function logout(message = '') {
    if (token) fetch(API + '/api/admin-access', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': token }, body: JSON.stringify({ action: 'logout' }), keepalive: true }).catch(() => {});
    token = ''; who = null; sessionStorage.removeItem(TOKEN); cache.clear();
    $('app').hidden = true; $('login').hidden = false; $('loginError').textContent = message;
  }
  $('logout').onclick = () => logout();
  // A brand-new server has no main password yet: the first screen chooses it.
  let setup = false;
  const checkSetup = () => fetch(API + '/api/admin-access/setup').then(r => r.json()).then(d => {
    setup = !!d.needed;
    $('setupNote').hidden = $('confirmRow').hidden = !setup; $('confirmation').required = setup;
    $('password').autocomplete = setup ? 'new-password' : 'current-password'; $('loginButton').textContent = setup ? 'حفظ ودخول' : 'دخول';
  }).catch(() => {});
  $('loginForm').onsubmit = async e => {
    e.preventDefault(); $('loginError').textContent = '';
    try {
      const body = setup ? { action: 'setup', password: $('password').value, confirmation: $('confirmation').value } : { action: 'login', password: $('password').value };
      const r = await fetch(API + '/api/admin-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'تعذر الدخول');
      token = d.token; sessionStorage.setItem(TOKEN, token); $('password').value = $('confirmation').value = '';
      if (setup) checkSetup();
      await enter();
    } catch (x) { $('loginError').textContent = x.message === 'Failed to fetch' ? 'السيرفر مش متاح' : x.message; }
  };
  checkSetup();
  if (token) enter().catch(() => logout()); else $('login').hidden = false;
})();
