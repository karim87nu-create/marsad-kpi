'use strict';
// مرصد الدهان — الرئيسية (Karim 11-14: «لوحة واحدة لكل حاجة لايف»): what needs a person first, then the call center, the
// transfers, the branches and the day so far — each part opens its own page. Every 5 seconds.
window.MarsadHome = function MarsadHome(ctx) {
  const { api, h, $, pill, kpi, show, dur } = ctx;
  let busy = false, data = null, live = null, at = 0, offset = 0;
  const num = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const mins = (v, now = Date.now() + offset) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null; };
  const clock = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }) : '—'; };
  const go = view => e => { e.preventDefault(); show(view); };
  const block = (title, view, ...kids) => h('article', { className: 'panel home-block' },
    h('h2', {}, h('span', { textContent: title }), h('a', { href: '#' + view, className: 'home-more', textContent: 'التفاصيل ←', onclick: go(view) })), ...kids);
  const tile = (view, ...a) => { const k = kpi(...a); k.classList.add('click'); k.tabIndex = 0; k.onclick = go(view); k.onkeydown = e => { if (e.key === 'Enter') go(view)(e); }; return k; };

  async function refresh() {
    if (busy) return; busy = true;
    try {
      const [d, l] = await Promise.all([api('/api/home', { timeout: 20000 }), api('/api/live', { timeout: 6000 }).catch(() => null)]);
      data = d; live = l; at = Date.now(); if (d.serverNow) offset = Date.parse(d.serverNow) - Date.now();
      draw();
    } finally { busy = false; }
  }

  function callsPart() {
    if (!live) return { tiles: [tile('now', 'الكول سنتر', 'مش متاح', 'warn')], alerts: [] };
    const now = Date.now() + offset, emp = live.employees || [], n = s => emp.filter(p => p.state === s).length;
    const q = live.queue, qAge = q ? (now - Date.parse(q.observedAt)) / 1000 : null, fresh = q && qAge < 30, waiting = fresh ? q.waiting || [] : [];
    const longest = waiting.reduce((m, r) => Math.max(m, Number(r.wait) + (qAge || 0) || 0), 0);
    const longBreak = emp.filter(p => p.state === 'break' && p.since && (now - Date.parse(p.since)) / 60000 > 15);
    const alerts = [];
    if (fresh && waiting.length && !n('ready')) alerts.push({ level: 'bad', text: waiting.length + ' عميل مستني على الخط ومفيش موظف متاح', view: 'now' });
    for (const p of longBreak) alerts.push({ level: 'warn', text: p.name + ' في بريك من ' + Math.floor((now - Date.parse(p.since)) / 60000) + ' دقيقة', view: 'now' });
    return { alerts, tiles: [
      tile('now', 'عملاء منتظرين', fresh ? String(waiting.length) : '—', !fresh ? '' : waiting.length && !n('ready') ? 'bad' : waiting.length ? 'warn' : 'good', fresh && waiting.length ? 'أطول انتظار ' + dur(longest) : ''),
      tile('now', 'متاحين', String(n('ready')), n('ready') ? 'good' : 'bad'),
      tile('now', 'في مكالمة', String(n('on_call'))),
      tile('now', 'في بريك', String(n('break')), longBreak.length ? 'warn' : '', longBreak.length ? longBreak.length + ' أكتر من ربع ساعة' : '')] };
  }

  function draw() {
    if (!data) return;
    const t = data.transfers, b = data.board, calls = callsPart();
    const AUTO = { off: ['التحويل الآلي متوقف', 'warn'], trial: ['التحويل الآلي تجربة', 'warn'], on: ['التحويل الآلي شغال', 'ok'] };
    const age = m => m == null ? pill('مفيش', 'bad') : m >= 4 ? pill('من ' + m + ' د', 'bad') : pill('شغال', 'ok');
    $('homeParts').replaceChildren(h('div', { className: 'inline', style: 'flex-wrap:wrap;gap:8px' },
      pill(...(AUTO[data.autoMode] || [data.autoMode, 'warn'])),
      h('span', { textContent: 'كاتب Apex' }), age(mins(data.parts.writerSeen)), h('span', { textContent: 'قراءة Apex' }), age(mins(data.parts.apexPush)),
      h('span', { textContent: 'شاشة طلبات' }), data.parts.talabatScreen ? pill('شغالة', 'ok') : pill('مقفولة', 'bad'),
      h('span', { className: 'muted', textContent: 'آخر تحديث ' + clock(new Date(at + offset).toISOString()) })));

    const alerts = [...calls.alerts, ...data.attention];
    $('homeAlerts').replaceChildren(alerts.length
      ? h('ul', { className: 'home-alerts' }, ...alerts.slice(0, 30).map(a => h('li', { className: a.level }, h('a', { href: '#' + a.view, textContent: a.text, onclick: go(a.view) }))))
      : h('p', { className: 'home-ok', textContent: '✓ مفيش حاجة محتاجة تدخل دلوقتي' }));
    $('homeAlertsN').textContent = alerts.length ? String(alerts.length) : '';

    const share = t.onApex ? Math.round(t.auto / t.onApex * 100) : null;
    const tb = b?.totals || {}, late = (b?.branches || []).reduce((n, x) => n + (x.late || 0), 0);
    $('homeGrid').replaceChildren(
      block('الكول سنتر', 'now', h('div', { className: 'cards' }, ...calls.tiles)),
      block('تحويل الأوردرات على Apex', 'transferLive', h('div', { className: 'cards' },
        tile('transferLive', 'مستني دلوقتي', String(t.waiting), !t.waiting ? 'good' : t.oldest >= 5 ? 'bad' : t.oldest >= 2 ? 'warn' : 'good', t.waiting ? 'أقدم واحد من ' + t.oldest + ' د' : ''),
        tile('transferLive', 'ماتسجلش', String(t.failed), t.failed ? 'bad' : 'good'),
        tile('transferLive', 'نسبة الآلي', share == null ? '—' : share + '%', share == null ? '' : share >= 80 ? 'good' : share >= 50 ? 'warn' : 'bad', 'طلبات ' + t.talabat.auto + '/' + t.talabat.apex + ' · الموقع ' + t.site.auto + '/' + t.site.apex),
        tile('transferLive', 'متوسط الوقت لحد Apex', t.avg == null ? '—' : t.avg + ' د', t.avg == null ? '' : t.avg <= 3 ? 'good' : t.avg <= 6 ? 'warn' : 'bad'))),
      block('الفروع', 'branchesNow', h('div', { className: 'cards' },
        tile('branchesNow', 'أوردرات مفتوحة', num(tb.open)),
        tile('branchesNow', 'متأخرة', num(late), late ? 'bad' : 'good', 'أكتر من ' + (b?.settings?.late || 30) + ' دقيقة'),
        tile('branchesNow', 'متوسط وقت الخروج', tb.avgOut == null ? '—' : Math.round(tb.avgOut) + ' د', tb.avgOut == null ? '' : tb.avgOut <= (b?.settings?.late || 30) ? 'good' : 'warn'),
        tile('cancels', 'الإلغاءات', num(tb.cancels), tb.cancels ? 'warn' : '', tb.cancelSales ? num(tb.cancelSales) + ' ج' : '')),
        branchTable(b)),
      block('اليوم لحد دلوقتي', 'daily', h('div', { className: 'cards' },
        tile('sales', 'الأوردرات', num(tb.orders)), tile('sales', 'المبيعات', tb.sales == null ? '—' : num(tb.sales) + ' ج'),
        tile('sales', 'الخصومات', tb.discounts == null ? '—' : num(tb.discounts) + ' ج'), tile('transferLive', 'اتسجل على Apex من طلبات والموقع', String(t.onApex), '', 'آلي ' + t.auto + ' · بإيد ' + (t.onApex - t.auto)))));
  }
  function branchTable(b) {
    const rows = (b?.branches || []).filter(x => x.orders || x.open);
    if (!rows.length) return h('p', { className: 'muted', textContent: b ? 'لسه مفيش أوردرات النهارده' : 'مرصد الأوردرات مش باعت بيانات' });
    const tr = (...c) => h('tr', {}, ...c);
    return h('div', { className: 'table-wrap' }, h('table', { className: 'home-branches' },
      tr(...['الفرع', 'أوردرات', 'مفتوح', 'متأخر', 'متوسط الخروج', 'إلغاء'].map(x => h('th', { textContent: x }))),
      ...rows.map(x => tr(h('td', { textContent: x.name }), h('td', { className: 'num', textContent: num(x.orders) }), h('td', { className: 'num', textContent: num(x.open) }),
        h('td', { className: 'num' }, x.late ? pill(String(x.late), x.veryLate ? 'bad' : 'warn') : '0'),
        h('td', { className: 'num', textContent: x.avgOut == null ? '—' : Math.round(x.avgOut) + ' د' }), h('td', { className: 'num', textContent: num(x.cancels) })))));
  }
  return { refresh, draw };
};
