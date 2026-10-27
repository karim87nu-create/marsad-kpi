'use strict';
// مرصد الدهان — what ties the reports together:
// - مراجعة الاستثناءات: every flagged item (entry error, late website transfer, late leaving, Talabat order not on Apex)
//   can be answered «مش غلط» (with the reason) or «غلط فعلًا»; patterns answered «مش غلط» 3 times are learned.
// - المبيعات: per branch, platform, payment and service type, officer orders out of every total.
// - ملف الفرع: one branch across Apex, the website and Talabat.
// - the employee profile's orders part: what the person entered on Apex, their entry errors and Talabat entry speed.
// Branch names are unified on the Apex name, using what the monitor learned from sure links.
window.MarsadInsights = function MarsadInsights(ctx) {
  const { api, h, $, table, kpi, pill, C, state, exportRows, canWrite, isAdmin, OR, SITE } = ctx;
  const money = v => v == null ? '—' : Math.round(Number(v)).toLocaleString('en') + ' ج';
  const secs = v => v == null ? '—' : v < 60 ? Math.round(v) + ' ث' : Math.floor(v / 60) + ' د ' + Math.round(v % 60) + ' ث';
  const norm = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^\s*(فرع|الدهان)[\s,،]*/g, '').trim();
  const words = s => norm(s).split(/[\s،,\-]+/).filter(w => w.length > 2);

  // ---------- مراجعة الاستثناءات ----------
  let rv = { key: '', at: 0, data: { reviews: [], patterns: {}, reasons: {} } };
  async function reviews(force) {
    const k = state.day + ':' + state.to;
    if (force || rv.key !== k || Date.now() - rv.at > 15000) rv = { key: k, at: Date.now(), data: await api('/api/exception-reviews?from=' + state.day + '&to=' + state.to) };
    return rv.data;
  }
  // item: { key, source, ref, day, signature }
  function judge(item) {
    const r = rv.data.reviews.find(x => x.key === item.key), p = item.signature ? rv.data.patterns[item.signature] : null;
    if (r) return { status: r.verdict, review: r, pattern: p };
    if (p?.learned) return { status: 'learned', pattern: p };
    return { status: 'open', pattern: p };
  }
  const counts = item => judge(item).status === 'error';   // Only reviewed errors count against an employee.
  const REASON = () => rv.data.reasons || {};
  async function answer(item, verdict, reason, note) {
    await api('/api/exception-reviews', { method: 'POST', body: { ...item, verdict, reason, note } });
    await reviews(true); ctx.rerender();
  }
  // The review control for one row.
  function cell(item) {
    const j = judge(item), box = h('span', { className: 'inline review' });
    if (j.status === 'ok' || j.status === 'error') {
      box.append(pill(j.status === 'ok' ? 'مش غلط: ' + (REASON()[j.review.reason] || 'سبب تاني') : 'غلط فعلًا', j.status === 'ok' ? 'ok' : 'bad'));
      if (j.review.note) box.title = j.review.note;
      if (canWrite()) box.append(btn('رجوع', () => answer(item, null)));
      return box;
    }
    if (j.status === 'learned') box.append(pill('غالبًا مش غلط: ' + (REASON()[j.pattern.reason] || ''), 'info'));
    else if (j.pattern?.ok) box.append(h('small', { className: 'muted', textContent: 'زيه اتقال عليه «مش غلط» ' + j.pattern.ok + ' مرة' }));
    if (!canWrite()) return box.childNodes.length ? box : '—';
    const sel = h('select', { ariaLabel: 'مش غلط ليه' }, h('option', { value: '', textContent: 'مش غلط…' }), ...Object.entries(REASON()).map(([k, v]) => h('option', { value: k, textContent: v })));
    sel.onchange = () => { if (!sel.value) return; const note = sel.value === 'other' ? prompt('اكتب السبب') : ''; answer(item, 'ok', sel.value, note || ''); };
    box.append(sel, btn('غلط فعلًا', () => answer(item, 'error'), 'danger'));
    return box;
  }
  const btn = (text, fn, cls) => { const b = h('button', { type: 'button', className: (cls === 'danger' ? 'danger' : 'ghost') + ' small', textContent: text }); b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
  const reviewColumn = itemOf => ({ title: 'المراجعة', get: x => judge(itemOf(x)).status, show: x => cell(itemOf(x)) });
  // Item builders (the signature must match the server's for Apex entry issues).
  const items = {
    entry: x => ({ key: 'entry:' + (x.day || state.day) + ':' + x.type + ':' + x.no, source: 'entry', ref: x.no, day: x.day || state.day, signature: 'entry:' + (x.type || '') + ':' + (x.kind || '') + ':' + (x.branch || '') }),
    lateOut: x => ({ key: 'lateOut:' + (x.day || state.day) + ':' + x.no, source: 'lateOut', ref: x.no, day: x.day || state.day, signature: 'lateOut:' + (x.branch || '') + ':' + (x.kind || '') }),
    siteTransfer: (x, day) => ({ key: 'siteTransfer:' + x.id, source: 'siteTransfer', ref: x.id, day, signature: 'siteTransfer:' + (x.branch || '') + (x.transfers > 1 ? ':re' : '') }),
    siteLate: (x, day) => ({ key: 'siteLate:' + x.id, source: 'siteLate', ref: x.id, day, signature: 'siteLate:' + (x.branch || '') + ':' + (x.prepLate ? 'prep' : 'delivery') + (x.transfers > 1 ? ':re' : '') }),
    talabatNE: (x, day) => ({ key: 'talabatNE:' + x.id, source: 'talabatNE', ref: x.id, day, signature: 'talabatNE:' + (x.store || '') }),
    talabatItems: (x, day) => ({ key: 'talabatItems:' + x.id, source: 'talabatItems', ref: x.id, day, signature: 'talabatItems:' + (x.store || '') }),
  };

  // ---------- branch names: Apex is the reference ----------
  let learned = null, learnedAt = 0;
  async function aliases() {
    if (!learned || Date.now() - learnedAt > 60000) { learned = (await api('/api/learned').catch(() => ({ facts: [] }))).facts; learnedAt = Date.now(); }
    return learned;
  }
  // A website / Talabat branch name → the Apex branch name (learned first, then shared words).
  function canon(name, apexNames, kind) {
    if (!name) return null;
    const best = (learned || []).filter(f => f.kind === kind && f.a === name).sort((a, b) => b.evidence - a.evidence)[0];
    if (best && apexNames.includes(best.b)) return best.b;
    if (apexNames.includes(name)) return name;
    const w = words(name);
    return apexNames.find(a => words(a).some(x => w.some(y => y.includes(x) || x.includes(y)))) || name;
  }

  // ---------- المبيعات ----------
  let sales = null;
  async function renderSales() {
    const [m, off] = await Promise.all([OR.period(), api('/api/orders/officer').catch(() => ({ values: [] }))]);
    const rows = m.sales || [], has = rows.length > 0;
    $('salesNote').textContent = !m.linked ? 'مرصد الأوردرات مش متربط لسه.' : !has && m.receivedAt ? 'المبيعات بالتفصيل بتظهر مع نسخة سكريبت الكاشير الجديدة (بتشتغل لوحدها خلال دقايق).' : 'من Apex · أوردرات الأوفيسر مش داخلة في أي إجمالي' + (m.officer.orders ? ' (' + m.officer.orders + ' أوردر أوفيسر بـ ' + money(m.officer.sales) + ')' : '');
    const f = { branch: $('salesBranch').value, kind: $('salesKind').value, pay: $('salesPay').value };
    const fill = (id, vals) => { const sel = $(id), v = sel.value; sel.replaceChildren(h('option', { value: '', textContent: sel.dataset.all }), ...vals.map(x => h('option', { value: x, textContent: x || '—' }))); sel.value = vals.includes(v) ? v : ''; };
    fill('salesBranch', [...new Set(rows.map(r => r.branch))].sort()); fill('salesKind', [...new Set(rows.map(r => r.kind))]); fill('salesPay', [...new Set(rows.map(r => r.pay))].sort());
    const list = rows.filter(r => (!f.branch || r.branch === f.branch) && (!f.kind || r.kind === f.kind) && (!f.pay || r.pay === f.pay));
    sales = list;
    const sum = (l, k) => l.reduce((n, r) => n + (Number(r[k]) || 0), 0), o = sum(list, 'orders'), s = sum(list, 'sales'), dsc = sum(list, 'discounts');
    $('salesCards').replaceChildren(kpi('الأوردرات', o, 'info'), kpi('المبيعات', money(s)), kpi('الخصومات', money(dsc), dsc ? 'warn' : ''), kpi('الصافي', money(s - dsc), 'good'), kpi('متوسط الفاتورة', o ? money(s / o) : '—'),
      kpi('أوفيسر (مش محسوب)', m.officer.orders || 0, '', m.officer.orders ? money(m.officer.sales) : ''));
    // Pivot: rows × columns of sales, with totals.
    const pivot = (box, rowKey, colKey, title) => {
      const rk = [...new Set(list.map(r => r[rowKey]))].sort(), ck = [...new Set(list.map(r => r[colKey]))].sort();
      const cellOf = (a, b) => list.filter(r => r[rowKey] === a && r[colKey] === b);
      const data = rk.map(a => ({ name: a, cols: Object.fromEntries(ck.map(b => [b, cellOf(a, b)])), all: list.filter(r => r[rowKey] === a) }));
      data.push({ name: 'الإجمالي', cols: Object.fromEntries(ck.map(b => [b, list.filter(r => r[colKey] === b)])), all: list, total: true });
      table(box, [{ title, get: x => x.name, cls: x => x.total ? 'total' : '' }, ...ck.map(b => ({ title: b || '—', get: x => Math.round(sum(x.cols[b], 'sales')), show: x => sum(x.cols[b], 'orders') ? money(sum(x.cols[b], 'sales')) + ' · ' + sum(x.cols[b], 'orders') : '—', type: 'number', cls: x => x.total ? 'total' : '' })),
        { title: 'الإجمالي', get: x => Math.round(sum(x.all, 'sales')), show: x => money(sum(x.all, 'sales')) + ' · ' + sum(x.all, 'orders'), type: 'number', cls: () => 'total' }], data, { empty: 'مفيش مبيعات' });
      return data;
    };
    pivot('salesByKind', 'branch', 'kind', 'الفرع');
    pivot('salesByPay', 'branch', 'pay', 'الفرع');
    pivot('salesByTrans', 'branch', 'trans', 'الفرع');
    table('salesDetail', salesColumns, list, { empty: 'مفيش مبيعات' });
    // Which values are officer (admin): every payment / service / platform value seen, with a switch.
    const seen = [...new Set([...rows.flatMap(r => [r.pay, r.trans]), ...off.values])].filter(Boolean).sort();
    $('officerPanel').hidden = !isAdmin();
    $('officerValues').replaceChildren(...seen.map(v => { const c = h('input', { type: 'checkbox', checked: off.values.includes(v) }); c.onchange = async () => { const vals = c.checked ? [...off.values, v] : off.values.filter(x => x !== v); await api('/api/orders/officer', { method: 'PUT', body: { values: vals } }); OR.clear(); renderSales().catch(ctx.showError); }; return h('label', { className: 'chipcheck' }, c, ' ' + v); }));
  }
  const salesColumns = [{ title: 'الفرع', get: r => r.branch }, { title: 'المنصة', get: r => r.kind }, { title: 'طريقة الدفع', get: r => r.pay || '—' }, { title: 'نوع الخدمة', get: r => r.trans || '—' },
    { title: 'الأوردرات', get: r => r.orders, type: 'number' }, { title: 'المبيعات', get: r => Math.round(r.sales), show: r => money(r.sales), type: 'number' }, { title: 'الخصومات', get: r => Math.round(r.discounts || 0), show: r => money(r.discounts), type: 'number' },
    { title: 'الصافي', get: r => Math.round(r.sales - (r.discounts || 0)), show: r => money(r.sales - (r.discounts || 0)), type: 'number' }, { title: 'متوسط الفاتورة', get: r => r.orders ? Math.round(r.sales / r.orders) : null, type: 'number' }];
  for (const id of ['salesBranch', 'salesKind', 'salesPay']) $(id).onchange = () => renderSales().catch(ctx.showError);

  // ---------- ملف الفرع ----------
  async function renderBranch() {
    const [m] = await Promise.all([OR.period(), reviews(), aliases()]);
    const [site, tal] = await Promise.all([api('/api/site/day?day=' + state.day).catch(() => null), api('/api/talabat/day?day=' + state.day).catch(() => null)]);
    const apexNames = [...new Set([...m.branches.map(b => b.name), ...(m.sales || []).map(r => r.branch)])].sort();
    const sel = $('branchFile'), v = sel.value;
    sel.replaceChildren(...apexNames.map(n => h('option', { value: n, textContent: n }))); sel.value = apexNames.includes(v) ? v : apexNames[0] || '';
    const b = sel.value, body = $('branchFileBody');
    if (!b) { body.replaceChildren(h('p', { className: 'muted', textContent: 'مفيش بيانات فروع للفترة دي' })); return; }
    const ab = m.branches.find(x => x.name === b) || {}, bs = (m.sales || []).filter(r => r.branch === b), sum = (l, k) => l.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    const late = m.lateOut.filter(x => x.branch === b), lateCounted = late.filter(x => counts(items.lateOut(x)));
    const canc = m.cancels.filter(x => x.branch === b), iss = m.issues.filter(x => x.branch === b), issCounted = iss.filter(x => counts(items.entry(x)));
    const parts = [], mineC = await ownedBy('branch', b);
    parts.push(h('h3', { textContent: 'Apex' }), h('div', { className: 'cards' }, kpi('الأوردرات', ab.orders ?? 0, 'info'), kpi('المبيعات', money(bs.length ? sum(bs, 'sales') : ab.sales)),
      kpi('متوسط الخروج', ab.avgOut == null ? '—' : ab.avgOut.toFixed(1) + ' د', ab.avgOut >= 30 ? 'bad' : ab.avgOut >= 20 ? 'warn' : 'good'),
      kpi('خرجوا بعد 30 دقيقة', lateCounted.length, lateCounted.length ? 'warn' : 'good', late.length > lateCounted.length ? (late.length - lateCounted.length) + ' اتراجعوا «مش غلط»' : ''),
      kpi('إلغاء بعد التحميل', canc.length, canc.length ? 'bad' : 'good', canc.length ? money(sum(canc, 'amount')) : ''), kpi('أخطاء إدخال', issCounted.length, issCounted.length ? 'bad' : 'good'),
      kpi('إلغاءات على الفرع', mineC.length, mineC.length ? 'bad' : 'good', 'من كل المصادر')));
    if (bs.length) {
      const byKind = [...new Set(bs.map(r => r.kind))].map(k => ({ name: k, sales: sum(bs.filter(r => r.kind === k), 'sales'), orders: sum(bs.filter(r => r.kind === k), 'orders') })).sort((a, c) => c.sales - a.sales);
      const byPay = [...new Set(bs.map(r => r.pay))].map(k => ({ name: k || '—', sales: sum(bs.filter(r => r.pay === k), 'sales'), orders: sum(bs.filter(r => r.pay === k), 'orders') })).sort((a, c) => c.sales - a.sales);
      const rank = list => { const max = Math.max(1, ...list.map(x => x.sales)); return h('div', { className: 'ranks' }, ...list.map(x => h('div', { className: 'r' }, h('span', { textContent: x.name }), h('b', { textContent: money(x.sales) + ' · ' + x.orders }), C.meter(x.sales, max)))); };
      parts.push(h('div', { className: 'two' }, h('article', { className: 'panel' }, h('h2', { textContent: 'المبيعات حسب المنصة' }), rank(byKind)), h('article', { className: 'panel' }, h('h2', { textContent: 'المبيعات حسب طريقة الدفع' }), rank(byPay))));
    }
    if (site?.linked) {
      const rows = SITE.branchRows(site).filter(x => canon(x.branch, apexNames, 'branch:site') === b), tr = SITE.transferRows(site).filter(x => canon(x.branch, apexNames, 'branch:site') === b);
      const lateS = rows.filter(x => x.late && counts(items.siteLate(x, site.day))), trLate = tr.filter(x => x.late && counts(items.siteTransfer(x, site.day)));
      const prep = rows.filter(x => x.prep != null && !x.prepOngoing).map(x => x.prep / 60000);
      parts.push(h('h3', { textContent: 'الموقع' }), h('div', { className: 'cards' }, kpi('أوردرات دليفري', rows.length, 'info'), kpi('متوسط التجهيز', prep.length ? (prep.reduce((a, c) => a + c, 0) / prep.length).toFixed(1) + ' د' : '—'),
        kpi('تجهيز أو توصيل أكتر من 30 د', lateS.length, lateS.length ? 'bad' : 'good'), kpi('اتحوّلت للفرع بعد 5 د', trLate.length, trLate.length ? 'warn' : 'good'), kpi('اتحوّلت بين فروع', tr.filter(x => x.transfers > 1).length)));
    }
    if (tal?.linked) {
      const o = tal.orders.filter(x => canon(x.store, apexNames, 'branch:talabat') === b), acc = o.filter(x => x.acceptSeconds != null), cc = o.filter(x => x.status === 'CANCELLED');
      const ne = tal.apexLinked ? o.filter(x => !x.apex && x.acceptedAt && x.status !== 'CANCELLED' && counts(items.talabatNE(x, tal.day))) : [];
      parts.push(h('h3', { textContent: 'طلبات' }), h('div', { className: 'cards' }, kpi('أوردرات', o.length, 'info'), kpi('متوسط القبول', acc.length ? secs(acc.reduce((a, c) => a + c.acceptSeconds, 0) / acc.length) : '—'),
        kpi('اتلغت', cc.length, cc.length ? 'bad' : 'good', cc.filter(x => x.cancelOwner === 'Vendor').length + ' بسبب المطعم'), kpi('مش لاقيينها على Apex', ne.length, ne.length ? 'bad' : 'good')));
    }
    const pending = [...lateCounted.map(x => ['خرج متأخر', '#' + (x.sn ?? x.no) + ' · ' + x.wait + ' د', x]), ...issCounted.map(x => ['خطأ إدخال', '#' + (x.sn ?? x.no) + ' · ' + x.detail, x])];
    if (pending.length) parts.push(h('article', { className: 'panel' }, h('h2', { textContent: 'محتاج مراجعة' }), (() => { const box = h('div'); table(box, [{ title: 'النوع', get: p => p[0] }, { title: 'التفاصيل', get: p => p[1], cls: () => 'wrap' },
      { title: 'المراجعة', get: () => '', show: p => cell(p[0] === 'خطأ إدخال' ? items.entry(p[2]) : items.lateOut(p[2])) }], pending); return box; })()));
    body.replaceChildren(...parts);
  }
  $('branchFile').onchange = () => renderBranch().catch(ctx.showError);

  // ---------- the employee profile: orders ----------
  async function employeeOrders(name, box) {
    box.replaceChildren(h('p', { className: 'muted', textContent: 'جارٍ تحميل الأوردرات…' }));
    try {
      const [m] = await Promise.all([OR.period(), reviews()]);
      const st = m.staff.find(s => s.name === name), iss = m.issues.filter(x => x.user === name), cnt = iss.filter(x => counts(items.entry(x)));
      const tal = await api('/api/talabat/day?day=' + state.day).catch(() => null);
      const mine = (tal?.orders || []).filter(x => x.apex?.user === name && x.acceptedAt), delays = mine.map(x => (Date.parse(x.apex.at) - Date.parse(x.acceptedAt)) / 1000).filter(x => x >= 0);
      const mineC = await ownedBy('employee', name);
      if (!st && !iss.length && !mine.length && !mineC.length) { box.replaceChildren(h('p', { className: 'muted', textContent: 'مفيش أوردرات ضربها في الفترة دي (لو بيضرب على Apex باسم تاني اربطه من «الإدارة» ← «توحيد الأسماء مع Apex»).' })); return; }
      box.replaceChildren(h('div', { className: 'cards' }, kpi('أوردرات ضربها', st?.orders ?? 0, 'info', st ? Object.entries(st.kinds).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(' · ') : ''), kpi('مبيعاتها', money(st?.sales)),
        kpi('خصومات', money(st?.discounts), st?.discounts ? 'warn' : ''), kpi('أخطاء إدخال', cnt.length, cnt.length ? 'bad' : 'good', iss.length > cnt.length ? (iss.length - cnt.length) + ' اتراجعوا «مش غلط»' : ''),
        kpi('ضربها واتلغت بعد التحميل', st?.cancels ?? 0, st?.cancels ? 'warn' : ''), kpi('إلغاءات بسببه', mineC.length, mineC.length ? 'bad' : 'good', mineC.map(x => x.why[0]).filter(Boolean).slice(0, 2).join(' · ')), kpi('من قبول طلبات للضرب', delays.length ? secs(delays.reduce((a, c) => a + c, 0) / delays.length) : '—', '', delays.length ? 'متوسط ' + delays.length + ' أوردر' : '')),
        ...(iss.length ? [(() => { const t = h('div'); table(t, [{ title: 'الأوردر', get: x => x.sn ?? x.no }, { title: 'الفرع', get: x => x.branch }, { title: 'النوع', get: x => x.type }, { title: 'التفاصيل', get: x => x.detail, cls: () => 'wrap' }, reviewColumn(items.entry)], iss); return t; })()] : []));
    } catch (e) { box.replaceChildren(h('p', { className: 'error', textContent: e.message })); }
  }

  // ---------- الإلغاءات: on whom (suggested by the monitor, confirmed by a supervisor) ----------
  let co = { key: '', data: null };
  async function owners(force) {
    const k = state.day + ':' + state.to;
    if (force || co.key !== k || !co.data) co = { key: k, data: await api('/api/cancels/owners?from=' + state.day + '&to=' + state.to) };
    return co.data;
  }
  const OWN_CLS = { employee: 'bad', branch: 'warn', pilot: 'warn', customer: '', platform: 'info', other: '' };
  function ownerCell(x, O) {
    const label = x.final ? O[x.final] + (x.finalName ? ': ' + x.finalName : '') : 'مش واضح';
    const box = h('span', { className: 'inline' }, pill((x.confirmed ? '✓ ' : 'غالبًا ') + label, x.final ? OWN_CLS[x.final] : ''));
    if (canWrite()) {
      const sel = h('select', { ariaLabel: 'الإلغاء على مين' }, h('option', { value: '', textContent: x.confirmed ? 'غيّر' : 'أكّد / غيّر' }),
        ...Object.entries(O).map(([k, v]) => h('option', { value: k, textContent: v + (k === x.owner ? ' (اقتراح المرصد)' : '') })), ...(x.confirmed ? [h('option', { value: '__clear', textContent: 'رجّع اقتراح المرصد' })] : []));
      sel.onchange = async () => {
        if (!sel.value) return;
        try { await api('/api/cancels/owner', { method: 'POST', body: { key: x.key, day: x.day, owner: sel.value === '__clear' ? null : sel.value, reasonKey: x.reasonKey } }); await renderCancelOwners(true); } catch (e) { ctx.showError(e); }
      };
      box.append(sel);
    }
    return box;
  }
  let ownersRows = [];
  const ownerColumns = O => [{ title: 'اليوم', get: x => x.day }, { title: 'المصدر', get: x => x.source === 'talabat' ? 'طلبات' : 'Apex' }, { title: 'الأوردر', get: x => x.source === 'talabat' ? x.ref + (x.apexNo ? ' · Apex #' + (x.apexSn ?? x.apexNo) : '') : '#' + (x.apexSn ?? x.ref) },
    { title: 'الفرع', get: x => x.branch || x.store || '—' }, { title: 'اتلغى', get: x => x.at, type: 'datetime' }, { title: 'ضربه', get: x => x.user || '—' }, { title: 'السبب', get: x => x.reason || '—', cls: () => 'wrap' },
    { title: 'المرصد شايف', get: x => x.why.join(' · ') || '—', cls: () => 'wrap muted' }, { title: 'على مين', get: x => x.final ? O[x.final] + (x.finalName ? ': ' + x.finalName : '') : 'مش واضح', show: x => ownerCell(x, O) },
    { title: 'المبلغ', get: x => x.amount, type: 'number' }];
  async function renderCancelOwners(force) {
    const d = await owners(force), O = d.owners, pick = $('cancelPick').value;
    const list = ownersRows = d.list.filter(x => !pick || x.branch === pick || canon(x.store, [pick], 'branch:talabat') === pick);
    const by = new Map(); for (const x of list) { const k = x.final || 'unknown'; by.set(k, (by.get(k) || 0) + 1); }
    const people = new Map(); for (const x of list) if (x.final === 'employee' && x.finalName) people.set(x.finalName, (people.get(x.finalName) || 0) + 1);
    const max = Math.max(1, ...by.values());
    $('cancelOwnerRanks').replaceChildren(list.length ? h('div', { className: 'two' },
      h('div', { className: 'ranks' }, ...[...by].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('div', { className: 'r' }, h('span', { textContent: O[k] || 'مش واضح' }), h('b', { textContent: String(n) }), C.meter(n, max, 'var(--bad)')))),
      h('div', { className: 'ranks' }, ...(people.size ? [...people].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('div', { className: 'r' }, h('span', { textContent: k }), h('b', { textContent: n + ' إلغاء بسببه' }))) : [h('p', { className: 'muted', textContent: 'مفيش إلغاءات على موظفين' })])))
      : h('p', { className: 'muted', textContent: 'مفيش إلغاءات في الفترة دي' }));
    table('cancelOwners', ownerColumns(O), list, { empty: 'مفيش إلغاءات' });
  }
  // How many cancellations are on a person or a branch (confirmed, or the monitor's suggestion).
  async function ownedBy(kind, name) {
    try { const d = await owners(); await aliases(); return d.list.filter(x => x.final === kind && (x.finalName === name || (kind === 'branch' && canon(x.finalName, [name], 'branch:talabat') === name))); } catch { return []; }
  }
  $('cancelPick').addEventListener('change', () => renderCancelOwners().catch(ctx.showError));

  function exportKind(kind) {
    if (kind === 'cancelOwners' && co.data) exportRows('الإلغاءات-على-مين', ownerColumns(co.data.owners), ownersRows);
    else if (kind === 'sales' && sales) exportRows('المبيعات', salesColumns, sales); else return false;
    return true;
  }
  return { reviews, judge, counts, cell, reviewColumn, items, renderSales, renderBranch, employeeOrders, renderCancelOwners, exportKind, aliases, canon };
};
