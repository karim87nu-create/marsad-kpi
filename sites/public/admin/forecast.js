'use strict';
// مرصد الدهان — التوقع والاحتياج (Karim 11-11): calls and orders expected per half hour, the employees needed to answer
// 90% within 10 seconds, against the shift table; for a day that passed, what actually came and who worked.
window.MarsadForecast = function MarsadForecast(ctx) {
  const { api, h, $, table, pill, kpi, showError, cairoToday } = ctx;
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const n1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('ar-EG-u-nu-latn');
  async function render() {
    try {
      if (!$('fcDay').value) $('fcDay').value = addDays(cairoToday(), 1);
      const d = await api('/api/forecast?day=' + $('fcDay').value);
      $('fcCards').replaceChildren(
        kpi('مكالمات متوقعة', n1(d.totals.calls), 'info', d.totals.actualCalls != null ? 'جت فعلاً ' + n1(d.totals.actualCalls) : 'من نفس اليوم في آخر 4 أسابيع'),
        kpi('أوردرات متوقعة (Apex)', n1(d.totals.orders), 'info', ''),
        kpi('ساعات شغل محتاجينها', n1(d.totals.needHours), 'info', 'عشان 90% يترد عليهم في 10 ثواني'),
        kpi('ساعات في الجدول', n1(d.totals.rosteredHours), d.totals.rosteredHours < d.totals.needHours ? 'warn' : 'ok', d.totals.staffedHours != null ? 'اشتغلوا فعلاً ' + n1(d.totals.staffedHours) : ''),
        kpi('الاتجاه', Math.round((d.trend - 1) * 100) + '%', 'info', 'آخر 7 أيام مقارنة بالـ 7 اللي قبلهم'),
        kpi('متوسط المكالمة', d.aht + ' ث', 'info', 'شامل 15 ث بعد المكالمة'),
        ...(d.errorPct != null ? [kpi('خطأ التوقع', n1(d.errorPct) + '%', d.errorPct <= 20 ? 'ok' : 'warn', 'الفرق بين المتوقع واللي جه')] : []));
      $('fcShort').textContent = d.shortSlots.length ? 'ناقص موظفين في: ' + d.shortSlots.join('، ') : 'الجدول مغطي الاحتياج في كل الأوقات.';
      table('fcTable', [
        { title: 'الوقت', get: r => r.label },
        { title: 'مكالمات متوقعة', get: r => r.calls, show: r => n1(r.calls), type: 'number' },
        { title: 'أوردرات متوقعة', get: r => r.orders, show: r => n1(r.orders), type: 'number' },
        { title: 'محتاجين', get: r => r.need, type: 'number' },
        { title: 'في الجدول', get: r => r.rostered, show: r => n1(r.rostered), type: 'number' },
        { title: 'الفرق', get: r => r.gap, show: r => r.gap == null ? '—' : pill((r.gap > 0 ? '+' : '') + n1(r.gap), r.gap < 0 ? 'bad' : r.gap > 1.5 ? 'warn' : 'ok'), type: 'number' },
        { title: 'مكالمات جت', get: r => r.actualCalls, show: r => n1(r.actualCalls), type: 'number' },
        { title: 'اشتغلوا فعلاً', get: r => r.staffed, show: r => n1(r.staffed), type: 'number' },
      ], d.rows.filter(r => r.calls || r.rostered || r.actualCalls), { empty: 'مفيش بيانات كفاية للتوقع (محتاج سجل أرابيكس لنفس اليوم في الأسابيع اللي فاتت)' });
    } catch (x) { showError(x); }
  }
  $('fcDay').onchange = render;
  return { render };
};
