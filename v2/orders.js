'use strict';
// مرصد الدهان — الفروع وضرب الأوردرات. Drawn from /api/orders/live: one summary per Apex day, pushed by the
// monitor on the cashier PC every 15 seconds (it reads Apex only). The live board counts its timers every second.
window.MarsadOrders = function MarsadOrders(ctx) {
  const { api, h, $, table, kpi, pill, C, exportRows, serverNow, cairoToday, state, hm } = ctx;

  // ---------- naming ----------
  // Anything without an online mark (طلبات / الموقع / وفرها) is a Hotline order.
  const kindOf = k => (k == null ? '' : String(k).trim()) || 'Hotline';
  const KINDS = ['Hotline', 'طلبات', 'الموقع', 'وفرها'];
  const KIND_CLASS = { Hotline: 'k-hot', 'طلبات': 'k-tal', 'الموقع': 'k-web', 'وفرها': 'k-waf' };
  const KIND_COLOR = { Hotline: 'var(--accent)', 'طلبات': '#fb923c', 'الموقع': '#a78bfa', 'وفرها': '#f472b6' };
  const kindPill = k => h('span', { className: 'kind ' + (KIND_CLASS[kindOf(k)] || 'k-other'), textContent: kindOf(k) });
  // The kinds that appear in this data (the four always, others only when they have orders).
  const kindsIn = counts => [...KINDS, ...Object.keys(counts || {}).map(kindOf).filter(k => !KINDS.includes(k) && counts[k])];
  const kinds = obj => { const o = {}; for (const [k, v] of Object.entries(obj || {})) { const n = kindOf(k); o[n] = (o[n] || 0) + (Number(v) || 0); } return o; };
  const money = v => v == null ? '—' : Math.round(Number(v)).toLocaleString('en') + ' ج';
  const mins = v => v == null ? '—' : Math.round(Number(v)) + ' د';
  const clockAt = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }) : '—';
  const timer = s => { s = Math.max(0, Math.floor(s)); const hr = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return hr ? hr + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x; };

  // ---------- data ----------
  const cache = new Map();
  async function dayOf(day, force) {
    const hit = cache.get(day), fresh = day === cairoToday() ? 15000 : 600000;
    if (!force && hit && Date.now() - hit.at < fresh) return hit.value;
    const value = await api('/api/orders/live?day=' + day);
    cache.set(day, { at: Date.now(), value });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return value;
  }
  // Apex user names shown as the employee's Marsad name (الإدارة ← توحيد الأسماء); staff rows of one person merge.
  function named(d, map) {
    const n = x => (x && map && map[x]) || x;
    const staff = new Map();
    for (const x of d.staff || []) {
      const k = n(x.name), y = staff.get(k);
      if (!y) { staff.set(k, { ...x, name: k, kinds: { ...(x.kinds || {}) } }); continue; }
      for (const f of ['orders', 'sales', 'discounts', 'issues', 'cancels']) y[f] = (y[f] || 0) + (x[f] || 0);
      for (const [kk, v] of Object.entries(x.kinds || {})) y.kinds[kk] = (y.kinds[kk] || 0) + v;
      if (x.first && (!y.first || x.first < y.first)) y.first = x.first; if (x.last && (!y.last || x.last > y.last)) y.last = x.last;
    }
    return { ...d, staff: [...staff.values()], open: (d.open || []).map(o => ({ ...o, user: n(o.user) })), issues: (d.issues || []).map(o => ({ ...o, user: n(o.user) })),
      cancels: (d.cancels || []).map(o => ({ ...o, user: n(o.user), by: n(o.by), pilot: n(o.pilot) })), lateOut: d.lateOut && d.lateOut.map(o => ({ ...o, user: n(o.user), pilot: n(o.pilot) })) };
  }
  const dayList = (from, to) => { const out = []; for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
  // The selected period, every day merged (sums; average leave time weighted by the orders that left).
  async function period(force = false) {
    const days = dayList(state.day, state.to);
    if (days.length > 31) throw Error('تقارير الفروع لحد 31 يوم في المرة');
    const got = await Promise.all(days.map(d => dayOf(d, force)));
    const m = { days, missing: [], linked: got.some(g => g.linked), lastPush: got[0]?.lastPush, receivedAt: null, totals: { orders: 0, sales: 0, kinds: {}, outCount: 0, outLate: 0, cancels: 0, cancelSales: 0, discounts: 0, issues: 0, open: 0, late: 0 },
      branches: new Map(), staff: new Map(), cancels: [], issues: [], lateOut: [], hours: new Map(), hasLateOut: false, settings: { late: 30, veryLate: 45 }, sales: new Map(), officer: { orders: 0, sales: 0 } };
    let outSum = 0;
    got.forEach((g, i) => {
      const d = g.data ? named(g.data, g.apexNames) : null, day = days[i];
      if (!d) { m.missing.push(day); return; }
      if (!m.receivedAt || g.receivedAt > m.receivedAt) m.receivedAt = g.receivedAt;
      if (d.settings) m.settings = d.settings;
      const t = d.totals || {};
      for (const k of ['orders', 'sales', 'cancels', 'cancelSales', 'discounts', 'issues']) m.totals[k] += Number(t[k]) || 0;
      if (day === cairoToday()) { m.totals.open += Number(t.open) || 0; m.totals.late += Number(t.late) || 0; }
      for (const [k, v] of Object.entries(kinds(t.kinds))) m.totals.kinds[k] = (m.totals.kinds[k] || 0) + v;
      for (const b of d.branches || []) {
        const x = m.branches.get(b.name) || { name: b.name, orders: 0, sales: 0, kinds: {}, outCount: 0, outLate: 0, outSum: 0, cancels: 0, cancelSales: 0, open: 0, late: 0 };
        for (const k of ['orders', 'sales', 'outCount', 'outLate', 'cancels', 'cancelSales']) x[k] += Number(b[k]) || 0;
        if (b.avgOut != null) x.outSum += b.avgOut * (b.outCount || 0);
        if (day === cairoToday()) { x.open += b.open || 0; x.late += b.late || 0; }
        for (const [k, v] of Object.entries(kinds(b.kinds))) x.kinds[k] = (x.kinds[k] || 0) + v;
        m.branches.set(b.name, x);
        m.totals.outCount += Number(b.outCount) || 0; m.totals.outLate += Number(b.outLate) || 0; if (b.avgOut != null) outSum += b.avgOut * (b.outCount || 0);
      }
      for (const s of d.staff || []) {
        const x = m.staff.get(s.name) || { name: s.name || 'بدون اسم', orders: 0, kinds: {}, sales: 0, discounts: 0, issues: 0, cancels: 0, first: null, last: null, days: 0 };
        for (const k of ['orders', 'sales', 'discounts', 'issues', 'cancels']) x[k] += Number(s[k]) || 0;
        for (const [k, v] of Object.entries(kinds(s.kinds))) x.kinds[k] = (x.kinds[k] || 0) + v;
        if (s.first && (!x.first || s.first < x.first)) x.first = s.first;
        if (s.last && (!x.last || s.last > x.last)) x.last = s.last;
        x.days++; m.staff.set(s.name, x);
      }
      for (const c of d.cancels || []) m.cancels.push({ ...c, kind: kindOf(c.kind), day });
      for (const r of d.sales || []) {
        const k = [r.branch, kindOf(r.kind), r.pay || '', r.trans || ''].join('|'), x = m.sales.get(k) || { branch: r.branch, kind: kindOf(r.kind), pay: r.pay || '', trans: r.trans || '', orders: 0, sales: 0, discounts: 0 };
        x.orders += Number(r.orders) || 0; x.sales += Number(r.sales) || 0; x.discounts += Number(r.discounts) || 0; m.sales.set(k, x);
      }
      if (d.officer) { m.officer.orders += Number(d.officer.orders) || 0; m.officer.sales += Number(d.officer.sales) || 0; }
      for (const c of d.issues || []) m.issues.push({ ...c, kind: kindOf(c.kind), day });
      if (Array.isArray(d.lateOut)) { m.hasLateOut = true; for (const c of d.lateOut) m.lateOut.push({ ...c, kind: kindOf(c.kind), day }); }
      for (const x of d.hours || []) {
        const y = m.hours.get(x.h) || { h: x.h, orders: 0, kinds: {} };
        y.orders += x.orders || 0; for (const [k, v] of Object.entries(kinds(x.kinds))) y.kinds[k] = (y.kinds[k] || 0) + v;
        m.hours.set(x.h, y);
      }
    });
    m.totals.avgOut = m.totals.outCount ? outSum / m.totals.outCount : null;
    m.branches = [...m.branches.values()].map(b => ({ ...b, avgOut: b.outCount ? b.outSum / b.outCount : null, lateRate: b.outCount ? b.outLate / b.outCount * 100 : null }));
    m.staff = [...m.staff.values()];
    m.sales = [...m.sales.values()];
    m.hours = [...m.hours.values()].sort((a, b) => (a.h - 9 + 24) % 24 - (b.h - 9 + 24) % 24);
    return m;
  }
  const periodNote = (id, m) => {
    const parts = [];
    if (!m.linked) parts.push('مرصد الأوردرات مش متربط لسه: من «الإدارة» طلّع المفتاح وشغّل setup.bat على جهاز الكاشير.');
    else parts.push('من Apex على جهاز الكاشير' + (m.receivedAt ? ' · آخر قراءة ' + new Date(m.receivedAt).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''));
    if (m.missing.length && m.missing.length < m.days.length) parts.push('مفيش بيانات ليوم ' + m.missing.join('، '));
    else if (m.missing.length) parts.push('مفيش بيانات أوردرات للفترة دي');
    $(id).textContent = parts.join(' · ');
  };
  const fillBranches = (sel, m) => { const v = sel.value, names = [...new Set([...m.branches.map(b => b.name), ...m.cancels.map(c => c.branch)])].filter(Boolean).sort(); sel.replaceChildren(h('option', { value: '', textContent: 'كل الفروع' }), ...names.map(n => h('option', { value: n, textContent: n }))); sel.value = names.includes(v) ? v : ''; };
  const kindColumns = list => kindsIn(Object.assign({}, ...list.map(x => x.kinds))).map(k => ({ title: k, get: x => x.kinds[k] || 0, type: 'number' }));
  const dayCol = () => state.day !== state.to ? [{ title: 'اليوم', get: x => x.day }] : [];

  // ---------- ضرب الأوردرات (call center) ----------
  let entry = null;
  const staffColumns = () => [{ title: 'الموظف', get: x => x.name }, { title: 'الأوردرات', get: x => x.orders, type: 'number' }, ...kindColumns(entry?.staff || []),
    { title: 'المبيعات', get: x => Math.round(x.sales), show: x => money(x.sales), type: 'number' }, { title: 'الخصومات', get: x => Math.round(x.discounts), show: x => money(x.discounts), type: 'number', cls: x => x.discounts ? 'warn' : '' },
    { title: 'أخطاء إدخال محتملة', get: x => entry?.counted ? entry.counted.filter(i => i.user === x.name).length : x.issues, type: 'number', cls: x => (entry?.counted ? entry.counted.filter(i => i.user === x.name).length : x.issues) ? 'bad' : '' }, { title: 'ضربها واتلغت بعد التحميل', get: x => x.cancels, type: 'number', cls: x => x.cancels ? 'warn' : '' },
    { title: 'أول أوردر', get: x => x.first, show: x => hm(x.first), type: 'datetime' }, { title: 'آخر أوردر', get: x => x.last, show: x => hm(x.last), type: 'datetime' }];
  const issueColumns = () => [...dayCol(), { title: 'النوع', get: x => x.type, show: x => pill(x.type === 'تكرار' ? 'أوردر متكرر' : 'طريقة الدفع', x.type === 'تكرار' ? 'warn' : 'bad') }, { title: 'الأوردر', get: x => x.sn ?? x.no, type: 'number' },
    { title: 'الفرع', get: x => x.branch }, { title: 'نوع الأوردر', get: x => x.kind }, { title: 'الموظف', get: x => x.user }, { title: 'الوقت', get: x => x.at, show: x => hm(x.at), type: 'datetime' }, { title: 'التفاصيل', get: x => x.detail, cls: () => 'wrap' }, ...(ctx.review ? [R().reviewColumn(R().items.entry)] : [])];
  const R = () => ctx.review();
  async function renderEntry(force) {
    const [m] = await Promise.all([period(force), R().reviews()]), t = m.totals; entry = m;
    const counted = m.issues.filter(x => R().counts(R().items.entry(x)));
    m.counted = counted;
    periodNote('entryNote', m);
    const online = t.orders - (t.kinds.Hotline || 0);
    $('entryCards').replaceChildren(kpi('الأوردرات اللي اتضربت', t.orders, 'info'), kpi('Hotline', t.kinds.Hotline || 0, '', t.orders ? Math.round((t.kinds.Hotline || 0) / t.orders * 100) + '% من الأوردرات' : ''),
      kpi('أونلاين', online, '', KINDS.slice(1).map(k => k + ' ' + (t.kinds[k] || 0)).join(' · ')), kpi('موظفين ضربوا أوردرات', m.staff.length),
      kpi('أخطاء إدخال محتملة', counted.length, counted.length ? 'bad' : 'good', m.issues.length > counted.length ? (m.issues.length - counted.length) + ' اتراجعت «مش غلط»' : 'راجعها من الجدول تحت'), kpi('إجمالي الخصومات', money(t.discounts), t.discounts ? 'warn' : ''));
    table('entryStaff', staffColumns(), [...m.staff].sort((a, b) => b.orders - a.orders), { empty: m.linked ? 'مفيش أوردرات في الفترة دي' : 'مرصد الأوردرات مش متربط لسه' });
    const sel = $('entryWho'), v = sel.value, names = [...new Set(m.issues.map(x => x.user))].filter(Boolean).sort();
    sel.replaceChildren(h('option', { value: '', textContent: 'كل الموظفين' }), ...names.map(n => h('option', { value: n, textContent: n }))); sel.value = names.includes(v) ? v : '';
    table('entryIssues', issueColumns(), entryIssues(), { empty: 'مفيش أخطاء إدخال محتملة' });
  }
  const entryIssues = () => (entry?.issues || []).filter(x => !$('entryWho').value || x.user === $('entryWho').value).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  $('entryWho').onchange = () => table('entryIssues', issueColumns(), entryIssues(), { empty: 'مفيش أخطاء إدخال محتملة' });

  // ---------- أداء الفروع ----------
  let rep = null;
  const branchColumns = () => [{ title: 'الفرع', get: b => b.name }, { title: 'الأوردرات', get: b => b.orders, type: 'number' }, ...kindColumns(rep?.branches || []),
    { title: 'المبيعات', get: b => Math.round(b.sales), show: b => money(b.sales), type: 'number' },
    { title: 'خرجوا مع طيار', get: b => b.outCount, type: 'number' }, { title: 'متوسط وقت الخروج (د)', get: b => b.avgOut == null ? null : Math.round(b.avgOut * 10) / 10, type: 'number', cls: b => b.avgOut >= 30 ? 'bad' : b.avgOut >= 20 ? 'warn' : '' },
    { title: 'خرجوا بعد 30 د', get: b => b.outLate, type: 'number', cls: b => b.outLate ? 'warn' : '' }, { title: 'نسبة التأخير', get: b => b.lateRate == null ? null : Math.round(b.lateRate * 10) / 10, show: b => b.lateRate == null ? '—' : b.lateRate.toFixed(1) + '%', type: 'percent', cls: b => b.lateRate >= 15 ? 'bad' : b.lateRate >= 5 ? 'warn' : '' },
    { title: 'إلغاء بعد التحميل', get: b => b.cancels, type: 'number', cls: b => b.cancels ? 'bad' : '' }, { title: 'قيمة الإلغاء', get: b => Math.round(b.cancelSales), show: b => money(b.cancelSales), type: 'number' }];
  const lateColumns = () => [...dayCol(), { title: 'الأوردر', get: x => x.sn ?? x.no, type: 'number' }, { title: 'الفرع', get: x => x.branch }, { title: 'النوع', get: x => x.kind, show: x => kindPill(x.kind) },
    { title: 'اتضرب', get: x => x.at, show: x => hm(x.at), type: 'datetime' }, { title: 'اتحمّل على الطيار', get: x => x.out, show: x => hm(x.out), type: 'datetime' },
    { title: 'وقت الخروج (د)', get: x => x.wait, type: 'number', cls: x => x.wait >= 45 ? 'bad' : 'warn' }, { title: 'الطيار', get: x => x.pilot }, { title: 'ضربه', get: x => x.user }, { title: 'المبلغ', get: x => Math.round(x.amount || 0), show: x => money(x.amount), type: 'number' }, ...(ctx.review ? [R().reviewColumn(R().items.lateOut)] : [])];
  const pickB = sel => x => !$(sel).value || (x.branch ?? x.name) === $(sel).value;
  async function renderBranches(force) {
    const [m] = await Promise.all([period(force), R().reviews()]); rep = m;
    periodNote('branchNote', m); fillBranches($('branchPick'), m);
    const list = m.branches.filter(pickB('branchPick')), sum = k => list.reduce((n, b) => n + (b[k] || 0), 0);
    const outCount = sum('outCount'), outSum = list.reduce((n, b) => n + b.outSum, 0), ks = {};
    for (const b of list) for (const [k, v] of Object.entries(b.kinds)) ks[k] = (ks[k] || 0) + v;
    const avgOut = outCount ? outSum / outCount : null, late = sum('outLate'), rate = outCount ? late / outCount * 100 : null;
    $('branchCards').replaceChildren(kpi('الأوردرات', sum('orders'), 'info', kindsIn(ks).filter(k => ks[k]).map(k => k + ' ' + ks[k]).join(' · ')), kpi('المبيعات', money(sum('sales'))),
      kpi('متوسط وقت الخروج', avgOut == null ? '—' : avgOut.toFixed(1) + ' د', avgOut == null ? '' : avgOut < 20 ? 'good' : avgOut < 30 ? 'warn' : 'bad', 'من ضرب الأوردر لحد ما اتحمّل على الطيار'),
      kpi('خرجوا بعد 30 دقيقة', late, late ? 'warn' : 'good', rate == null ? '' : rate.toFixed(1) + '% من ' + outCount + ' أوردر خرج'),
      kpi('إلغاء بعد التحميل', sum('cancels'), sum('cancels') ? 'bad' : 'good', money(sum('cancelSales'))));
    table('branchTable', branchColumns(), list, { empty: m.linked ? 'مفيش بيانات للفترة دي' : 'مرصد الأوردرات مش متربط لسه' });
    // Hours: all branches (the summary per hour is not split by branch).
    const series = kindsIn(Object.assign({}, ...m.hours.map(x => x.kinds))).map(k => ({ key: k, label: k, color: KIND_COLOR[k] || 'var(--off)' }));
    if (m.hours.length) C.bars($('branchHours'), m.hours.map(x => ({ label: (x.h % 12 || 12) + (x.h < 12 ? 'ص' : 'م'), values: Object.fromEntries(series.map(s => [s.key, x.kinds[s.key] || 0])), tip: x.orders + ' أوردر · ' + series.filter(s => x.kinds[s.key]).map(s => s.label + ' ' + x.kinds[s.key]).join(' · ') })), series);
    else $('branchHours').replaceChildren(h('p', { className: 'muted', textContent: 'مفيش بيانات' }));
    table('lateOutTable', lateColumns(), m.lateOut.filter(pickB('branchPick')).sort((a, b) => b.wait - a.wait), { empty: m.hasLateOut || !m.receivedAt ? 'مفيش أوردرات خرجت بعد 30 دقيقة' : 'القايمة دي بتظهر مع نسخة سكريبت الكاشير الجديدة' });
  }
  $('branchPick').onchange = () => renderBranches().catch(ctx.showError);

  // ---------- الإلغاءات ----------
  let can = null;
  const cancelColumns = () => [...dayCol(), { title: 'الأوردر', get: x => x.sn ?? x.no, type: 'number' }, { title: 'الفرع', get: x => x.branch }, { title: 'النوع', get: x => x.kind, show: x => kindPill(x.kind) },
    { title: 'المبلغ', get: x => Math.round(x.amount || 0), show: x => money(x.amount), type: 'number' }, { title: 'الطيار', get: x => x.pilot }, { title: 'ضربه', get: x => x.user }, { title: 'لغاه', get: x => x.by },
    { title: 'وقت الإلغاء', get: x => x.at, show: x => hm(x.at), type: 'datetime' }, { title: 'بعد التحميل بـ (د)', get: x => x.afterOut, type: 'number' }, { title: 'السبب', get: x => x.reason || '—', cls: () => 'wrap' }];
  async function renderCancels(force) {
    const m = can = await period(force);
    fillBranches($('cancelPick'), m);
    const list = m.cancels.filter(pickB('cancelPick')), total = list.reduce((n, c) => n + (Number(c.amount) || 0), 0);
    const after = list.filter(c => c.afterOut != null).map(c => c.afterOut), byWho = new Map();
    for (const c of list) byWho.set(c.by || '—', (byWho.get(c.by || '—') || 0) + 1);
    const top = [...byWho].sort((a, b) => b[1] - a[1])[0];
    $('cancelCards').replaceChildren(kpi('إلغاء بعد التحميل', list.length, list.length ? 'bad' : 'good'), kpi('قيمة الإلغاء', money(total), list.length ? 'bad' : ''),
      kpi('متوسط الوقت بعد التحميل', after.length ? Math.round(after.reduce((n, v) => n + v, 0) / after.length) + ' د' : '—'), kpi('أكتر حد لغى', top ? top[0] : '—', '', top ? top[1] + ' إلغاء' : ''));
    const byB = new Map(); for (const c of list) { const x = byB.get(c.branch) || { name: c.branch, n: 0, v: 0 }; x.n++; x.v += Number(c.amount) || 0; byB.set(c.branch, x); }
    const rows = [...byB.values()].sort((a, b) => b.n - a.n), max = Math.max(1, ...rows.map(r => r.n));
    $('cancelRanks').replaceChildren(rows.length ? h('div', { className: 'ranks' }, ...rows.map(r => h('div', { className: 'r' }, h('span', { textContent: r.name }), h('b', { textContent: r.n + ' · ' + money(r.v) }), C.meter(r.n, max, 'var(--bad)')))) : h('p', { className: 'muted', textContent: 'مفيش إلغاءات بعد التحميل' }));
    table('cancelTable', cancelColumns(), [...list].sort((a, b) => String(b.at).localeCompare(String(a.at))), { empty: m.linked ? 'مفيش إلغاءات بعد التحميل' : 'مرصد الأوردرات مش متربط لسه' });
  }
  $('cancelPick').onchange = () => renderCancels().catch(ctx.showError);

  // ---------- الفروع الآن (live board) ----------
  const B = { live: null, at: 0, key: '', tickets: [], root: null };
  const el = (tag, cls, text) => h(tag, { className: cls || '', ...(text != null ? { textContent: String(text) } : {}) });
  const level = (min, s) => min >= s.veryLate ? 'red' : min >= s.late ? 'late' : min >= s.late * 2 / 3 ? 'warm' : 'fresh';
  function skeleton() {
    const root = el('div', 'ob');
    const head = el('div', 'ob-head'), verdict = el('div', 'ob-verdict'), word = el('span', 'ob-word'), line = el('span', 'ob-line');
    verdict.append(word, line);
    const counts = el('div', 'ob-counts'), cnt = {};
    for (const [k, label] of [['open', 'لسه في الفروع'], ['late', 'عدّى 30 دقيقة'], ['red', 'عدّى 45 دقيقة'], ['outLate', 'خرج متأخر النهارده'], ['cancels', 'إلغاء بعد التحميل']]) {
      const box = el('div', 'ob-count ' + k), n = el('span', 'n', '0'); box.append(n, el('span', 'l', label)); counts.append(box); cnt[k] = n;
    }
    const tools = el('div', 'ob-tools'), clock = el('span', 'ob-clock'), age = el('span', 'ob-age muted');
    const full = h('button', { type: 'button', className: 'ghost small', title: 'شاشة كاملة', ariaLabel: 'شاشة كاملة' });
    full.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-expand"/></svg>شاشة كاملة';
    full.onclick = () => { const v = $('view-branchesNow'); if (document.fullscreenElement) document.exitFullscreen?.(); else v.requestFullscreen?.().catch(() => {}); };
    tools.append(clock, age, full);
    head.append(verdict, counts);
    const stale = el('p', 'stalebar'); stale.hidden = true; stale.setAttribute('role', 'alert');
    const board = el('div', 'ob-board'), feed = el('div', 'ob-feed');
    root.append(tools, head, stale, board, feed);
    Object.assign(B, { root, word, line, cnt, clock, age, stale, board, feed });
    $('boardRoot').replaceChildren(root);
  }
  document.addEventListener('fullscreenchange', () => $('view-branchesNow').classList.toggle('tv', document.fullscreenElement === $('view-branchesNow')));

  async function refreshBoard() {
    const d = await api('/api/orders/live?day=latest', { timeout: 6000 });
    B.live = d; B.at = Date.now();
    badge(d);
    if (state.view === 'branchesNow') drawBoard();
  }
  function badge(d) { const n = d?.data && (d.ageSeconds ?? 999) < 120 ? (d.data.totals?.late || 0) : 0; $('lateBadge').hidden = !n; $('lateBadge').textContent = n; }

  function drawBoard() {
    if (!B.root) skeleton();
    const d = B.live, data = d?.data && named(d.data, d.apexNames), s = data?.settings || { late: 30, veryLate: 45 };
    if (!d || !d.linked || !data) {
      B.board.replaceChildren(h('div', { className: 'ob-empty' }, h('strong', { textContent: !d ? 'جارٍ التحميل…' : !d.linked ? 'مرصد الأوردرات مش متربط لسه' : 'لسه مفيش بيانات من جهاز الكاشير' }),
        d && h('p', { className: 'muted', textContent: !d.linked ? 'من «الإدارة» دوس «طلّع مفتاح مرصد الأوردرات»، وشغّل setup.bat على جهاز الكاشير والصق المفتاح.' : 'أول ما السكريبت على جهاز الكاشير يشتغل، الأوردرات اللي لسه ماخرجتش هتظهر هنا.' })));
      B.word.textContent = 'الفروع الآن'; B.line.textContent = ''; B.stale.hidden = true; B.key = ''; B.tickets = [];
      for (const n of Object.values(B.cnt)) n.textContent = '—';
      B.feed.replaceChildren(); tickBoard(); return;
    }
    const open = (data.open || []).map(o => ({ ...o, kind: kindOf(o.kind) }));
    const names = [...new Set([...(data.branches || []).map(b => b.name), ...open.map(o => o.branch)])];
    const by = new Map(names.map(n => [n, []])); for (const o of open) by.get(o.branch).push(o);
    const info = new Map((data.branches || []).map(b => [b.name, b]));
    names.sort((a, b) => by.get(b).length - by.get(a).length || a.localeCompare(b, 'ar'));
    const key = JSON.stringify([names, open.map(o => [o.no, o.at, o.branch])]);
    if (key !== B.key) {
      B.key = key; B.tickets = [];
      B.board.replaceChildren(...names.map(n => {
        const list = by.get(n).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), b = info.get(n) || {};
        const col = el('section', 'ob-col'), head = el('header', 'ob-col-h');
        const num = el('b', 'ob-n', list.length);
        head.append(h('div', {}, el('h3', '', n), el('small', 'muted', list.length ? 'أوردر لسه ماخرجش' : 'كل الأوردرات خرجت')), num);
        const stats = el('div', 'ob-stats');
        for (const [l, v, bad] of [['النهارده', (b.orders ?? 0) + ' أوردر'], ['متوسط الخروج', b.avgOut == null ? '—' : Math.round(b.avgOut) + ' د', b.avgOut >= s.late], ['خرج متأخر', b.outLate ?? 0, b.outLate > 0], ['إلغاء', b.cancels ?? 0, b.cancels > 0]])
          stats.append(h('span', { className: bad ? 'hot' : '' }, el('small', '', l), el('b', '', v)));
        const lane = el('div', 'ob-lane');
        if (!list.length) lane.append(el('div', 'ob-clear', '✓'));
        for (const o of list) {
          const t = el('article', 'ob-t'), tm = el('span', 'ob-timer'), bar = el('span', 'fill');
          const barBox = el('div', 'ob-bar'); barBox.append(bar, h('i', { className: 'tick', style: 'inset-inline-start:' + (s.late / s.veryLate * 100) + '%' }));
          t.append(h('div', { className: 'ob-t-top' }, tm, kindPill(o.kind)), h('div', { className: 'ob-t-mid' }, el('b', '', '#' + (o.sn ?? o.no)), el('span', 'muted', 'اتضرب ' + clockAt(o.at))), barBox,
            el('small', 'muted', [o.user, money(o.amount)].filter(x => x && x !== '—').join(' · ')));
          t.title = 'أوردر ' + (o.sn ?? o.no) + ' · ' + o.kind + ' · ' + n;
          lane.append(t); B.tickets.push({ o, t, tm, bar, col });
        }
        col.append(head, stats, lane); col._n = num; col._count = list.length;
        return col;
      }));
    }
    const t = data.totals || {};
    B.cnt.outLate.textContent = t.outLate ?? (data.branches || []).reduce((n, b) => n + (b.outLate || 0), 0);
    B.cnt.cancels.textContent = t.cancels ?? 0;
    const alerts = (d.alerts || []).slice(0, 8);
    B.feed.replaceChildren(...(alerts.length ? [el('h3', 'ob-feed-t', 'آخر تنبيهات الأوردرات'), ...alerts.map(a => h('div', { className: 'ob-alert ' + a.kind }, el('time', '', clockAt(a.at)), el('span', '', a.text.split('\n').slice(0, 2).join(' — '))))] : []));
    tickBoard();
  }
  // Every second: timers, colours and the verdict from the entry time (the summary itself comes every 15 seconds).
  function tickBoard() {
    if (!B.root) return;
    const d = B.live, data = d?.data, s = data?.settings || { late: 30, veryLate: 45 }, now = serverNow();
    B.clock.textContent = new Date(now).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!data) { B.age.textContent = ''; return; }
    const age = (d.ageSeconds ?? 0) + (Date.now() - B.at) / 1000, stale = age > 60 || Date.now() - B.at > 30000;
    B.age.textContent = 'آخر قراءة من Apex من ' + timer(age);
    B.stale.hidden = !stale;
    B.stale.textContent = stale ? 'مرصد الأوردرات مش بيبعت من ' + (d.lastPush ? clockAt(d.lastPush) : '—') + ' — الأوردرات دي ممكن تكون خرجت. اتأكد إن جهاز الكاشير شغال ومتوصل بالنت.' : '';
    $('view-branchesNow').classList.toggle('stale', stale);
    let late = 0, red = 0, oldest = null;
    const cols = new Map();
    for (const x of B.tickets) {
      const sec = (now - Date.parse(x.o.at)) / 1000, min = sec / 60, lv = level(min, s);
      x.tm.textContent = timer(sec);
      x.bar.style.width = Math.min(100, min / s.veryLate * 100) + '%';
      x.t.className = 'ob-t ' + lv;
      if (lv === 'late') late++; if (lv === 'red') { red++; late++; }
      if (!oldest || sec > oldest.sec) oldest = { sec, o: x.o };
      const c = cols.get(x.col) || 'fresh'; const rank = { fresh: 0, warm: 1, late: 2, red: 3 }; if (rank[lv] > rank[c]) cols.set(x.col, lv); else cols.set(x.col, c);
    }
    for (const col of B.board.children) if (col._n) col.className = 'ob-col ' + (cols.get(col) || (col._count ? 'fresh' : 'clear'));
    B.cnt.open.textContent = B.tickets.length; B.cnt.late.textContent = late; B.cnt.red.textContent = red;
    B.root.classList.toggle('alarm', red > 0 && !stale);
    B.word.className = 'ob-word ' + (red ? 'red' : late ? 'late' : 'ok');
    B.word.textContent = red ? 'تأخير شديد' : late ? 'في تأخير' : B.tickets.length ? 'الفروع ماشية' : 'كل الأوردرات خرجت';
    B.line.textContent = oldest ? B.tickets.length + ' أوردر دليفري لسه ماخرجش · أقدم واحد في ' + oldest.o.branch + ' بقاله ' + Math.floor(oldest.sec / 60) + ' دقيقة (#' + oldest.o.no + ')' : 'مفيش أوردر دليفري مستني في أي فرع';
  }

  // ---------- exports ----------
  function exportKind(kind) {
    if (kind === 'entryStaff' && entry) exportRows('ضرب-الأوردرات', staffColumns(), entry.staff);
    else if (kind === 'entryIssues' && entry) exportRows('أخطاء-الإدخال', issueColumns(), entryIssues());
    else if (kind === 'branches' && rep) exportRows('أداء-الفروع', branchColumns(), rep.branches.filter(pickB('branchPick')));
    else if (kind === 'lateOut' && rep) exportRows('خرجت-متأخر', lateColumns(), rep.lateOut.filter(pickB('branchPick')));
    else if (kind === 'cancels' && can) exportRows('الإلغاءات', cancelColumns(), can.cancels.filter(pickB('cancelPick')));
    else return false;
    return true;
  }

  // ---------- the monitor's key (الإدارة) ----------
  async function renderKey(isAdmin) {
    $('ordersKeyPanel').hidden = !isAdmin;
    if (!isAdmin) return;
    const k = await api('/api/orders/token');
    const age = k.lastPush ? (serverNow() - Date.parse(k.lastPush)) / 1000 : null;
    $('ordersKeyStatus').replaceChildren(!k.linked ? pill('لسه مفيش مفتاح', 'warn') : pill('فيه مفتاح', 'ok'), ' ',
      k.lastPush ? h('span', { className: age < 120 ? 'ok' : 'muted', textContent: 'آخر إرسال من جهاز الكاشير ' + new Date(k.lastPush).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + (age < 120 ? ' — شغال' : '') }) : h('span', { className: 'muted', textContent: 'جهاز الكاشير لسه مابعتش' }));
    $('ordersKeyMake').textContent = k.linked ? 'طلّع مفتاح جديد لمرصد الأوردرات' : 'طلّع مفتاح مرصد الأوردرات';
    $('ordersKeyMake').dataset.linked = k.linked ? '1' : '';
  }
  $('ordersKeyMake').onclick = async () => {
    if ($('ordersKeyMake').dataset.linked && !confirm('مفتاح جديد؟ المفتاح القديم هيبطل فورًا، وجهاز الكاشير هيقف عن الإرسال لحد ما تشغّل setup.bat عليه وتلصق الجديد.')) return;
    $('ordersKeyMake').disabled = true;
    try {
      const { token } = await api('/api/orders/token', { method: 'POST' });
      $('ordersKeyValue').value = token; $('ordersKeyBox').hidden = false;
      $('ordersKeyNote').textContent = 'انسخ المفتاح دلوقتي، مش هيظهر تاني. على جهاز الكاشير شغّل setup.bat والصقه لما يطلب Key.';
      renderKey(true).catch(() => {});
    } catch (e) { $('ordersKeyNote').textContent = e.message; } finally { $('ordersKeyMake').disabled = false; }
  };
  $('ordersKeyCopy').onclick = async () => {
    const v = $('ordersKeyValue').value;
    try { await navigator.clipboard.writeText(v); $('ordersKeyNote').textContent = 'اتنسخ. على جهاز الكاشير شغّل setup.bat والصقه لما يطلب Key.'; }
    catch { $('ordersKeyValue').select(); $('ordersKeyNote').textContent = 'علّم المفتاح وانسخه بـ Ctrl+C.'; }
  };

  return { renderEntry, renderBranches, renderCancels, refreshBoard, drawBoard, tickBoard, exportKind, renderKey, kindOf, period, clear: () => cache.clear() };
};
