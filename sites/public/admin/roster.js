'use strict';
// مرصد الدهان — جدول المواعيد (Karim 11-11): the supervisors set each employee's shift for the week. The KPI page
// measures lateness, early leaving, absence and the share of the shift worked against it.
window.MarsadRoster = function MarsadRoster(ctx) {
  const { api, h, $, canWrite, showError, cairoToday } = ctx;
  const DAYS = ['السبت', 'الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة'];
  let week = null, data = null;
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  // A cell is typed «16-24», «16:00-00:00», «9:30 - 17» or «إجازة».
  const parse = t => {
    t = String(t || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    if (!t) return { clear: true };
    if (/^(اجازه|إجازة|اجازة|off|x|-)$/i.test(t)) return { off: true };
    const m = t.match(/^(\d{1,2}(?::\d{2})?)\s*[-–لـ]+\s*(\d{1,2}(?::\d{2})?)$/);
    return m ? { start: m[1], end: m[2] } : null;
  };
  const short = t => t === '00:00' ? '24' : t.replace(/^0(?=\d)/, '').replace(/:00$/, '');
  const show = c => !c ? '' : c.off ? 'إجازة' : short(c.start) + '-' + short(c.end);

  async function render(w = week || cairoToday()) {
    try {
      data = await api('/api/roster?week=' + w); week = data.week;
      $('rosterWeek').textContent = 'من ' + data.days[0] + ' إلى ' + data.days[6];
      const head = h('tr', {}, h('th', { textContent: 'الموظف' }), ...data.days.map((d, i) => h('th', { textContent: DAYS[i] + ' ' + d.slice(8) + '/' + d.slice(5, 7) })));
      const body = h('tbody', {}, ...data.employees.map(e => h('tr', {}, h('th', { textContent: e.name, scope: 'row' }), ...data.days.map(d => {
        const inp = h('input', { value: show(e.cells[d]), placeholder: '—', disabled: !canWrite(), style: 'width:92px;text-align:center', title: 'اكتب الميعاد زي 16-24 أو 9:30-17، أو «إجازة»، أو سيبها فاضية' });
        inp.dataset.emp = e.id; inp.dataset.day = d; inp.dataset.was = inp.value;
        return h('td', {}, inp);
      }))));
      $('rosterTable').replaceChildren(h('table', {}, h('thead', {}, head), body));
      $('rosterMsg').textContent = '';
    } catch (x) { showError(x); }
  }
  async function save() {
    const cells = [], bad = [];
    for (const inp of document.querySelectorAll('#rosterTable input')) {
      if (inp.value === inp.dataset.was) continue;
      const c = parse(inp.value);
      if (!c) { bad.push(inp); continue; }
      cells.push({ employeeId: Number(inp.dataset.emp), day: inp.dataset.day, ...c });
    }
    document.querySelectorAll('#rosterTable input').forEach(i => i.style.outline = '');
    if (bad.length) { bad.forEach(i => i.style.outline = '2px solid #f87171'); $('rosterMsg').textContent = 'فيه خانات مش مفهومة (اتعلّم عليها بالأحمر): اكتب زي 16-24 أو «إجازة».'; return; }
    if (!cells.length) { $('rosterMsg').textContent = 'مفيش تغيير.'; return; }
    try { await api('/api/roster', { method: 'PUT', body: { cells } }); await render(week); $('rosterMsg').textContent = 'اتحفظ (' + cells.length + ' خانة).'; } catch (x) { showError(x); }
  }
  $('rosterPrev').onclick = () => render(addDays(week, -7));
  $('rosterNext').onclick = () => render(addDays(week, 7));
  $('rosterSave').onclick = save;
  $('rosterCopy').onclick = async () => {
    try { const r = await api('/api/roster', { method: 'POST', body: { action: 'copy', from: addDays(week, -7), to: week } }); await render(week); $('rosterMsg').textContent = 'اتنسخ من الأسبوع اللي فات (' + r.copied + ' خانة).'; } catch (x) { showError(x); }
  };
  return { render: () => render() };
};
