'use strict';
// مرصد الدهان — الجودة (Karim 11-16: the call center's own QA sheet): the form of the sheet (11 items out of 120), each
// employee's percent for the period, every evaluation (edit / delete), the calls the Marsad suggests, and the old sheet
// imported once from its Excel file.
window.MarsadQa = function MarsadQa(ctx) {
  const { api, h, $, table, pill, kpi, state, canWrite, isAdmin, showError, cairoToday } = ctx;
  let data = null, editing = null, prefill = null;
  const tone = p => p >= 90 ? 'ok' : p >= 70 ? 'warn' : 'bad';
  const pct = v => v == null ? '—' : (Math.round(v * 10) / 10) + '%';
  const t12 = v => v ? new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const hm = v => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(v));
  const grade = p => p >= 90 ? 'ممتاز' : p >= 80 ? 'جيد جدًا' : p >= 70 ? 'جيد' : p >= 60 ? 'مقبول' : 'ضعيف';

  function form() {
    const box = $('qaForm'), e = editing || prefill || {};
    const f = (lab, el, cls) => h('label', { className: cls || '' }, h('span', { textContent: lab }), el);
    const day = h('input', { type: 'date', value: e.day || state.to, max: cairoToday() });
    const emp = h('select', {}, h('option', { value: '', textContent: 'اختار الموظف' }), ...data.employees.map(x => h('option', { value: x.id, textContent: x.name, selected: x.id === e.employeeId })));
    if (e.employeeId && !data.employees.some(x => x.id === e.employeeId)) emp.append(h('option', { value: e.employeeId, textContent: e.employee, selected: true }));
    const phone = h('input', { type: 'tel', value: e.phone || '', placeholder: 'رقم العميل' });
    const time = h('input', { type: 'time', value: e.time || '' });
    const type = h('select', {}, h('option', { value: '', textContent: 'نوع المكالمة' }), ...data.types.map(x => h('option', { value: x, textContent: x, selected: x === e.type })));
    const inputs = data.form.map((it, i) => h('input', { type: 'number', min: 0, max: it.max, step: 1, inputMode: 'numeric', value: e.scores ? e.scores[i] ?? '' : it.max }));
    const total = h('div', { className: 'qa-total' });
    const recalc = () => { let t = 0, ok = true; inputs.forEach((x, i) => { const v = x.value === '' ? NaN : Number(x.value); if (!(v >= 0 && v <= data.form[i].max)) ok = false; else t += v; x.parentNode.classList.toggle('low', Number(x.value) < data.form[i].max); });
      const p = Math.round(t / 120 * 1000) / 10; total.textContent = ok ? 'الإجمالي ' + t + ' من 120 — ' + p + '% — ' + grade(p) : 'كل بند من صفر لحد درجته'; };
    inputs.forEach(x => { x.oninput = recalc; x.onfocus = () => x.select(); });
    const notes = h('textarea', { rows: 2, placeholder: 'ملاحظات المقيم (الموظف بيشوفها في صفحته)', value: e.notes || '' });
    const save = h('button', { type: 'button', textContent: editing ? 'حفظ التعديل' : 'حفظ التقييم', onclick: async () => {
      const body = { id: editing?.id, day: day.value, employeeId: Number(emp.value), phone: phone.value, time: time.value, type: type.value, notes: notes.value, callKey: prefill?.callKey || null,
        scores: Object.fromEntries(data.form.map((it, i) => [it.key, inputs[i].value])) };
      try { const r = await api('/api/qa', { method: editing ? 'PUT' : 'POST', body }); $('qaMsg').textContent = 'اتحفظ: ' + r.total + ' من ' + r.max + ' — ' + r.pct + '% — ' + r.grade; editing = null; prefill = null; await render(); }
      catch (x) { showError(x); }
    } });
    const cancel = editing || prefill ? h('button', { type: 'button', className: 'ghost', textContent: 'إلغاء', onclick: () => { editing = null; prefill = null; form(); } }) : null;
    box.replaceChildren(h('div', { className: 'fgrid' }, f('اليوم', day), f('الموظف', emp), f('رقم المكالمة', phone), f('وقت المكالمة', time), f('نوع المكالمة', type)),
      h('div', { className: 'qa-items' }, ...data.form.map((it, i) => h('label', {}, h('span', { textContent: it.label + ' (' + it.max + ')' }), inputs[i]))),
      total, notes, h('div', { className: 'inline' }, save, cancel));
    recalc();
    $('qaFormPanel').hidden = !canWrite();
  }

  async function render() {
    try {
      data = await api('/api/qa?from=' + state.day + '&to=' + state.to);
      const list = data.entries, avg = l => l.length ? l.reduce((n, e) => n + e.pct, 0) / l.length : null;
      const people = [...new Set(list.map(e => e.employee))].map(n => { const l = list.filter(e => e.employee === n); return { name: n, n: l.length, pct: avg(l), low: l.filter(e => e.pct < 70).length }; }).sort((a, b) => b.pct - a.pct);
      $('qaCards').replaceChildren(kpi('تقييمات', list.length, 'info'), kpi('متوسط الجودة', pct(avg(list)), avg(list) == null ? '' : avg(list) >= 90 ? 'good' : avg(list) >= 80 ? 'warn' : 'bad'),
        kpi('أقل من 70%', list.filter(e => e.pct < 70).length, list.some(e => e.pct < 70) ? 'bad' : 'good'), kpi('موظفين اتقيّموا', people.length, '', 'من ' + data.employees.length));
      form();
      table('qaPeople', [{ title: 'الموظف', get: x => x.name }, { title: 'التقييمات', get: x => x.n, type: 'number' }, { title: 'النسبة', get: x => x.pct, show: x => pill(pct(x.pct), tone(x.pct)), type: 'number' },
        { title: 'أقل من 70%', get: x => x.low, type: 'number', cls: x => x.low ? 'warn' : '' }], people, { empty: 'مفيش تقييمات في الفترة دي' });
      table('qaEvals', [
        { title: 'اليوم', get: e => e.day }, { title: 'الموظف', get: e => e.employee }, { title: 'الرقم', get: e => e.phone || '—' }, { title: 'الوقت', get: e => e.time || '—' }, { title: 'النوع', get: e => e.type || '—' },
        { title: 'الدرجة', get: e => e.total, show: e => e.total + ' / ' + e.max, type: 'number' }, { title: 'النسبة', get: e => e.pct, show: e => pill(pct(e.pct) + ' ' + e.grade, tone(e.pct)), type: 'number' },
        { title: 'ملاحظات', get: e => e.notes || '', cls: () => 'wrap' }, { title: 'المقيم', get: e => e.evaluator || '' },
        { title: '', get: () => '', show: e => !canWrite() ? '' : h('span', { className: 'inline' },
          h('button', { type: 'button', className: 'ghost small', textContent: 'تعديل', onclick: () => { editing = e; prefill = null; form(); $('qaFormPanel').scrollIntoView({ behavior: 'smooth' }); } }),
          h('button', { type: 'button', className: 'ghost small', textContent: 'مسح', onclick: async () => { if (!confirm('مسح تقييم ' + e.employee + ' (' + e.day + ')؟')) return; try { await api('/api/qa', { method: 'DELETE', body: { id: e.id } }); await render(); } catch (x) { showError(x); } } })) }],
      list, { pageSize: 50, empty: 'مفيش تقييمات في الفترة دي' });
      // Suggested calls of the week: «قيّم» fills the form.
      $('qaWeek').textContent = '(أسبوع ' + data.week + ')';
      const box = $('qaCalls'); box.replaceChildren();
      const byEmp = new Map(); for (const c of data.calls) (byEmp.get(c.employee) || byEmp.set(c.employee, []).get(c.employee)).push(c);
      if (!byEmp.size) box.append(h('p', { className: 'muted', textContent: 'مفيش مكالمات متسجلة للأسبوع ده لسه.' }));
      for (const [name, calls] of byEmp) {
        box.append(h('h3', { textContent: name + ' — ' + calls.filter(c => c.evaluated).length + ' من ' + calls.length + ' اتقيّمت', style: 'margin:12px 0 4px' }));
        for (const c of calls) box.append(h('div', { className: 'inline', style: 'gap:8px;padding:4px 0' }, h('span', { textContent: t12(c.at) }), h('span', { className: 'muted', textContent: '…' + (c.phoneEnd || '') + ' · ' + Math.round(c.durationSeconds / 60) + ' د' }),
          ...c.flagLabels.map(f => pill(f, 'warn')), c.evaluated ? pill('اتقيّمت', 'ok') : null,
          canWrite() && !c.evaluated ? h('button', { type: 'button', className: 'ghost small', textContent: 'قيّم', onclick: () => { editing = null; prefill = { day: c.key.slice(0, 10), employeeId: c.employeeId, employee: name, time: hm(c.at), phone: c.phoneEnd ? '…' + c.phoneEnd : '', callKey: c.key }; form(); $('qaFormPanel').scrollIntoView({ behavior: 'smooth' }); } }) : null));
      }
      $('qaImportPanel').hidden = !isAdmin();
    } catch (x) { showError(x); }
  }

  // The old sheet: «تقييم QA» from row 4 — date, name, number, time, type, the 11 items, …, notes (column U).
  async function importSheet(file) {
    const msg = t => { $('qaImportMsg').textContent = t; };
    try {
      msg('بيقرا الملف…');
      const rows = await window.MarsadXlsxRead.rows(file, 'تقييم QA');
      const asDay = v => typeof v === 'number' ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null;
      const asTime = v => { if (typeof v === 'number') { const m = Math.round((v % 1) * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } const m = /(\d{1,2}):(\d{2})/.exec(String(v || '')); return m ? m[1].padStart(2, '0') + ':' + m[2] : null; };
      const list = rows.map((r, i) => ({ row: i + 1, day: asDay(r[0]), name: r[1], phone: r[2], time: asTime(r[3]), type: r[4], scores: r.slice(5, 16).map(v => v === '' || v == null ? null : v), notes: r[20] }))
        .filter(x => x.day && x.name && x.scores.some(v => v != null));
      if (!list.length) return msg('مالقيتش تقييمات في شيت «تقييم QA»');
      let added = 0, skipped = 0; const unmatched = new Map();
      for (let i = 0; i < list.length; i += 400) {
        msg('بينقل ' + Math.min(i + 400, list.length) + ' من ' + list.length + '…');
        const r = await api('/api/qa/import', { method: 'POST', body: { rows: list.slice(i, i + 400) }, timeout: 60000 });
        added += r.added; skipped += r.skipped; for (const u of r.unmatched) unmatched.set(u.name, (unmatched.get(u.name) || 0) + u.n);
      }
      msg('اتنقل ' + added + ' تقييم' + (skipped ? ' (' + skipped + ' كانوا متنقلين قبل كده)' : '') + (unmatched.size ? ' · أسامي مش موجودة في الموظفين (اتحفظت باسمها): ' + [...unmatched].map(([n, k]) => n + ' ' + k).join('، ') : ''));
      await render();
    } catch (x) { msg(''); showError(x); }
  }
  $('qaFile').onchange = e => { const f = e.target.files?.[0]; if (f) importSheet(f); e.target.value = ''; };
  return { render };
};
