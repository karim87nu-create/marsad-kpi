'use strict';
// Small drawing helpers for the admin page: half-hour chart, day timeline, usage bars. No library.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
  const div = (cls, style = '') => Object.assign(document.createElement('div'), { className: cls, style });
  const hourLabel = iso => { const d = new Date(iso); const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' }).format(d)); return (h % 12 || 12) + (h < 12 ? 'ص' : 'م'); };
  const clock = iso => new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // Bars: answered + missed calls per slot. Line: average employees available. Dashed: on break.
  function slots(box, list) {
    box.replaceChildren();
    if (!list.length) { box.textContent = 'مفيش بيانات'; return; }
    const W = 1000, H = 260, L = 34, R = 34, T = 14, B = 26, n = list.length, bw = (W - L - R) / n;
    const maxCalls = Math.max(5, ...list.map(s => s.calls + s.shortAbandoned)), maxPeople = Math.max(3, ...list.map(s => Math.max(s.ready + s.onCall, s.onBreak)));
    const y1 = v => T + (H - T - B) * (1 - v / maxCalls), y2 = v => T + (H - T - B) * (1 - v / maxPeople);
    const x = i => W - R - (i + 0.5) * bw;                       // right to left: the day starts on the right
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
    for (let k = 0; k <= 4; k++) { const v = Math.round(maxCalls * k / 4), y = y1(v); svg.append(el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }), el('text', { x: W - R + 6, y: y + 4 }, String(v))); }
    for (let k = 0; k <= 3; k++) { const v = Math.round(maxPeople * k / 3 * 10) / 10; svg.append(el('text', { x: 4, y: y2(v) + 4, fill: css('--ready') }, String(v))); }
    list.forEach((s, i) => {
      const cx = x(i), w = Math.max(2, bw * 0.62), top = y1(s.answered), mid = y1(s.answered + s.abandoned);
      const g = el('g', { 'data-i': i });
      g.append(el('rect', { x: cx - bw / 2, y: T, width: bw, height: H - T - B, fill: 'transparent' }));
      if (!s.operating) g.append(el('rect', { x: cx - bw / 2, y: T, width: bw, height: H - T - B, fill: '#ffffff08' }));
      g.append(el('rect', { x: cx - w / 2, y: top, width: w, height: H - B - top, rx: 2, fill: css('--call') }));
      if (s.abandoned) g.append(el('rect', { x: cx - w / 2, y: mid, width: w, height: top - mid, rx: 2, fill: css('--bad') }));
      svg.append(g);
      if (i % 2 === 0) svg.append(el('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, hourLabel(s.start)));
    });
    const path = key => list.map((s, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y2(s[key]).toFixed(1)).join(' ');
    svg.append(el('path', { d: path('ready'), fill: 'none', stroke: css('--ready'), 'stroke-width': 2.5 }), el('path', { d: path('onBreak'), fill: 'none', stroke: css('--break'), 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    const wrap = div('chartbox'), tip = div('tip'); tip.hidden = true;
    const legend = div('legend'); legend.innerHTML = '<span><i style="background:var(--call)"></i>مكالمات اترد عليها</span><span><i style="background:var(--bad)"></i>فائتة محتسبة</span><span><i style="background:var(--ready)"></i>متوسط المتاحين</span><span><i style="background:var(--break)"></i>متوسط اللي في بريك</span><span><i style="background:#ffffff18"></i>بعد 3 الفجر</span>';
    svg.addEventListener('mousemove', e => {
      const g = e.target.closest('g[data-i]'); if (!g) { tip.hidden = true; return; }
      const s = list[g.dataset.i], r = wrap.getBoundingClientRect();
      tip.hidden = false; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
      tip.innerHTML = `<b>${clock(s.start)}</b><br>مكالمات ${s.calls} · اترد ${s.answered} · فائتة ${s.abandoned}<br>الرد خلال 10ث ${s.sla == null ? '—' : s.sla.toFixed(0) + '%'} · متوسط الانتظار ${s.asa == null ? '—' : s.asa.toFixed(1) + 'ث'}<br>متاحين ${s.ready} · في مكالمة ${s.onCall} · بريك ${s.onBreak}${s.waitingMax != null ? '<br>أقصى منتظرين ' + s.waitingMax : ''}`;
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
    wrap.append(svg, tip);
    box.append(legend, wrap);
  }

  // One row per employee: coloured state segments between from and to (epoch ms).
  function timeline(box, rows, from, to, { onName } = {}) {
    box.replaceChildren();
    if (!rows.length) { box.textContent = 'مفيش بيانات'; return; }
    const span = to - from, grid = div('timeline');
    const axis = div('axis');
    for (let t = Math.ceil(from / 3600000) * 3600000; t <= to; t += 3600000) {
      const b = document.createElement('b'); b.style.right = ((t - from) / span * 100) + '%'; b.textContent = hourLabel(new Date(t).toISOString()); axis.append(b);
    }
    grid.append(div('who'), axis);
    for (const r of rows) {
      const who = div('who'); who.textContent = r.name; who.title = r.name;
      if (onName) { who.style.cursor = 'pointer'; who.onclick = () => onName(r); }
      const track = div('track');
      for (const s of r.segments) {
        const a = Math.max(from, s.from), b = Math.min(to, s.to);
        if (b <= a) continue;
        const seg = Object.assign(document.createElement('span'), { className: 's-' + s.state, title: s.label + ' · ' + clock(new Date(a).toISOString()) + ' ← ' + clock(new Date(b).toISOString()) });
        seg.style.right = ((a - from) / span * 100) + '%'; seg.style.width = Math.max(0.15, (b - a) / span * 100) + '%';
        track.append(seg);
      }
      grid.append(who, track);
    }
    box.append(grid);
  }

  // Stacked share of the working time.
  function usage(parts) {
    const total = parts.reduce((n, p) => n + (p.value || 0), 0), bar = div('bar');
    if (total > 0) for (const p of parts) if (p.value > 0) { const s = document.createElement('span'); s.className = 's-' + p.state; s.style.width = (p.value / total * 100) + '%'; s.title = p.label; bar.append(s); }
    return bar;
  }
  function meter(value, max, color) {
    const m = div('meter'), s = document.createElement('span');
    s.style.width = (max > 0 ? Math.min(100, value / max * 100) : 0) + '%'; if (color) s.style.background = color;
    m.append(s); return m;
  }

  window.MarsadCharts = { slots, timeline, usage, meter };
})();
