'use strict';
// مرصد الأداء — admin page (v2). One file, no framework. Talks only to the new server.
(() => {
  const API = window.MARSAD_API;
  const BASE = new URL('.', document.currentScript?.src || location.href).href;
  const $ = id => document.getElementById(id);
  const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null)); return e; };
  const TOKEN = 'marsadAdminToken';

  // ---------- formatting ----------
  const dur = s => { if (s == null || !Number.isFinite(Number(s))) return '—'; s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  const clock = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const stamp = v => v ? new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const pct = v => v == null ? 'غير متاح' : Number(v).toFixed(1) + '%';
  const secs = v => v == null ? 'غير متاح' : Number(v).toFixed(1) + ' ث';
  const ampm = v => String(v || '').replace(/\bAM\b/i, 'ص').replace(/\bPM\b/i, 'م');
  const cairoToday = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); const d = p.year + '-' + p.month + '-' + p.day; return +p.hour < 9 ? new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10) : d; };
  const REASON = { arabicss_logout: 'خروج من أرابيكس', arabicss_login_page: 'رجع لصفحة الدخول', tab_closed: 'قفل الصفحة', browser_restarted: 'المتصفح اتقفل', expired_or_disconnected: 'انقطاع', work_resumed: 'دخل تاني', explicit_logout: 'خروج', session_logout: 'خروج', extension_changed: 'غيّر التحويلة', password_changed: 'اتغير الباسورد', employee_disabled: 'اتوقف من الإدارة' };
  const STATE = { ready_night: 'متاح (بعد 3 الفجر)', on_call_night: 'في مكالمة (بعد 3 الفجر)', break_night: 'بريك (بعد 3 الفجر)', unknown_night: 'انقطاع رصد (بعد 3 الفجر)', ready: 'متاح', on_call: 'في مكالمة', break: 'بريك', unknown: 'انقطاع رصد', logged_in: 'سجّل ولسه مدخلش الكونسول', offline: 'خرج', logged_out: 'خرج', disconnected: 'انقطع الاتصال', not_started: 'مبدأش', no_session: 'لم يسجل', shift_ended: 'خلص الشيفت', post_call: 'أنهى مكالمة', break_unconfirmed: 'بريك بلا طرفين مؤكدين' };
  const QUEUE = q => ({ 0: 'خارج ساعات العمل', 1: 'طلب أوردر', 2: 'متابعة أوردر', 3: 'شكاوى' })[String(q || '').slice(-1)] || 'غير معروف';
  const MISSED = { counted: 'محتسبة', short_exempt: 'قصيرة ≤7ث — للتوضيح', after_hours: 'خارج ساعات العمل', unknown_wait: 'انتظار غير معروف', unknown_queue: 'نوع طلب غير معروف' };
  const ROLE = { admin: 'مدير', supervisor: 'مشرف', viewer: 'مشاهدة فقط' };

  // ---------- server ----------
  let token = sessionStorage.getItem(TOKEN) || '', who = null, offset = 0;
  const serverNow = () => Date.now() + offset;
  async function api(path, { method = 'GET', body } = {}) {
    const r = await fetch(API + path, { method, cache: 'no-store', headers: { 'x-admin-password': token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
    const head = h('tr', {}, ...columns.map((c, i) => { const th = h('th', { textContent: c.title + (state.col === i ? (state.dir > 0 ? ' ▲' : ' ▼') : '') }); th.onclick = () => { state.dir = state.col === i ? -state.dir : 1; state.col = i; table(box, columns, rows, { onRow, limit, empty }); }; return th; }));
    const body = h('tbody');
    for (const r of list.slice(0, limit)) {
      const tr = h('tr', { className: onRow ? 'click' : '' }, ...columns.map(c => { const v = c.show ? c.show(r) : c.get(r); const td = h('td', { className: (c.type && c.type !== 'text' ? 'num ' : '') + (c.cls?.(r) || '') }); if (v instanceof Node) td.append(v); else td.textContent = v ?? '—'; return td; }));
      if (onRow) tr.onclick = () => onRow(r);
      body.append(tr);
    }
    if (!list.length) body.append(h('tr', {}, h('td', { colSpan: columns.length, textContent: empty, className: 'muted' })));
    box.replaceChildren(h('div', { className: 'tablewrap' }, h('table', {}, h('thead', {}, head), body)), list.length > limit ? h('p', { className: 'muted', textContent: 'معروض أول ' + limit + ' من ' + list.length + '؛ التصدير فيه الكل.' }) : '');
  }
  function exportRows(name, columns, rows) {
    window.MarsadXlsx.download(name + '-' + state.day, columns.map(c => ({ title: c.title, type: c.type })), rows.map(r => columns.map(c => { const v = c.get(r); return v instanceof Node ? v.textContent : v; })));
  }
  const pill = (text, kind = '') => h('span', { className: 'pill ' + kind, textContent: text });

  // ---------- state ----------
  const state = { view: 'now', day: cairoToday(), employees: [], names: new Map(), live: null, queue: null, day_: {}, requests: null };
  const name = id => state.names.get(Number(id)) || 'موظف #' + id;
  async function loadEmployees() {
    const d = await api('/api/employees');
    state.employees = d.employees;
    state.names = new Map([...d.employees, ...(d.archivedEmployees || [])].map(e => [e.id, e.name]));
    const opts = [h('option', { value: '', textContent: 'كل الموظفين' }), ...d.employees.map(e => h('option', { value: e.id, textContent: e.name }))];
    $('callEmployee').replaceChildren(...opts.map(o => o.cloneNode(true)));
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
  const dayData = (force = false) => { if (force) cache.delete('day:' + state.day); return cached('day:' + state.day, state.day === cairoToday() ? 20000 : 600000, () => api('/api/day?date=' + state.day)); };
  const dayHistory = async (force = false) => (await dayData(force)).history;

  function syncStatus(ok, text) { const s = $('sync'); s.textContent = text || (ok ? 'آخر تحديث ' + clock(Date.now()) : 'تعذر التحديث'); s.classList.toggle('bad', !ok); }
  function showError(e) { $('error').hidden = !e; $('error').textContent = e ? e.message || String(e) : ''; }

  // ---------- الآن ----------
  async function refreshNow() {
    const d = await api('/api/live');
    state.live = d; state.queue = d.queue;
    renderNow();
  }
  
  function renderNow() {
    const d = state.live;
    if (!d) return;
    const now = serverNow(), people = d.employees.map(p => ({ ...p, s: p.state, elapsed: p.since ? (now - Date.parse(p.since)) / 1000 : null }));
    const count = s => people.filter(p => p.s === s).length;
    const q = state.queue, qAge = q ? (now - Date.parse(q.observedAt)) / 1000 : null, qFresh = q && qAge < 30;
    const waiting = qFresh ? q.waiting : [];
    $('nowCards').replaceChildren(...[['ready', 'متاحين', count('ready')], ['on_call', 'في مكالمة', count('on_call')], ['break', 'في بريك', count('break')], ['unknown', 'انقطاع رصد', count('unknown')], ['', 'سجّلوا ولسه في الكونسول', count('logged_in')], ['', 'عملاء منتظرين', qFresh ? waiting.length : 'غير متاح']]
      .map(([cls, label, n]) => h('div', { className: 'card ' + cls }, h('span', { textContent: label }), h('b', { textContent: n }))));
    const order = ['on_call', 'break', 'ready', 'unknown', 'logged_in', 'disconnected', 'logged_out', 'no_session'];
    const groups = order.map(s => [s, people.filter(p => p.s === s).sort((a, b) => (b.elapsed || 0) - (a.elapsed || 0))]).filter(([, list]) => list.length);
    $('staffNow').replaceChildren(...groups.map(([s, list]) => h('div', { className: 'group' }, h('h3', { textContent: (STATE[s] || s) + ' — ' + list.length }),
      h('div', { className: 'tiles' }, ...list.map(p => {
        const over = (s === 'break' && p.elapsed > 900) || (s === 'on_call' && p.elapsed > 240);
        return h('div', { className: 'tile ' + s + (over ? ' over' : ''), title: 'آخر إشارة ' + stamp(p.lastEvidence) },
          ['on_call', 'break'].includes(s) && p.elapsed != null ? h('time', { textContent: dur(p.elapsed) }) : null,
          h('strong', { textContent: p.name }),
          h('small', { textContent: [p.extension && 'تحويلة ' + p.extension, s === 'on_call' && p.phone, s === 'on_call' && p.queue && QUEUE(p.queue)].filter(Boolean).join(' · ') || ' ' }));
      })))));
    $('queueAge').textContent = q ? (qFresh ? 'تحديث منذ ' + Math.round(qAge) + ' ث' : 'آخر بيانات ' + clock(q.observedAt) + ' — قديمة') : 'الموصل مش شغال';
    table('queueNow', [
      { title: 'نوع الطلب', get: r => QUEUE(r.queue) },
      { title: 'الرقم', get: r => r.phone },
      { title: 'الانتظار', get: r => waitNow(r.wait, qAge), show: r => dur(waitNow(r.wait, qAge)), type: 'duration', cls: r => waitNow(r.wait, qAge) > 7 ? 'warn' : '' },
    ], waiting, { empty: qFresh ? 'مفيش حد منتظر' : 'بيانات الانتظار غير متاحة الآن' });
  }

  // Wait shown by Arabicss at the snapshot, plus the seconds since then.
  function waitNow(v, age) { const m = String(v).match(/^(\d+):(\d\d):(\d\d)$/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + Math.max(0, Math.round(age || 0)) : null; }

  // ---------- طلبات البريك (every page) ----------
  async function refreshRequests() {
    try { state.requests = await api('/api/break-requests'); } catch { return; }
    const pending = state.requests.requests.filter(r => r.status === 'pending');
    document.title = (pending.length ? '(' + pending.length + ') ' : '') + 'مرصد الأداء — الإدارة';
    const navBtn = document.querySelector('[data-view="now"]');
    navBtn.textContent = 'الآن' + (pending.length ? ' — ' + pending.length + ' طلب بريك' : '');
    $('breakRequests').replaceChildren(...(pending.length ? [h('div', { className: 'requests' }, h('h2', { textContent: 'طلبات بريك مستنية موافقة — ' + pending.length }),
      ...pending.map(r => h('div', { className: 'row' }, h('span', { textContent: r.employee + ' · تحويلة ' + (r.extension || '—') + ' · ' + r.requestedMinutes + ' دقيقة · من ' + clock(r.createdAt) }),
        state.requests.canDecide ? h('span', { className: 'inline' }, ...[['approve', 'موافقة', ''], ['reject', 'رفض', 'danger']].map(([action, label, cls]) => { const b = h('button', { textContent: label, className: cls }); b.onclick = async () => { b.disabled = true; try { await api('/api/break-requests', { method: 'POST', body: { action, id: r.id } }); } catch (e) { alert(e.message); } refreshRequests(); }; return b; })) : pill('للعرض فقط')))) ] : []));
  }

  // ---------- ملخص اليوم ----------
  async function renderDay() {
    const hd = await dayHistory(), r = hd.report;
    $('dayNote').textContent = r ? 'يوم التشغيل ' + state.day + ' من 9 ص لحد 9 ص اليوم اللي بعده (التشغيل لحد 3 الفجر) · آخر سحب للسجل ' + stamp(r.importedAt) + (r.verifiedTotal ? '' : ' · السجل غير مكتمل التحقق') + (r.missingCalendarDates?.length ? ' · ناقص سجل يوم ' + r.missingCalendarDates.join('، ') : '') : 'مفيش سجل أرابيكس محفوظ لليوم ده.';
    $('dayCards').replaceChildren(...(r ? [['مكالمات محتسبة', r.calls], ['تم الرد', r.answered], ['فائتة محتسبة', r.abandoned], ['الرد خلال 10 ث', pct(r.sla)], ['متوسط انتظار الرد', secs(r.asa)], ['نسبة الفائتة', pct(r.abandonmentRate)], ['متوسط مدة المكالمة', dur(r.meanCallSeconds)], ['فائتة قصيرة ≤7ث', r.shortAbandoned], ['خارج ساعات العمل', r.afterHours]] : [])
      .map(([k, v]) => h('div', { className: 'card' }, h('span', { textContent: k }), h('b', { textContent: v }))));
    table('queueTable', queueColumns, hd.queues || []);
  }
  const queueColumns = [
    { title: 'نوع الطلب', get: q => q.label }, { title: 'رقم القائمة', get: q => q.queue },
    { title: 'محتسبة', get: q => q.calls, type: 'number' }, { title: 'تم الرد', get: q => q.answered, type: 'number' }, { title: 'فائتة', get: q => q.abandoned, type: 'number' },
    { title: 'الرد خلال 10 ث', get: q => q.sla, show: q => pct(q.sla), type: 'percent' }, { title: 'متوسط الانتظار (ث)', get: q => q.asa == null ? null : Math.round(q.asa * 10) / 10, type: 'number' },
    { title: 'نسبة الفائتة', get: q => q.abandonmentRate, show: q => pct(q.abandonmentRate), type: 'percent' }];

  // ---------- الموظفون ----------
  const teamRows = d => d.employees.map(e => ({ id: e.employeeId, name: e.name, calls: e.calls, answered: e.answered, aht: e.averageCallSeconds, work: e.workSeconds, ready: e.readySeconds,
    onCall: e.callSeconds, unknown: e.gapSeconds, breakSeconds: e.breakSeconds, breakCount: e.breakCount, fromHistory: e.fromHistory, firstLogin: e.firstLogin, lastLogout: e.lastLogout }));
  const teamColumns = [
    { title: 'الموظف', get: r => r.name }, { title: 'مكالمات', get: r => r.calls, type: 'number' }, { title: 'تم الرد', get: r => r.answered, type: 'number' }, { title: 'منها من سجل أرابيكس', get: r => r.fromHistory, type: 'number' },
    { title: 'متوسط مدة المكالمة', get: r => r.aht, show: r => dur(r.aht), type: 'duration' }, { title: 'مدة العمل', get: r => r.work, show: r => dur(r.work), type: 'duration' },
    { title: 'متاح', get: r => r.ready, show: r => dur(r.ready), type: 'duration' }, { title: 'في مكالمة', get: r => r.onCall, show: r => dur(r.onCall), type: 'duration' },
    { title: 'انقطاع رصد', get: r => r.unknown, show: r => dur(r.unknown), type: 'duration' },
    { title: 'البريك', get: r => r.breakSeconds, show: r => r.breakSeconds > 1800 ? pill(dur(r.breakSeconds), 'warn') : dur(r.breakSeconds), type: 'duration' }, { title: 'عدد البريكات', get: r => r.breakCount, type: 'number' },
    { title: 'أول دخول', get: r => r.firstLogin, show: r => clock(r.firstLogin), type: 'datetime' }, { title: 'آخر خروج', get: r => r.lastLogout, show: r => clock(r.lastLogout), type: 'datetime' }];
  async function renderTeam() {
    const d = await dayData();
    table('teamTable', teamColumns, teamRows(d), { onRow: r => showEmployee(d, r.id) });
  }
  function showEmployee(d, id) {
    $('employeePanel').hidden = false; $('employeeTitle').textContent = name(id) + ' — يوم ' + state.day;
    const parts = [h('h3', { textContent: 'الجلسات' }), h('div'), h('h3', { textContent: 'الحالات خلال اليوم' }), h('div'), h('h3', { textContent: 'البريكات' }), h('div'), h('h3', { textContent: 'المكالمات' }), h('div')];
    $('employeeDetail').replaceChildren(...parts);
    table(parts[1], [{ title: 'التحويلة', get: s => s.extension }, { title: 'البداية', get: s => s.startedAt, show: s => stamp(s.startedAt), type: 'datetime' }, { title: 'النهاية', get: s => s.endedAt, show: s => s.running ? 'شغالة' : stamp(s.endedAt || s.observedThrough), type: 'datetime' },
      { title: 'المدة في اليوم', get: s => s.daySeconds, show: s => dur(s.daySeconds), type: 'duration' }, { title: 'انتهت إزاي', get: s => s.running ? 'شغالة' : s.closureKnown ? REASON[s.reason] || s.reason : 'من غير خروج مسجل — محسوبة لحد آخر حالة' }],
      d.sessions.filter(s => s.employeeId === id && s.workStartedAt != null));
    table(parts[3], [{ title: 'الحالة', get: s => STATE[s.state] || s.state }, { title: 'من', get: s => s.startedAt, show: s => clock(s.startedAt), type: 'datetime' }, { title: 'إلى', get: s => s.endedAt, show: s => clock(s.endedAt), type: 'datetime' }, { title: 'المدة', get: s => s.durationSeconds, show: s => dur(s.durationSeconds), type: 'duration' }],
      d.states.filter(s => s.employeeId === id && s.state !== 'offline').map(s => s.outsideHours ? { ...s, state: s.state + '_night' } : s).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)));
    table(parts[5], [{ title: 'من', get: b => b.startedAt, show: b => clock(b.startedAt), type: 'datetime' }, { title: 'إلى', get: b => b.endedAt, show: b => clock(b.endedAt), type: 'datetime' }, { title: 'المدة', get: b => b.durationSeconds, show: b => dur(b.durationSeconds), type: 'duration' }],
      d.states.filter(b => b.employeeId === id && b.state === 'break').sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)));
    table(parts[7], callColumns.slice(1), d.calls.filter(c => c.employeeId === id));
    $('employeePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- المكالمات ----------
  const callColumns = [
    { title: 'الموظف', get: c => c.employee || name(c.employeeId) }, { title: 'التحويلة', get: c => c.extension }, { title: 'الرقم', get: c => c.phone },
    { title: 'البداية', get: c => c.startedAt, show: c => stamp(c.startedAt), type: 'datetime' },
    { title: 'المدة', get: c => c.complete ? c.durationSeconds : null, show: c => c.complete ? dur(c.durationSeconds) : 'بدون نهاية مسجلة', type: 'duration' },
    { title: 'المصدر', get: c => c.source === 'history' ? 'من سجل أرابيكس' : 'الإضافة' },
    { title: 'ملاحظة', get: c => c.outsideHours ? 'خارج ساعات التشغيل' : '' }];
  function filteredCalls(d) {
    const q = $('callSearch').value.trim(), emp = $('callEmployee').value, st = $('callStatus').value;
    return d.calls.filter(c => (!emp || c.employeeId === Number(emp)) && (!st || (st === 'complete') === c.complete) && (!q || (name(c.employeeId) + ' ' + c.phone).includes(q)));
  }
  async function renderCalls() {
    const d = await dayData(), list = filteredCalls(d), done = list.filter(c => c.complete);
    const a = d.history.attribution;
    $('callsNote').textContent = list.length + ' مكالمة · ' + done.length + ' مكتملة · متوسط المدة ' + dur(done.length ? done.reduce((n, c) => n + c.durationSeconds, 0) / done.length : null)
      + (a ? ' · ' + a.recovered + ' اتضافت من سجل أرابيكس' : '');
    table('callsTable', callColumns, list);
    const u = d.history.unattributed || [];
    $('unattributedNote').textContent = u.length ? u.length + ' مكالمة اترد عليها في أرابيكس وقت ما مكانش فيه موظف مسجل في المرصد على التحويلة — يعني حد شغال من غير ما يكتب الباسورد.' : 'كل المكالمات المردود عليها في سجل أرابيكس معروف مين ردّ عليها.';
    table('unattributedTable', [{ title: 'الوقت', get: x => ampm(x.time) }, { title: 'الرقم', get: x => x.phone }, { title: 'التحويلة في أرابيكس', get: x => x.extension || '—' }, { title: 'نوع الطلب', get: x => QUEUE(x.queue) },
      { title: 'السبب', get: x => ({ nobody_on_extension: 'مفيش موظف مسجل على التحويلة وقتها', several_employees: 'أكتر من موظف على نفس التحويلة', no_extension: 'السجل من غير تحويلة' })[x.reason] || x.reason }], u, { empty: '' });
  }

  // ---------- الفائتة ----------
  const missedColumns = [
    { title: 'الوقت', get: m => ampm(m.end || m.start) }, { title: 'الرقم', get: m => m.phone }, { title: 'نوع الطلب', get: m => m.queueLabel },
    { title: 'الانتظار', get: m => m.waitSeconds, show: m => dur(m.waitSeconds), type: 'duration' }, { title: 'التصنيف', get: m => MISSED[m.classification] || m.classification, show: m => pill(MISSED[m.classification] || m.classification, m.classification === 'counted' ? 'bad' : '') },
    { title: '', get: () => '', show: m => { const b = h('button', { className: 'ghost small', textContent: 'مين كان متاح؟' }); b.onclick = e => { e.stopPropagation(); showContext(m); }; return b; } }];
  async function renderMissed() {
    const hd = await dayHistory(), f = $('missedClass').value;
    table('missedTable', missedColumns, (hd.missed || []).filter(m => !f || m.classification === f), { empty: hd.report ? 'مفيش مكالمات فائتة' : 'مفيش سجل أرابيكس لليوم ده' });
  }
  async function showContext(m) {
    const dlg = $('contextDialog');
    $('contextTitle').textContent = ampm(m.end || m.start) + ' — ' + m.phone + ' — ' + m.queueLabel;
    $('contextNote').textContent = 'جارٍ المراجعة…'; $('contextTable').replaceChildren(); dlg.showModal();
    try {
      const c = await api('/api/missed?date=' + state.day + '&index=' + m.index);
      $('contextNote').textContent = 'العميل دخل الطابور ' + clock(c.call.enteredAt) + ' وقفل ' + clock(c.call.leftAt) + ' بعد انتظار ' + dur(m.waitSeconds) + ' · ' + (c.readyCount ? c.readyCount + ' موظف كان متاح في الوقت ده' : 'مفيش موظف كان متاح')
        + (c.call.precision === 'minute' ? ' · توقيت السجل بالدقيقة، فالحالة اللي اتغيرت جوه نفس الدقيقة متعلّم عليها «غير محسومة».' : '');
      table('contextTable', [{ title: 'الموظف', get: e => e.name }, { title: 'لما العميل دخل', get: e => (STATE[e.atEntry] || e.atEntry) + (e.uncertain ? ' (غير محسومة)' : '') },
        { title: 'من بقاله', get: e => e.sinceSeconds, show: e => ['ready', 'on_call', 'break'].includes(e.atEntry) ? dur(e.sinceSeconds) : '—', type: 'duration' },
        { title: 'بقى متاح أثناء الانتظار', get: e => e.readyDuringWait ? 'أيوه من ' + clock(e.readyAt) : '—', cls: e => e.readyDuringWait ? 'warn' : '' },
        { title: 'لما العميل قفل', get: e => STATE[e.atExit] || e.atExit }, { title: 'التحويلة', get: e => e.extension || '—' }], c.employees, { empty: 'مفيش موظفين كانوا في الشيفت وقتها' });
    } catch (e) { $('contextNote').textContent = 'تعذر التحديد: ' + e.message; }
  }
  $('contextDialog').querySelector('[data-close]').onclick = () => $('contextDialog').close();

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
    table('employeesTable', [{ title: 'الاسم', get: e => e.name }, { title: 'الكود', get: e => e.employeeCode }, { title: 'الحالة', get: e => e.active ? 'نشط' : 'موقوف', show: e => pill(e.active ? 'نشط' : 'موقوف', e.active ? 'ok' : 'warn') },
      { title: '', get: () => '', show: e => !isAdmin() ? '' : h('span', { className: 'inline' },
        btn('الباسورد', async () => { const pin = await askPasswords('باسورد جديد لـ ' + e.name); if (pin == null) return; await act('employeeMessage', () => api('/api/employees', { method: 'PATCH', body: { id: e.id, pin, pinConfirmation: pin } }), 'اتغير الباسورد وانتهت جلسته الحالية'); }),
        btn(e.active ? 'إيقاف' : 'تفعيل', () => act('employeeMessage', () => api('/api/employees', { method: 'PATCH', body: { id: e.id, active: !e.active } }), 'اتحفظ')),
        btn('حذف', async () => { const code = prompt('حذف ' + e.name + ' نهائيًا؟ سجله بيفضل محفوظ. اكتب كوده للتأكيد: ' + e.employeeCode); if (code === null) return; await act('employeeMessage', () => api('/api/employees', { method: 'DELETE', body: { id: e.id, confirmCode: code } }), 'اتحذف'); }, 'danger')) }],
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
          btn(x.active ? 'إيقاف' : 'تفعيل', () => act('adminMessage', () => api('/api/admin-access', { method: 'PATCH', body: { id: x.id, active: !x.active } }), 'اتحفظ')),
          btn('حذف', () => confirm('حذف ' + x.name + '؟') && act('adminMessage', () => api('/api/admin-access', { method: 'DELETE', body: { id: x.id } }), 'اتحذف'), 'danger')) }], a.accounts || []);
    }
    $('telegramPanel').hidden = !isAdmin();
    if (isAdmin()) api('/api/import-old').then(r => { $('importPanel').hidden = !r.available; $('importLast').textContent = r.lastImportAt ? 'آخر نقل: ' + new Date(r.lastImportAt).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' }) : ''; }).catch(() => {});
    if (isAdmin()) renderTelegram().catch(e => say('tgNote', e.message));
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
    if (!confirm('نقل بيانات النظام القديم للسيرفر ده؟ العملية دي بتتعمل مرة واحدة.')) return;
    $('importButton').disabled = true;
    try {
      const { run } = await import('./import-old.js?v=2');
      const post = async body => {
        const r = await fetch(API + '/api/import-old/rows', { method: 'POST', headers: { 'x-admin-password': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { const e = Error(d.error || 'تعذر النقل (' + r.status + ')'); e.status = r.status; throw e; }
        return d;
      };
      const x = await run({ file: f, post, say: t => say('importNote', t), base: BASE });
      say('importNote', 'اتنقل: ' + x.employees + ' موظف، ' + x.adminAccounts + ' مستخدم إدارة، ' + x.sessions + ' جلسة، ' + x.events + ' حدث، ' + x.historyDays + ' يوم من سجل أرابيكس.');
      renderManage();
    } catch (e) { say('importNote', (e.message || 'تعذر النقل') + ' — تقدر تعيد المحاولة بنفس الملف، اللي اتنقل مش هيتكرر.'); } finally { $('importButton').disabled = false; }
  };

  // ---------- تليجرام ----------
  async function renderTelegram() {
    const t = await api('/api/telegram');
    $('tgStatus').textContent = !t.configured ? 'البوت مش مربوط.' : 'البوت: @' + t.botName + ' · ' + (t.chat ? 'الجروب: ' + t.chat.title : 'لسه مفيش جروب') + ' · ' + (t.enabled ? 'التنبيهات شغالة' : 'التنبيهات متوقفة');
    $('tgSettings').elements.enabled.checked = t.enabled;
    $('tgRules').replaceChildren(...t.rules.map(r => h('label', {}, h('input', { type: 'checkbox', name: 'rule', value: r.key, checked: r.on }), ' ' + r.label)));
    const log = (await api('/api/telegram?log=1&date=' + cairoToday())).log;
    table('tgLog', [{ title: 'الوقت', get: x => x.createdAt, show: x => clock(x.createdAt), type: 'datetime' }, { title: 'النوع', get: x => x.label }, { title: 'الرسالة', get: x => x.text.split('\n')[0] },
      { title: 'اتبعت', get: x => x.sentAt ? 'أيوه' : 'لأ' + (x.error ? ' — ' + x.error : '') }], log, { empty: 'مفيش تنبيهات النهارده', limit: 100 });
  }
  $('tgToken').onsubmit = async e => { e.preventDefault(); try { const r = await api('/api/telegram', { method: 'POST', body: { action: 'token', token: e.target.elements.token.value.trim() } }); e.target.reset(); say('tgNote', 'اتربط البوت @' + r.botName + '. ضيفه للجروب وابعت رسالة، وبعدين دوس «دور على الجروب».'); renderTelegram(); } catch (x) { say('tgNote', x.message); } };
  $('tgDiscover').onclick = async () => {
    try { const { chats } = await api('/api/telegram', { method: 'POST', body: { action: 'discover' } });
      if (!chats.length) return say('tgNote', 'البوت مش شايف أي جروب لسه. ضيفه للجروب وابعت فيه رسالة وجرب تاني.');
      $('tgChats').replaceChildren(...chats.map(c => h('option', { value: c.id, textContent: c.title }))); $('tgChats').hidden = $('tgChoose').hidden = false; say('tgNote', 'اختار الجروب ودوس ربط.');
    } catch (x) { say('tgNote', x.message); }
  };
  $('tgChoose').onclick = async () => { const o = $('tgChats').selectedOptions[0]; try { await api('/api/telegram', { method: 'POST', body: { action: 'chat', chatId: o.value, title: o.textContent } }); say('tgNote', 'اتربط الجروب وجاتلكم رسالة تأكيد.'); $('tgChats').hidden = $('tgChoose').hidden = true; renderTelegram(); } catch (x) { say('tgNote', x.message); } };
  $('tgTest').onclick = async () => { try { await api('/api/telegram', { method: 'POST', body: { action: 'test' } }); say('tgNote', 'اتبعتت رسالة تجربة.'); } catch (x) { say('tgNote', x.message); } };
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
      say('collectorNote', 'اتربط. الجهاز ده هيسحب سجل أرابيكس كل 5 دقايق والانتظار كل 3 ثواني، طول ما تقارير أرابيكس متسجل فيها دخول.');
    } catch (e) { say('collectorNote', e.message); }
  };

  // ---------- exports ----------
  document.addEventListener('click', async e => {
    const kind = e.target.closest('[data-export]')?.dataset.export;
    if (!kind) return;
    try {
      if (kind === 'queues') exportRows('انواع-الطلبات', queueColumns, (await dayHistory()).queues || []);
      if (kind === 'team') exportRows('اداء-الموظفين', teamColumns, teamRows(await dayData()));
      if (kind === 'calls') exportRows('المكالمات', callColumns, filteredCalls(await dayData()));
      if (kind === 'missed') exportRows('الفائتة', missedColumns.slice(0, -1), ((await dayHistory()).missed || []).filter(m => !$('missedClass').value || m.classification === $('missedClass').value));
    } catch (x) { showError(x); }
  });

  // ---------- navigation ----------
  const VIEWS = { now: ['الآن', null], day: ['ملخص اليوم', renderDay], team: ['الموظفون', renderTeam], calls: ['المكالمات', renderCalls], missed: ['المكالمات الفائتة', renderMissed], manage: ['الإدارة', renderManage] };
  async function show(view, force = false) {
    state.view = view;
    for (const b of document.querySelectorAll('#nav [data-view]')) b.classList.toggle('active', b.dataset.view === view);
    for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + view;
    $('title').textContent = VIEWS[view][0];
    $('dayPicker').hidden = !['day', 'team', 'calls', 'missed'].includes(view);
    if (view !== 'team') $('employeePanel').hidden = true;
    showError(null);
    if (view === 'now') return tick();
    try { syncStatus(true, 'جارٍ التحميل…'); if (force) { cache.delete('dash:' + state.day); cache.delete('hist:' + state.day); } await VIEWS[view][1](); syncStatus(true); } catch (e) { syncStatus(false); showError(e); }
  }
  document.querySelector('#nav nav').onclick = e => { const v = e.target.closest('[data-view]')?.dataset.view; if (v) show(v); };
  $('day').onchange = () => { state.day = $('day').value || cairoToday(); show(state.view); };
  for (const id of ['callSearch', 'callEmployee', 'callStatus']) $(id).addEventListener('input', () => renderCalls().catch(showError));
  $('missedClass').onchange = () => renderMissed().catch(showError);

  let ticking = false;
  async function tick() {
    if (!token || state.view !== 'now' || document.hidden || ticking) return;
    ticking = true;
    try { await refreshNow(); syncStatus(true); showError(null); } catch (e) { syncStatus(false); } finally { ticking = false; }
  }
  setInterval(tick, 1000);
  setInterval(() => { if (state.view === 'now') renderNow(); }, 1000);
  setInterval(() => { if (token) refreshRequests(); }, 5000);
  // Today's numbers on the open page refresh every minute.
  setInterval(() => { if (token && state.view !== 'now' && state.view !== 'manage' && state.day === cairoToday() && !document.hidden) show(state.view, true); }, 60000);

  // ---------- sign in ----------
  async function enter() {
    const d = await api('/api/admin-access');
    who = d.identity;
    $('who').textContent = who.name + ' · ' + ROLE[who.role];
    $('login').hidden = true; $('app').hidden = false;
    $('day').value = state.day; $('day').max = cairoToday();
    await loadEmployees();
    refreshRequests();
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
