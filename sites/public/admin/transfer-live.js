'use strict';
// مرصد الدهان — التحويلات لايف (Karim 11-14 «عايز لايف في الادمن للتحويلات زي المكالمات»): every Talabat and website
// order of the day where it is now, with its own clock: waiting (and why), with an employee, being written, on Apex
// (by whom, how long it took), failed. Data every 5 seconds, clocks every second.
window.MarsadTransferLive = function MarsadTransferLive(ctx) {
  const { api, h, $, table, pill, kpi } = ctx;
  let data = null, offset = 0, busy = false, fetchedAt = 0;
  const now = () => Date.now() + offset;
  const ms = v => v ? Date.parse(v) : NaN;
  const mins = (from, to = now()) => Number.isFinite(from) ? Math.max(0, Math.floor((to - from) / 60000)) : null;
  const clock = v => { const t = ms(v); if (!Number.isFinite(t)) return '—'; return new Date(t).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }); };
  const age = from => { const t = ms(from); if (!Number.isFinite(t)) return '—'; const s = Math.max(0, Math.floor((now() - t) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const src = x => (x.source === 'talabat' ? 'طلبات #' : 'الموقع #') + (x.code || x.ref);
  const tone = m => m == null ? '' : m >= 5 ? 'bad' : m >= 2 ? 'warn' : 'ok';

  async function refresh() {
    if (busy) return; busy = true;
    try { data = await api('/api/transfer/live', { timeout: 20000 }); if (data.serverNow) offset = Date.parse(data.serverNow) - Date.now(); fetchedAt = Date.now(); draw(); }
    finally { busy = false; }
  }
  function partsLine() {
    const p = data.parts || {}, stale = (v, lim) => { const m = mins(ms(v)); return m == null ? pill('مفيش', 'bad') : m >= lim ? pill('من ' + m + ' دقيقة', 'bad') : pill('شغال', 'ok'); };
    const AUTO = { off: ['التحويل الآلي متوقف', 'warn'], trial: ['التحويل الآلي تجربة', 'warn'], on: ['التحويل الآلي شغال', 'ok'] };
    const WR = { off: 'الكاتب متوقف', shadow: 'الكاتب معاينة', test: 'الكاتب على الاختبار', live: 'الكاتب على Apex' };
    return h('div', { className: 'inline', style: 'flex-wrap:wrap;gap:8px' },
      pill(...(AUTO[data.autoMode] || [data.autoMode, 'warn'])), pill(WR[data.writerMode] || data.writerMode, data.writerMode === 'live' ? 'ok' : 'warn'),
      h('span', { textContent: 'كاتب Apex:' }), stale(p.writerSeen, 3), h('span', { textContent: 'قراءة Apex:' }), stale(p.apexPush, 4),
      h('span', { textContent: 'شاشة طلبات:' }), p.talabatScreen ? pill('شغالة', 'ok') : pill('مش شغالة', 'bad'),
      data.stale ? pill('القائمة متأخرة شوية', 'warn') : null, h('span', { className: 'muted', textContent: ' آخر تحديث ' + clock(new Date(fetchedAt + offset).toISOString()) }));
  }
  function draw() {
    if (!data) return;
    const L = data.list || [], by = st => L.filter(x => x.state === st);
    const waiting = [...by('waiting'), ...by('claimed')].filter(x => !x.scheduled || mins(ms(x.at)) != null), writing = by('writing'), failed = by('failed'), onApex = by('apex');
    const auto = onApex.filter(x => x.how === 'auto'), took = onApex.map(x => mins(ms(x.at), ms(x.enteredAt))).filter(v => v != null && v < 180);
    const avg = took.length ? Math.round(took.reduce((a, b) => a + b, 0) / took.length * 10) / 10 : null;
    const oldest = waiting.reduce((m, x) => Math.max(m, mins(ms(x.at)) || 0), 0);
    $('tlParts').replaceChildren(partsLine());
    $('tlCards').replaceChildren(
      kpi('مستني دلوقتي', String(waiting.length), waiting.length ? tone(oldest) : 'good', waiting.length ? 'أقدم واحد من ' + oldest + ' دقيقة' : ''),
      kpi('بيتسجل على Apex', String(writing.length), writing.length ? 'warn' : 'good'),
      kpi('ماتسجلش', String(failed.length), failed.length ? 'bad' : 'good'),
      kpi('على Apex النهارده', String(onApex.length), '', 'آلي ' + auto.length + ' · بإيد ' + (onApex.length - auto.length)),
      kpi('نسبة الآلي', onApex.length ? Math.round(auto.length / onApex.length * 100) + '%' : '—', !onApex.length ? '' : auto.length / onApex.length >= 0.8 ? 'good' : auto.length / onApex.length >= 0.5 ? 'warn' : 'bad'),
      kpi('متوسط الوقت لحد Apex', avg == null ? '—' : avg + ' دقيقة', avg == null ? '' : avg <= 3 ? 'good' : avg <= 6 ? 'warn' : 'bad'));
    const STATE = { waiting: ['مستني', 'warn'], claimed: ['مع موظف', 'warn'], writing: ['بيتسجل', 'ok'], failed: ['ماتسجلش', 'bad'] };
    table('tlNow', [
      { title: 'الأوردر', get: src },
      { title: 'الفرع', get: x => x.branch || '—' },
      { title: 'وصل', get: x => x.at, show: x => clock(x.at), type: 'datetime' },
      { title: 'بقاله', get: x => mins(ms(x.at)), show: x => { const b = pill(age(x.at), tone(mins(ms(x.at)))); b.classList.add('tl-age'); b.dataset.at = x.at || ''; return b; }, type: 'number' },
      { title: 'الحالة', get: x => x.state, show: x => pill((STATE[x.state] || [x.state])[0] + (x.by ? ' — ' + x.by : ''), (STATE[x.state] || [0, 'warn'])[1]) },
      { title: 'ليه / النتيجة', get: x => x.why || '', cls: () => 'wrap' },
      { title: 'العميل', get: x => x.name || '' }
    ], [...failed, ...writing, ...waiting].sort((a, b) => (ms(a.at) || 0) - (ms(b.at) || 0)), { empty: 'مفيش أوردر مستني — كله اتسجل' });
    const last = onApex.filter(x => mins(ms(x.enteredAt || x.at)) <= 120).sort((a, b) => (ms(b.enteredAt || b.at) || 0) - (ms(a.enteredAt || a.at) || 0));
    table('tlDone', [
      { title: 'الأوردر', get: src },
      { title: 'الفرع', get: x => x.branch || '—' },
      { title: 'وصل', get: x => x.at, show: x => clock(x.at), type: 'datetime' },
      { title: 'اتسجل', get: x => x.enteredAt, show: x => clock(x.enteredAt), type: 'datetime' },
      { title: 'خد', get: x => mins(ms(x.at), ms(x.enteredAt)), show: x => { const m = mins(ms(x.at), ms(x.enteredAt)); return m == null ? '—' : pill(m + ' د', tone(m)); }, type: 'number' },
      { title: 'سجله', get: x => x.by, show: x => x.how === 'auto' ? pill('آلي', 'ok') : h('span', { textContent: x.by || '—' }) },
      { title: 'رقم Apex', get: x => x.sn ? x.sn + ' (' + x.apexNo + ')' : x.apexNo },
      { title: 'خرج', get: x => x.out ? 'خرج مع الطيار' : '' }
    ], last, { empty: 'مفيش أوردرات اتسجلت آخر ساعتين' });
  }
  // The clocks move every second without asking the server.
  function tick() { for (const b of document.querySelectorAll('#tlBody .tl-age')) b.textContent = age(b.dataset.at); }
  return { refresh, tick, draw };
};
