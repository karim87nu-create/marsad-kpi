'use strict';
// مرصد الدهان — تقرير اليوم (Karim 11-14): one day, everything, each number next to the same weekday a week before.
window.MarsadDaily = function MarsadDaily(ctx) {
  const { api, h, $, table, kpi, dur, exportRows } = ctx;
  let rows = [], branchRows = [];
  const fmt = (v, unit = '') => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }) + unit;
  // better: +1 when higher is better, -1 when lower is better, 0 neutral.
  function change(a, b, better) {
    if (a == null || b == null || !Number(b)) return { text: '', tone: '' };
    const pc = Math.round((a - b) / Math.abs(b) * 100), up = pc > 0;
    const tone = !better || !pc ? '' : (up ? better > 0 : better < 0) ? 'good' : 'bad';
    return { text: (up ? '▲ ' : pc < 0 ? '▼ ' : '') + Math.abs(pc) + '% عن الأسبوع اللي فات (' + fmt(b) + ')', tone, pc };
  }
  const M = (group, label, a, b, unit, better, show) => ({ group, label, a, b, unit, better, show });
  function metrics(c, p) {
    const out = [];
    if (c.calls || p.calls) {
      const x = c.calls || {}, y = p.calls || {};
      out.push(M('الكول سنتر', 'مكالمات', x.calls, y.calls, '', 0), M('الكول سنتر', 'اترد عليها', x.answered, y.answered, '', 1), M('الكول سنتر', 'فائتة', x.abandoned, y.abandoned, '', -1),
        M('الكول سنتر', 'نسبة الفائتة', x.abandonmentRate, y.abandonmentRate, '%', -1), M('الكول سنتر', 'الرد خلال 10 ث', x.sla, y.sla, '%', 1),
        M('الكول سنتر', 'متوسط انتظار الرد', x.asa, y.asa, ' ث', -1), M('الكول سنتر', 'متوسط مدة المكالمة', x.meanCallSeconds, y.meanCallSeconds, '', 0, dur));
    }
    if (c.team || p.team) {
      const x = c.team || {}, y = p.team || {};
      out.push(M('الفريق', 'موظفين اشتغلوا', x.people, y.people, '', 0), M('الفريق', 'ساعات العمل', x.workSeconds, y.workSeconds, '', 0, dur),
        M('الفريق', 'إجمالي البريك', x.breakSeconds, y.breakSeconds, '', -1, dur), M('الفريق', 'عدّوا 30 دقيقة بريك', x.overBreak, y.overBreak, '', -1));
    }
    if (c.orders || p.orders) {
      const x = c.orders || {}, y = p.orders || {};
      out.push(M('الأوردرات', 'أوردرات', x.orders, y.orders, '', 1), M('الأوردرات', 'مبيعات', x.sales, y.sales, ' ج', 1), M('الأوردرات', 'خصومات', x.discounts, y.discounts, ' ج', -1),
        M('الأوردرات', 'متوسط وقت الخروج', x.avgOut, y.avgOut, ' د', -1), M('الأوردرات', 'نسبة التأخير', x.lateRate, y.lateRate, '%', -1),
        M('الأوردرات', 'إلغاءات', x.cancels, y.cancels, '', -1), M('الأوردرات', 'قيمة الإلغاءات', x.cancelSales, y.cancelSales, ' ج', -1));
      const kp = new Map((p.kinds || []).map(k => [k.kind, k.orders]));
      for (const k of c.kinds || []) if (k.orders || kp.get(k.kind)) out.push(M('حسب النوع', k.name, k.orders, kp.get(k.kind) ?? null, '', 1));
    }
    const tr = (t, s) => t?.[s] || { all: 0, auto: 0, staff: 0 }, rate = v => v.all ? Math.round(v.auto / v.all * 100) : null;
    for (const [s, name] of [['talabat', 'طلبات'], ['site', 'الموقع']]) {
      const x = tr(c.transfers, s), y = tr(p.transfers, s);
      if (x.all || y.all) out.push(M('التحويل على Apex', name + ': آلي', x.auto, y.auto, '', 1), M('التحويل على Apex', name + ': للموظف', x.staff, y.staff, '', -1), M('التحويل على Apex', name + ': نسبة الآلي', rate(x), rate(y), '%', 1));
    }
    const ax = c.apexCancels || {}, ay = p.apexCancels || {};
    if (ax.done || ax.manual || ax.withPilot || ay.done || ay.manual) out.push(M('الإلغاء من التعليق', 'اتلغى تلقائي', ax.done, ay.done, '', 0), M('الإلغاء من التعليق', 'اتساب للفرع', ax.manual, ay.manual, '', -1), M('الإلغاء من التعليق', 'خرج مع الطيار', ax.withPilot, ay.withPilot, '', -1));
    return out;
  }
  async function render(day) {
    const d = await api('/api/daily?day=' + encodeURIComponent(day), { timeout: 60000 });
    rows = metrics(d.cur, d.prev);
    // The eight headline numbers (تصور المؤشرات): each against its target and the same day a week before.
    const U = (v, u) => fmt(v, !u ? '' : u === '%' ? '%' : ' ' + u);
    const T = x => x.min != null && x.max != null ? 'من ' + U(x.min, x.unit) + ' لحد ' + U(x.max, x.unit) : x.min != null ? U(x.min, x.unit) + ' أو أكتر' : U(x.max, x.unit) + ' أو أقل';
    const lower = x => x.max != null && x.min == null;
    $('dailyHead').replaceChildren(...(d.headline || []).map(x => { const c = change(x.value, x.before, lower(x) ? -1 : 1);
      return kpi(x.label, U(x.value, x.unit), x.tone, 'الهدف ' + T(x) + (c.text ? ' · ' + c.text : '')); }));
    rows = [...(d.headline || []).map(x => M('المؤشرات الرئيسية', x.label, x.value, x.before, x.unit ? ' ' + x.unit : '', lower(x) ? -1 : 1)), ...rows];
    $('dailyNote').textContent = 'يوم ' + d.day + ' مقارنة بنفس اليوم الأسبوع اللي فات (' + d.compareDay + '). الأخضر أحسن، الأحمر أسوأ.';
    const groups = [...new Set(rows.map(r => r.group))].filter(g => g !== 'المؤشرات الرئيسية');
    $('dailyGroups').replaceChildren(...groups.map(g => h('article', { className: 'panel' }, h('h2', { textContent: g }),
      h('div', { className: 'cards' }, ...rows.filter(r => r.group === g).map(r => { const c = change(r.a, r.b, r.better); return kpi(r.label, r.show ? r.show(r.a) : fmt(r.a, r.unit), c.tone, c.text); })))));
    const pb = new Map((d.prev.branches || []).map(b => [b.no, b]));
    branchRows = (d.cur.branches || []).map(b => ({ ...b, prev: pb.get(b.no) || {} }));
    const col = (title, k, unit, better) => ({ title, get: b => b[k], show: b => { const c = change(b[k], b.prev[k], better); return h('span', {}, fmt(b[k], unit), c.text ? h('small', { className: 'muted ' + c.tone, textContent: ' ' + (c.pc > 0 ? '▲' : c.pc < 0 ? '▼' : '') + Math.abs(c.pc) + '%' }) : ''); }, type: 'number' });
    table('dailyBranches', [{ title: 'الفرع', get: b => b.name }, col('أوردرات', 'orders', '', 1), col('مبيعات', 'sales', ' ج', 1), col('متوسط الخروج', 'avgOut', ' د', -1),
      col('نسبة التأخير', 'lateRate', '%', -1), col('إلغاءات', 'cancels', '', -1), col('قيمة الإلغاءات', 'cancelSales', ' ج', -1)], branchRows, { empty: 'مفيش بيانات فروع لليوم ده' });
    table('dailyReasons', [{ title: 'السبب', get: r => r.reason, cls: () => 'wrap' }, { title: 'أوردرات', get: r => r.orders, type: 'number' },
      { title: 'الأصناف / المناطق', get: r => r.details.map(x => x.name + (x.n > 1 ? ' (' + x.n + ')' : '')).join('، '), cls: () => 'wrap' }], d.cur.transfers.reasons, { empty: 'مفيش أوردرات اتسابت للموظف' });
  }
  const exportColumns = [{ title: 'القسم', get: r => r.group }, { title: 'المؤشر', get: r => r.label }, { title: 'اليوم', get: r => r.a }, { title: 'نفس اليوم الأسبوع اللي فات', get: r => r.b },
    { title: 'التغير %', get: r => change(r.a, r.b, r.better).pc ?? null }];
  return { render, export: () => exportRows('تقرير-اليوم', exportColumns, rows) };
};
