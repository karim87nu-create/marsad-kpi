'use strict';
// مرصد الدهان — خدمة العملاء (Karim 11-16): the team's customer-service sheet entered here — each comment, complaint or
// rating (Talabat, the website, calls), whether the customer was reached and what was done — and each branch's Talabat
// rating of the day next to the competitor's. The «خدمة العملاء» and «الإلغاءات» Excel files are written from it.
window.MarsadCs = function MarsadCs(ctx) {
  const { api, h, $, table, pill, kpi, state, canWrite, showError, cairoToday } = ctx;
  const BRANCHES = ['مدينة نصر', 'التجمع', 'مدينتي'];
  let data = null, editing = null;

  function form() {
    const e = editing || {}, f = (lab, el, cls) => h('label', { className: cls || '' }, h('span', { textContent: lab }), el);
    const sel = (opts, v, first) => h('select', {}, h('option', { value: '', textContent: first }), ...opts.map(x => h('option', { value: x, textContent: x, selected: x === v })));
    const day = h('input', { type: 'date', value: e.day || state.to, max: cairoToday() });
    const platform = sel(data.platforms, e.platform || 'طلبات', 'المنصة'), branch = sel(BRANCHES, e.branch, 'الفرع');
    const customer = h('input', { value: e.customer || '', placeholder: 'اسم العميل' }), phone = h('input', { type: 'tel', value: e.phone || '', placeholder: 'رقم العميل' });
    const orderNo = h('input', { value: e.orderNo || '', placeholder: 'رقم الطلب' });
    const rating = sel(['5', '4', '3', '2', '1'], e.rating == null ? '' : String(e.rating), 'من غير تقييم');
    const comment = h('textarea', { rows: 2, value: e.comment || '', placeholder: 'تعليق العميل زي ما كتبه' }), complaint = h('input', { value: e.complaint || '', placeholder: 'الشكوى باختصار (بارد، تأخير، جودة الأرز…)' });
    const reached = sel(data.reached, e.reached, 'اتواصلنا؟'), action = h('input', { value: e.action || '', placeholder: 'اللي اتعمل (اعتذار، خصم 10% الأوردر الجاي…)' });
    const save = h('button', { type: 'button', textContent: editing ? 'حفظ التعديل' : 'إضافة', onclick: async () => {
      try {
        await api('/api/cs', { method: editing ? 'PUT' : 'POST', body: { id: editing?.id, day: day.value, platform: platform.value, branch: branch.value, customer: customer.value, phone: phone.value, orderNo: orderNo.value,
          rating: rating.value, comment: comment.value, complaint: complaint.value, reached: reached.value, action: action.value } });
        $('csMsg').textContent = 'اتحفظ'; editing = null; await render();
      } catch (x) { showError(x); }
    } });
    const cancel = editing ? h('button', { type: 'button', className: 'ghost', textContent: 'إلغاء', onclick: () => { editing = null; form(); } }) : null;
    $('csForm').replaceChildren(h('div', { className: 'fgrid' }, f('اليوم', day), f('المنصة', platform), f('الفرع', branch), f('التقييم', rating), f('اسم العميل', customer), f('رقم العميل', phone), f('رقم الطلب', orderNo),
      f('تعليق العميل', comment, 'wide'), f('الشكوى', complaint, 'wide'), f('اتواصلنا؟', reached), f('الإجراء', action, 'wide')), h('div', { className: 'inline' }, save, cancel));
    $('csForm').closest('.panel').hidden = !canWrite();
  }

  function ratings() {
    // One line per day of the period (newest first) × branch: the rating and the competitor's.
    const days = []; for (let d = state.to; d >= state.day && days.length < 31; d = new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10)) days.push(d);
    const rows = days.flatMap(d => BRANCHES.map(b => ({ d, b, r: data.ratings.find(x => x.day === d && x.branch === b) || {} })));
    table('csRatings', [{ title: 'اليوم', get: x => x.d }, { title: 'الفرع', get: x => x.b },
      ...[['rating', 'التقييم'], ['competitor', 'تقييم المنافس']].map(([k, t]) => ({ title: t, get: x => x.r[k] ?? null, type: 'number', show: x => !canWrite() ? (x.r[k] ?? '—') : (() => {
        const i = h('input', { type: 'number', min: 0, max: 5, step: 0.1, value: x.r[k] ?? '', style: 'width:80px' });
        i.onchange = async () => { const r = { ...x.r, [k]: i.value }; try { await api('/api/cs/rating', { method: 'POST', body: { day: x.d, branch: x.b, rating: r.rating ?? '', competitor: r.competitor ?? '' } }); x.r[k] = i.value === '' ? null : Number(i.value); $('csMsg').textContent = 'اتحفظ تقييم ' + x.b + ' يوم ' + x.d; } catch (e) { showError(e); } };
        return i; })() }))], rows, { pageSize: 30 });
  }

  // Karim 11-16: the ratings come by themselves from Talabat's public pages — each branch's page and the competitor's.
  async function pagesPanel() {
    const box = $('csPages'); if (!box) return;
    let p; try { p = await api('/api/talabat/rating-pages'); } catch (e) { box.replaceChildren(h('p', { className: 'muted', textContent: e.message })); return; }
    const inputs = {};
    const grid = h('div', { className: 'fgrid' }, ...BRANCHES.flatMap(b => ['ours', 'rival'].map(side => { const i = h('input', { value: p.pages[b]?.[side] || '', placeholder: 'لينك الصفحة على طلبات أو رقمها', disabled: !ctx.isAdmin?.() });
      (inputs[b] ||= {})[side] = i; return h('label', {}, h('span', { textContent: b + ' — ' + (side === 'ours' ? 'الدهان بتاعنا' : 'المنافس (الدهان البني)') }), i); })));
    const save = ctx.isAdmin?.() ? h('button', { type: 'button', textContent: 'حفظ الصفحات', onclick: async () => {
      try { await api('/api/talabat/rating-pages', { method: 'POST', body: { pages: Object.fromEntries(BRANCHES.map(b => [b, { ours: inputs[b].ours.value, rival: inputs[b].rival.value }])) } }); $('csMsg').textContent = 'اتحفظت؛ التقييمات هتتقري في خلال دقايق'; await pagesPanel(); } catch (e) { showError(e); } } }) : null;
    box.replaceChildren(grid, h('div', { className: 'inline' }, save, h('span', { className: p.error ? 'warn' : 'muted', textContent: p.error ? 'آخر قراية: ' + p.error : p.at ? 'آخر قراية: ' + new Date(p.at).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' }) : 'لسه ماتقرتش' })));
  }

  async function render() {
    pagesPanel();
    try {
      data = await api('/api/cs?from=' + state.day + '&to=' + state.to);
      const l = data.entries, rated = l.filter(e => e.rating != null), low = rated.filter(e => e.rating < 5);
      $('csCards').replaceChildren(kpi('سطور', l.length, 'info'), kpi('شكاوى', l.filter(e => e.complaint).length, l.some(e => e.complaint) ? 'warn' : 'good'),
        kpi('تقييمات أقل من 5', low.length, low.length ? 'warn' : 'good', rated.length ? Math.round(low.length / rated.length * 100) + '% من ' + rated.length : ''),
        kpi('اتواصلنا', l.filter(e => e.reached === 'تم التواصل').length, '', 'من ' + l.filter(e => e.complaint || (e.rating != null && e.rating < 5)).length + ' محتاجين تواصل'));
      form(); ratings();
      const stars = [];
      for (const p of data.platforms) for (const b of BRANCHES) { const x = rated.filter(e => e.platform === p && e.branch === b); if (!x.length) continue; stars.push({ p, b, n: x.length, c: [5, 4, 3, 2, 1].map(s => x.filter(e => e.rating === s).length) }); }
      table('csStars', [{ title: 'المنصة', get: x => x.p }, { title: 'الفرع', get: x => x.b }, ...[5, 4, 3, 2, 1].map((s, i) => ({ title: s + ' ★', get: x => x.c[i], type: 'number' })), { title: 'الإجمالي', get: x => x.n, type: 'number' },
        { title: 'أقل من 5', get: x => (x.n - x.c[0]) / x.n * 100, show: x => Math.round((x.n - x.c[0]) / x.n * 100) + '%', type: 'number' }, { title: 'سئ (1)', get: x => x.c[4] / x.n * 100, show: x => Math.round(x.c[4] / x.n * 100) + '%', type: 'number' }], stars, { empty: 'مفيش تقييمات متسجلة' });
      table('csTable', [{ title: 'اليوم', get: e => e.day }, { title: 'المنصة', get: e => e.platform }, { title: 'الفرع', get: e => e.branch }, { title: 'التقييم', get: e => e.rating, show: e => e.rating == null ? '—' : pill(e.rating + ' ★', e.rating >= 5 ? 'ok' : e.rating >= 3 ? 'warn' : 'bad'), type: 'number' },
        { title: 'العميل', get: e => [e.customer, e.phone].filter(Boolean).join(' · ') }, { title: 'رقم الطلب', get: e => e.orderNo || '' }, { title: 'التعليق', get: e => e.comment || '', cls: () => 'wrap' }, { title: 'الشكوى', get: e => e.complaint || '', cls: () => 'wrap' },
        { title: 'اتواصلنا؟', get: e => e.reached || '' }, { title: 'الإجراء', get: e => e.action || '', cls: () => 'wrap' }, { title: 'سجّله', get: e => e.by || '' },
        { title: '', get: () => '', show: e => !canWrite() ? '' : h('span', { className: 'inline' },
          h('button', { type: 'button', className: 'ghost small', textContent: 'تعديل', onclick: () => { editing = e; form(); $('csForm').scrollIntoView({ behavior: 'smooth' }); } }),
          h('button', { type: 'button', className: 'ghost small', textContent: 'مسح', onclick: async () => { if (!confirm('مسح السطر ده؟')) return; try { await api('/api/cs', { method: 'DELETE', body: { id: e.id } }); await render(); } catch (x) { showError(x); } } })) }],
      l, { pageSize: 50, empty: 'مفيش سطور في الفترة دي' });
    } catch (x) { showError(x); }
  }
  return { render };
};
