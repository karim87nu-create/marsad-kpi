'use strict';
// مرصد الدهان — مؤشرات الأداء: one page that says, for the period, how the call center, each employee and each branch did
// against a clear target, and whether it got better or worse than the same length of time just before.
// Green = on target, yellow = close, red = off. Data: GET /api/kpi (read-only).
window.MarsadKpi = function MarsadKpi(ctx) {
  const { api, h, $, table, kpi, pill, state, exportSheets, setRange, cairoToday } = ctx;
  const money = v => v == null ? '—' : Math.round(Number(v)).toLocaleString('en') + ' ج';
  const num = (v, u = '') => v == null ? '—' : (Number.isInteger(v) ? v : Number(v).toFixed(1)) + (u ? ' ' + u : '');
  let data = null;

  // How a value stands against its target: good / warn (within 20% of the limit) / bad.
  function tone(key, v) {
    const t = data?.targets?.[key]; if (!t || v == null) return '';
    const over = t.max != null && v > t.max, under = t.min != null && v < t.min;
    if (!over && !under) return 'good';
    const lim = over ? t.max : t.min, gap = Math.abs(v - lim) / Math.max(1, Math.abs(lim));
    return gap <= 0.2 ? 'warn' : 'bad';
  }
  const PILL = { good: 'ok', warn: 'warn', bad: 'bad' };
  const goal = key => { const t = data?.targets?.[key]; if (!t) return ''; return 'الهدف ' + (t.min != null && t.max != null ? t.min + '–' + t.max : t.min != null ? '≥ ' + t.min : '≤ ' + t.max) + ' ' + t.unit; };
  // Change from the period before. lowerBetter decides the colour of the arrow.
  function delta(now, before, lowerBetter) {
    if (now == null || before == null) return null;
    const d = Math.round((now - before) * 10) / 10; if (!d) return h('small', { className: 'muted', textContent: ' =' });
    const better = lowerBetter ? d < 0 : d > 0;
    return h('small', { className: better ? 'up' : 'down', textContent: ' ' + (d > 0 ? '▲' : '▼') + Math.abs(d) });
  }
  const cell = (key, v, before, unit, lowerBetter) => {
    const t = tone(key, v);
    return h('span', {}, t ? pill(num(v, unit), PILL[t]) : document.createTextNode(num(v, unit)), delta(v, before, lowerBetter));
  };
  const card = (key, label, v, before, unit, lowerBetter) => {
    const c = kpi(label, num(v, unit), tone(key, v) || 'info', [goal(key), before != null ? 'قبلها ' + num(before, unit) : ''].filter(Boolean).join(' · '));
    const d = delta(v, before, lowerBetter); if (d) c.querySelector('b').append(d);
    return c;
  };
  // Score: how many of an employee's / branch's targets are met, out of the ones that apply.
  const score = list => { const t = list.map(([k, v]) => tone(k, v)).filter(Boolean); return t.length ? Math.round(t.filter(x => x === 'good').length / t.length * 100) : null; };
  const scorePill = s => s == null ? '—' : pill(s + '%', s >= 80 ? 'ok' : s >= 50 ? 'warn' : 'bad');

  const empScore = e => score([['occupancy', e.occupancy], ['breakPerDay', e.breakPerDay], ['callsVsTeam', e.callsVsTeam]]);
  const brScore = b => score([['avgOut', b.avgOut], ['latePct', b.latePct], ['discountPct', b.discountPct], ['cancelPct', b.cancelPct]]);

  let empCols = [], brCols = [];
  async function render() {
    data = await api('/api/kpi?from=' + state.day + '&to=' + state.to);
    // Calls per day compared with the team average (100% = average): a fair measure across different shift lengths.
    data.targets.callsVsTeam = { min: 80, label: 'المكالمات مقارنة بمتوسط الفريق', unit: '%' };
    const avgOf = list => { const w = list.filter(e => e.callsPerDay != null); return w.length ? w.reduce((s, e) => s + e.callsPerDay, 0) / w.length : null; };
    const avg = avgOf(data.employees), pavg = avgOf(data.before.employees);
    for (const e of data.employees) e.callsVsTeam = avg ? Math.round(e.callsPerDay / avg * 100) : null;
    for (const e of data.before.employees) e.callsVsTeam = pavg ? Math.round(e.callsPerDay / pavg * 100) : null;
    const pe = new Map(data.before.employees.map(e => [e.id, e])), pb = new Map(data.before.branches.map(b => [b.name, b]));
    const T = data.team, P = data.before.team || {};

    $('kpiPeriod').textContent = 'الفترة ' + data.from + (data.to !== data.from ? ' إلى ' + data.to : '') + ' · مقارنة بـ ' + data.prev.from + (data.prev.to !== data.prev.from ? ' إلى ' + data.prev.to : '');
    // The headline: the team and the branches together.
    const all = data.branches.reduce((a, b) => ({ orders: a.orders + b.orders, sales: a.sales + b.sales, late: a.late + b.outLate, cancels: a.cancels + b.cancels, disc: a.disc + b.discounts, out: a.out + (b.avgOut || 0) * b.orders, outN: a.outN + (b.avgOut != null ? b.orders : 0) }), { orders: 0, sales: 0, late: 0, cancels: 0, disc: 0, out: 0, outN: 0 });
    const pall = data.before.branches.reduce((a, b) => ({ orders: a.orders + b.orders, sales: a.sales + b.sales }), { orders: 0, sales: 0 });
    $('kpiTeamCards').replaceChildren(
      card('sla', 'الرد خلال 10 ثواني', T.sla, P.sla, '%'),
      card('abandon', 'المكالمات الفائتة', T.abandon, P.abandon, '%', true),
      card('asa', 'متوسط انتظار العميل', T.asa, P.asa, 'ث', true),
      kpi('مكالمات اترد عليها', num(T.answered), 'info', P.answered != null ? 'قبلها ' + P.answered : ''),
      kpi('أوردرات الفروع', num(all.orders), 'info', pall.orders ? 'قبلها ' + pall.orders : ''),
      kpi('المبيعات', money(all.sales), 'info', pall.sales ? 'قبلها ' + money(pall.sales) : ''),
      card('avgOut', 'متوسط وقت الخروج', all.outN ? Math.round(all.out / all.outN * 10) / 10 : null, null, 'د', true),
      card('discountPct', 'الخصومات من المبيعات', all.sales ? Math.round(all.disc / all.sales * 1000) / 10 : null, null, '%', true));
    $('kpiTeamNote').textContent = T.complete === false ? 'سجل أرابيكس للفترة دي مش كامل، أرقام الكول سنتر ممكن تتغير.' : '';

    empCols = [
      { title: 'الموظف', get: e => e.name },
      { title: 'التقييم', get: e => empScore(e), show: e => scorePill(empScore(e)), type: 'percent' },
      { title: 'أيام', get: e => e.daysWorked, type: 'number' },
      { title: 'ساعات الشغل', get: e => e.workHours, type: 'number' },
      { title: 'مكالمات', get: e => e.calls, show: e => h('span', {}, num(e.calls), delta(e.calls, pe.get(e.id)?.calls)), type: 'number' },
      { title: 'في اليوم', get: e => e.callsPerDay, type: 'number' },
      { title: 'مقارنة بمتوسط الفريق', get: e => e.callsVsTeam, show: e => cell('callsVsTeam', e.callsVsTeam, pe.get(e.id)?.callsVsTeam, '%'), type: 'percent' },
      { title: 'متوسط المكالمة (ث)', get: e => e.meanCall, type: 'number' },
      { title: 'مكالمات طويلة', get: e => e.longCalls, type: 'number' },
      { title: 'الانشغال', get: e => e.occupancy, show: e => cell('occupancy', e.occupancy, pe.get(e.id)?.occupancy, '%'), type: 'percent' },
      { title: 'البريك في اليوم (د)', get: e => e.breakPerDay, show: e => cell('breakPerDay', e.breakPerDay, pe.get(e.id)?.breakPerDay, 'د', true), type: 'number' },
      { title: 'أيام بريك زيادة', get: e => e.overBreakDays, show: e => e.overBreakDays ? pill(String(e.overBreakDays), 'bad') : '0', type: 'number' }];
    table('kpiEmployees', empCols, [...data.employees].sort((a, b) => (empScore(b) ?? -1) - (empScore(a) ?? -1) || b.calls - a.calls), { empty: 'مفيش موظفين اشتغلوا في الفترة دي' });

    brCols = [
      { title: 'الفرع', get: b => b.name },
      { title: 'التقييم', get: b => brScore(b), show: b => scorePill(brScore(b)), type: 'percent' },
      { title: 'أوردرات', get: b => b.orders, show: b => h('span', {}, num(b.orders), delta(b.orders, pb.get(b.name)?.orders)), type: 'number' },
      { title: 'المبيعات', get: b => b.sales, show: b => money(b.sales), type: 'number' },
      { title: 'متوسط الأوردر', get: b => b.avgTicket, show: b => money(b.avgTicket), type: 'number' },
      { title: 'متوسط الخروج (د)', get: b => b.avgOut, show: b => cell('avgOut', b.avgOut, pb.get(b.name)?.avgOut, 'د', true), type: 'number' },
      { title: 'خرجوا بعد 30 د', get: b => b.latePct, show: b => cell('latePct', b.latePct, pb.get(b.name)?.latePct, '%', true), type: 'percent' },
      { title: 'الإلغاءات', get: b => b.cancelPct, show: b => h('span', {}, cell('cancelPct', b.cancelPct, pb.get(b.name)?.cancelPct, '%', true), h('small', { className: 'muted', textContent: ' (' + b.cancels + ')' })), type: 'percent' },
      { title: 'الخصومات', get: b => b.discountPct, show: b => cell('discountPct', b.discountPct, pb.get(b.name)?.discountPct, '%', true), type: 'percent' },
      { title: 'طلبات / هوت لاين / الموقع', get: b => b.mix.talabat, show: b => b.mix.talabat + ' / ' + b.mix.hotline + ' / ' + b.mix.site }];
    table('kpiBranches', brCols, [...data.branches].sort((a, b) => (brScore(b) ?? -1) - (brScore(a) ?? -1) || b.orders - a.orders), { empty: 'مفيش بيانات فروع للفترة دي (بتيجي من جهاز الكاشير)' });

    // What needs attention, in words.
    const flags = [];
    for (const e of data.employees) {
      if (tone('breakPerDay', e.breakPerDay) === 'bad') flags.push(e.name + ': البريك ' + num(e.breakPerDay, 'د') + ' في اليوم');
      if (tone('callsVsTeam', e.callsVsTeam) === 'bad') flags.push(e.name + ': مكالماته ' + e.callsVsTeam + '% من متوسط الفريق');
      if (tone('occupancy', e.occupancy) === 'bad') flags.push(e.name + ': الانشغال ' + num(e.occupancy, '%'));
    }
    for (const b of data.branches) {
      if (tone('latePct', b.latePct) === 'bad') flags.push(b.name + ': ' + num(b.latePct, '%') + ' من الأوردرات خرجت بعد 30 دقيقة');
      if (tone('cancelPct', b.cancelPct) === 'bad') flags.push(b.name + ': الإلغاءات ' + num(b.cancelPct, '%'));
      if (tone('discountPct', b.discountPct) === 'bad') flags.push(b.name + ': الخصومات ' + num(b.discountPct, '%') + ' من المبيعات');
    }
    if (tone('sla', T.sla) === 'bad') flags.unshift('الكول سنتر: الرد خلال 10 ثواني ' + num(T.sla, '%') + ' بس');
    if (tone('abandon', T.abandon) === 'bad') flags.unshift('الكول سنتر: الفائتة ' + num(T.abandon, '%'));
    $('kpiFlags').replaceChildren(...(flags.length ? flags.map(f => h('li', { textContent: f })) : [h('li', { className: 'muted', textContent: data.employees.length || data.branches.length ? 'كله في الهدف في الفترة دي 👌' : 'مفيش بيانات للفترة دي لسه' })]));
    $('kpiTargets').textContent = Object.values(data.targets).map(t => t.label + ' ' + (t.min != null && t.max != null ? t.min + '–' + t.max : t.min != null ? '≥ ' + t.min : '≤ ' + t.max) + t.unit).join(' · ');
  }

  $('kpiExport').onclick = () => data && exportSheets('مؤشرات-الأداء', [['الموظفين', empCols, data.employees], ['الفروع', brCols, data.branches]]);
  $('kpiPrint').onclick = () => window.print();
  return { render };
};
