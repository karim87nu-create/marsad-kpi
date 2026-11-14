'use strict';
// مرصد الدهان — الرئيسية (Karim 11-14: «عايز اللايف بتصميم حلو زي المكالمات»): the same room as the calls screen — a word
// that says how it is, the counts, the branches on the arc (a dial each: open orders, the late part in amber/red), the
// orders waiting to go on Apex in the middle like the calls queue, and under it what needs a person. Every second the
// clocks; every 5 seconds the data. The calls screen itself is not changed.
window.MarsadHome = function MarsadHome(ctx) {
  const { api, h, $, pill, show, dur } = ctx;
  const NS = 'http://www.w3.org/2000/svg', C = 2 * Math.PI * 38;
  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  let busy = false, data = null, live = null, at = 0, offset = 0, built = false;
  const now = () => Date.now() + offset;
  const num = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const mins = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? Math.max(0, Math.floor((now() - t) / 60000)) : null; };
  const mmss = v => { const t = Date.parse(v || ''); if (!Number.isFinite(t)) return '—'; const s = Math.max(0, Math.floor((now() - t) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const go = view => e => { e?.preventDefault?.(); show(view); };

  // ---------- skeleton (built once, like the calls room) ----------
  const E = {};
  function build() {
    const root = $('homeRoot');
    E.clock = h('span', { className: 'arc-clock' });
    E.parts = h('div', { className: 'inline ops-parts' });
    const tools = h('div', { className: 'arc-tools' }, E.clock, E.parts);
    E.word = h('span', { className: 'arc-word' }); E.line = h('span', { className: 'arc-line' });
    E.counts = {};
    const counts = h('div', { className: 'arc-counts' }, ...[['wait', 'مستني Apex', 'transferLive'], ['late', 'متأخر في الفروع', 'branchesNow'], ['line', 'على الخط', 'now'], ['auto', 'آلي النهارده', 'transferLive']].map(([k, l, v]) => {
      const n = h('span', { className: 'n', textContent: '0' }); E.counts[k] = n;
      return h('a', { className: 'arc-count ops-' + k, href: '#' + v, onclick: go(v) }, n, h('span', { className: 'l', textContent: l }));
    }));
    const head = h('div', { className: 'arc-head' }, h('div', { className: 'arc-verdict' }, E.word, E.line), counts);
    E.room = h('section', { className: 'arc-room ops-room' }); E.room.setAttribute('aria-label', 'الفروع وأوردرات مستنية Apex');
    const guides = svg('svg', { viewBox: '0 0 1000 520', preserveAspectRatio: 'none', class: 'arc-guides', 'aria-hidden': 'true' });
    guides.append(svg('path', { d: 'M 90 458 A 410 364 0 0 1 910 458', fill: 'none', stroke: '#1d2b47', 'stroke-dasharray': '3 7' }));
    guides.append(svg('path', { d: 'M 240 458 A 260 229 0 0 1 760 458', fill: 'none', stroke: '#16223a' }));
    E.seats = h('div', { className: 'arc-seats' });
    E.qlist = h('div', { className: 'arc-qlist' });
    E.qtitle = h('a', { className: 'arc-qt', href: '#transferLive', textContent: 'مستني يتسجل على Apex', onclick: go('transferLive') });
    E.room.append(guides, E.seats, h('div', { className: 'arc-queue ops-queue' }, E.qtitle, E.qlist));
    E.alerts = h('div', { className: 'ops-alerts' });
    E.strip = h('div', { className: 'ops-strip' });
    root.replaceChildren(h('div', { className: 'arc ops' }, tools, head, E.room, E.alerts, E.strip));
    built = true;
  }

  async function refresh() {
    if (busy) return; busy = true;
    try {
      const [d, l] = await Promise.all([api('/api/home', { timeout: 20000 }), api('/api/live', { timeout: 6000 }).catch(() => null)]);
      data = d; live = l; at = Date.now(); if (d.serverNow) offset = Date.parse(d.serverNow) - Date.now();
      draw();
    } finally { busy = false; }
  }

  function calls() {
    if (!live) return null;
    const t = now(), emp = live.employees || [], n = s => emp.filter(p => p.state === s).length;
    const q = live.queue, qAge = q ? (t - Date.parse(q.observedAt)) / 1000 : null, fresh = q && qAge < 30, waiting = fresh ? q.waiting || [] : [];
    const alerts = [];
    if (fresh && waiting.length && !n('ready')) alerts.push({ level: 'bad', text: waiting.length + ' عميل مستني على الخط ومفيش موظف متاح', view: 'now' });
    for (const p of emp.filter(p => p.state === 'break' && p.since && (t - Date.parse(p.since)) / 60000 > 15)) alerts.push({ level: 'warn', text: p.name + ' في بريك من ' + Math.floor((t - Date.parse(p.since)) / 60000) + ' دقيقة', view: 'now' });
    return { ready: n('ready'), call: n('on_call'), brk: n('break'), waiting: fresh ? waiting.length : null, alerts };
  }

  function seatPos(i, n) {
    // On the outer arc, evenly, the first branch on the right (RTL).
    const a = Math.PI * (n === 1 ? 0.5 : 0.12 + 0.76 * i / (n - 1)), cx = 500, cy = 470, rx = 390, ry = 370;
    return { left: (cx + rx * Math.cos(a)) / 10 + '%', top: (cy - ry * Math.sin(a)) / 600 * 100 + '%' };
  }
  function dial(open, late, veryLate) {
    const box = h('div', { className: 'arc-dial' }), s = svg('svg', { viewBox: '0 0 92 92' });
    const ring = (len, color, off = 0) => svg('circle', { cx: 46, cy: 46, r: 38, fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-dasharray': len + ' ' + C, 'stroke-dashoffset': -off });
    s.append(svg('circle', { cx: 46, cy: 46, r: 38, fill: '#0b1426', stroke: '#1d2b47', 'stroke-width': 7 }));
    const all = Math.max(open, 1), ok = Math.max(0, open - late), lt = Math.max(0, late - veryLate);
    if (ok) s.append(ring(C * ok / all, '#4ade80'));
    if (lt) s.append(ring(C * lt / all, '#fbbf24', C * ok / all));
    if (veryLate) s.append(ring(C * veryLate / all, '#f87171', C * (ok + lt) / all));
    box.append(s);
    if (veryLate) box.append(h('span', { className: 'arc-ping', style: 'border-color:#f87171' }));
    box.append(h('div', { className: 'arc-mid-txt' }, h('span', { className: 'timer', textContent: String(open) }), h('span', { className: 'ext', textContent: 'مفتوح' })));
    return box;
  }

  function draw() {
    if (!data) return;
    if (!built) build();
    const t = data.transfers, b = data.board, c = calls();
    const branches = (b?.branches || []).filter(x => x.orders || x.open);
    const late = branches.reduce((n, x) => n + (x.late || 0), 0), veryLate = branches.reduce((n, x) => n + (x.veryLate || 0), 0);
    const alerts = [...(c?.alerts || []), ...data.attention], bad = alerts.filter(a => a.level === 'bad').length;
    const share = t.onApex ? Math.round(t.auto / t.onApex * 100) : null;
    // The word: like the calls screen, one look says it.
    const word = bad ? 'محتاج تدخل' : alerts.length || t.oldest >= 2 || late ? 'خلي بالك' : 'تمام';
    E.word.textContent = word; E.word.className = 'arc-word ' + (bad ? 'ops-bad' : word === 'خلي بالك' ? 'ops-warn' : 'ops-ok');
    E.line.textContent = [t.waiting ? t.waiting + ' أوردر مستني يتسجل على Apex' + (t.oldest ? '، أقدمهم من ' + t.oldest + ' دقيقة' : '') : 'كل الأوردرات اتسجلت على Apex',
      late ? late + ' أوردر متأخر في الفروع' + (veryLate ? ' (' + veryLate + ' متأخر جداً)' : '') : 'مفيش تأخير في الفروع',
      c?.waiting ? c.waiting + ' عميل على الخط' : null].filter(Boolean).join(' · ');
    E.counts.wait.textContent = String(t.waiting); E.counts.wait.parentNode.classList.toggle('hot', t.oldest >= 5);
    E.counts.late.textContent = String(late);
    E.counts.line.textContent = c?.waiting == null ? '—' : String(c.waiting);
    E.counts.auto.textContent = share == null ? '—' : share + '%';
    const AUTO = { off: ['التحويل الآلي متوقف', 'warn'], trial: ['التحويل الآلي تجربة', 'warn'], on: ['التحويل الآلي شغال', 'ok'] };
    const part = (label, m) => pill(label + (m == null ? ' — مفيش' : m >= 4 ? ' — واقف من ' + m + ' د' : ''), m == null || m >= 4 ? 'bad' : 'ok');
    E.parts.replaceChildren(pill(...(AUTO[data.autoMode] || [data.autoMode, 'warn'])), part('كاتب Apex', mins(data.parts.writerSeen)), part('قراءة Apex', mins(data.parts.apexPush)),
      pill('شاشة طلبات' + (data.parts.talabatScreen ? '' : ' — مقفولة'), data.parts.talabatScreen ? 'ok' : 'bad'));

    // The branches on the arc.
    E.seats.replaceChildren(...branches.map((x, i) => {
      const seat = h('a', { className: 'arc-seat ops-seat', href: '#branchesNow', onclick: go('branchesNow') });
      Object.assign(seat.style, seatPos(i, branches.length));
      seat.append(dial(x.open || 0, x.late || 0, x.veryLate || 0), h('span', { className: 'arc-name', textContent: x.name }),
        h('span', { className: 'arc-note' + (x.veryLate ? ' ops-bad' : x.late ? ' ops-warn' : ' muted'), textContent: (x.late ? x.late + ' متأخر · ' : '') + 'خروج ' + (x.avgOut == null ? '—' : Math.round(x.avgOut) + ' د') }),
        h('span', { className: 'arc-note muted', textContent: num(x.orders) + ' أوردر النهارده' }));
      return seat;
    }), ...(branches.length ? [] : [h('p', { className: 'arc-empty ops-nob', textContent: b ? 'لسه مفيش أوردرات النهارده' : 'مرصد الأوردرات مش باعت من جهاز الكاشير' })]));
    drawQueue();

    // What needs a person.
    E.alerts.replaceChildren(h('div', { className: 'arc-phead' }, h('span', { className: 'arc-ptitle', textContent: 'محتاج تدخل' }), alerts.length ? pill(String(alerts.length), bad ? 'bad' : 'warn') : null),
      alerts.length ? h('div', { className: 'ops-alist' }, ...alerts.slice(0, 30).map(a => h('a', { className: 'arc-cap ops-cap ' + (a.level === 'bad' ? 'red' : 'late'), href: '#' + a.view, onclick: go(a.view) }, h('span', { textContent: a.text }))))
        : h('p', { className: 'ops-ok-line', textContent: '✓ مفيش حاجة محتاجة تدخل دلوقتي' }));

    // The rest, small: the call center and the day.
    const tb = b?.totals || {}, chip = (label, value, view, tone = '') => h('a', { className: 'ops-chip ' + tone, href: '#' + view, onclick: go(view) }, h('b', { textContent: value }), h('span', { textContent: label }));
    E.strip.replaceChildren(
      h('div', { className: 'ops-group' }, h('span', { className: 'arc-ptitle', textContent: 'الكول سنتر' }), h('div', { className: 'ops-chips' },
        chip('فاضيين', c ? String(c.ready) : '—', 'now', c && !c.ready ? 'bad' : 'ok'), chip('في مكالمة', c ? String(c.call) : '—', 'now', 'call'), chip('بريك', c ? String(c.brk) : '—', 'now', 'brk'))),
      h('div', { className: 'ops-group' }, h('span', { className: 'arc-ptitle', textContent: 'النهارده' }), h('div', { className: 'ops-chips' },
        chip('أوردر', num(tb.orders), 'daily'), chip('مبيعات', tb.sales == null ? '—' : num(tb.sales) + ' ج', 'sales'), chip('إلغاء', num(tb.cancels), 'cancels', tb.cancels ? 'warn' : ''),
        chip('متوسط Apex', t.avg == null ? '—' : t.avg + ' د', 'transferLive', t.avg == null ? '' : t.avg <= 3 ? 'ok' : t.avg <= 6 ? 'warn' : 'bad'),
        chip('آلي / بإيد', t.auto + ' / ' + (t.onApex - t.auto), 'transferLive'))));
    tick();
  }
  // The waiting orders, like the calls queue: the oldest first, amber from 2 minutes, red from 5.
  function drawQueue() {
    const w = (data.waitingList || []).slice(0, 3), more = (data.waitingList || []).length - w.length;
    if (!w.length) { E.qlist.replaceChildren(h('p', { className: 'arc-empty', textContent: data.transfers.failed ? '' : 'مفيش أوردر مستني' })); return; }
    E.qlist.replaceChildren(...w.map(x => {
      const m = mins(x.at), cap = h('a', { className: 'arc-cap' + (x.state === 'failed' || m >= 5 ? ' red' : m >= 2 ? ' late' : ''), href: '#transferLive', onclick: go('transferLive') });
      const time = h('span', { className: 'w ops-t', textContent: mmss(x.at) }); time.dataset.at = x.at || '';
      const bar = h('span', { style: 'width:' + Math.min(100, (m || 0) / 5 * 100) + '%' });
      cap.append(h('div', { className: 'arc-cap-top' }, h('span', { textContent: (x.source === 'talabat' ? 'طلبات #' : 'الموقع #') + (x.code || x.ref) + (x.branch ? ' · ' + x.branch : '') }), time),
        h('div', { className: 'arc-cap-bar' }, bar, h('span', { className: 'tick' })),
        h('span', { className: 'who', textContent: x.state === 'failed' ? 'ماتسجلش: ' + (x.why || '') : x.state === 'claimed' ? 'مع ' + x.by : x.state === 'writing' ? 'بيتسجل دلوقتي' : (x.why || '').split(' · ')[0] }));
      return cap;
    }), ...(more > 0 ? [h('a', { className: 'arc-empty', href: '#transferLive', onclick: go('transferLive'), textContent: '+ ' + more + ' كمان' })] : []));
  }
  function tick() {
    if (!built) return;
    E.clock.textContent = new Date(now()).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', second: '2-digit' });
    for (const el of E.qlist.querySelectorAll('.ops-t')) el.textContent = mmss(el.dataset.at);
  }
  return { refresh, draw, tick };
};
