'use strict';
// مرصد الدهان — الجودة (Karim 11-11): the calls picked for review this week (the flagged ones first), the scoring
// form, the reviews done, and the calls scored by two supervisors side by side.
window.MarsadQa = function MarsadQa(ctx) {
  const { api, h, $, table, pill, canWrite, showError, cairoToday } = ctx;
  let week = null, data = null, open = null;
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const t = v => v ? new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const dur = s => s == null ? '—' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function form(c) {
    const box = h('div', { className: 'panel', style: 'padding:12px;margin-top:8px' });
    const marks = {};
    const rows = data.form.map(f => {
      const sel = h('select', {}, h('option', { value: '', textContent: '—' }), ...Object.entries(data.marks).map(([k, v]) => h('option', { value: k, textContent: v })));
      sel.onchange = () => { marks[f.key] = sel.value; };
      return h('div', { className: 'inline', style: 'justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0' }, h('span', { textContent: f.label + ' (' + f.weight + ')' }), sel);
    });
    const crit = h('select', {}, h('option', { value: '', textContent: 'مفيش' }), ...Object.entries(data.critical).map(([k, v]) => h('option', { value: k, textContent: v })));
    const notes = h('textarea', { rows: 2, placeholder: 'ملاحظات للموظف (هيشوفها)', style: 'width:100%' });
    const save = h('button', { type: 'button', textContent: 'حفظ التقييم', onclick: async () => {
      try { const r = await api('/api/qa', { method: 'POST', body: { callKey: c.key, marks, critical: crit.value || null, notes: notes.value } }); open = null; await render(week); $('qaMsg').textContent = 'اتحفظ: ' + r.total + '%'; }
      catch (x) { showError(x); }
    } });
    box.append(h('p', { className: 'muted', textContent: 'افتح التسجيل على أرابيكس: ' + c.employee + ' — ' + t(c.at) + ' — الرقم المنتهي بـ ' + (c.phoneEnd || '—') + ' — مدتها ' + dur(c.durationSeconds) }), ...rows,
      h('div', { className: 'inline', style: 'margin-top:6px' }, h('span', { textContent: 'خطأ يصفّر التقييم:' }), crit), notes, h('div', { className: 'inline' }, save));
    return box;
  }

  async function render(w = week || cairoToday()) {
    try {
      data = await api('/api/qa?week=' + w); week = data.week;
      $('qaWeek').textContent = 'من ' + data.week + ' إلى ' + addDays(data.week, 6);
      const list = $('qaCalls'); list.replaceChildren();
      const byEmp = new Map(); for (const c of data.calls) (byEmp.get(c.employee) || byEmp.set(c.employee, []).get(c.employee)).push(c);
      if (!byEmp.size) list.append(h('p', { className: 'muted', textContent: 'مفيش مكالمات متسجلة للأسبوع ده لسه.' }));
      for (const [name, calls] of byEmp) {
        list.append(h('h3', { textContent: name + ' — ' + calls.filter(c => c.evaluated).length + ' من ' + calls.length + ' اتقيّمت', style: 'margin:12px 0 4px' }));
        for (const c of calls) {
          const row = h('div', { className: 'inline', style: 'gap:8px;padding:4px 0' }, h('span', { textContent: t(c.at) }), h('span', { className: 'muted', textContent: '…' + (c.phoneEnd || '') + ' · ' + dur(c.durationSeconds) }),
            ...c.flagLabels.map(f => pill(f, 'warn')), c.evaluated ? pill('اتقيّمت' + (c.evaluated > 1 ? ' ×' + c.evaluated : ''), 'ok') : null,
            canWrite() ? h('button', { type: 'button', className: 'ghost', textContent: open === c.key ? 'اقفل' : c.evaluated ? 'قيّم تاني (معايرة)' : 'قيّم', onclick: () => { open = open === c.key ? null : c.key; render(week); } }) : null);
          list.append(row); if (open === c.key) list.append(form(c));
        }
      }
      table('qaEvals', [
        { title: 'الموظف', get: e => e.employee }, { title: 'المكالمة', get: e => e.callAt, show: e => t(e.callAt) },
        { title: 'الدرجة', get: e => e.total, show: e => pill((e.total ?? '—') + '%', e.total >= 85 ? 'ok' : e.total >= 70 ? 'warn' : 'bad'), type: 'percent' },
        { title: 'خطأ جسيم', get: e => e.critical ? data.critical[e.critical] : '' }, { title: 'المشرف', get: e => e.evaluator }, { title: 'ملاحظات', get: e => e.notes || '' },
      ], data.evals, { empty: 'مفيش تقييمات في الأسبوع ده' });
      table('qaCalibration', [
        { title: 'الموظف', get: x => x.employee }, { title: 'التقييمات', get: x => x.scores.map(s => s.by + ': ' + s.total + '%').join(' · ') },
        { title: 'الفرق', get: x => x.spread, show: x => pill(x.spread + ' نقطة', x.spread <= 10 ? 'ok' : 'bad'), type: 'number' },
      ], data.calibration, { empty: 'مفيش مكالمة اتقيّمت من مشرفين اتنين لسه' });
    } catch (x) { showError(x); }
  }
  $('qaPrev').onclick = () => { open = null; render(addDays(week, -7)); };
  $('qaNext').onclick = () => { open = null; render(addDays(week, 7)); };
  return { render: () => render() };
};
