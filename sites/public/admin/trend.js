'use strict';
// مرصد الدهان — على مدار الوقت (Karim 11-14, تصور المؤشرات): the eight headline numbers day by day, one small chart each,
// the target as a band (green inside it), the last value large. «Are we getting better?» at a glance.
window.MarsadTrend = function MarsadTrend(ctx) {
  const { api, h, $, exportRows } = ctx;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.append(...kids); return e; };
  const fmt = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const withUnit = (v, u) => v == null ? '—' : fmt(v) + (!u ? '' : u === '%' ? '%' : ' ' + u);
  // In words, not ≤/≥ (they turn round in Arabic text).
  const goalText = t => t.min != null && t.max != null ? 'من ' + withUnit(t.min, t.unit) + ' لحد ' + withUnit(t.max, t.unit) : t.min != null ? withUnit(t.min, t.unit) + ' أو أكتر' : withUnit(t.max, t.unit) + ' أو أقل';
  let last = null;

  function chart(t, pts) {
    const W = 320, H = 120, P = { l: 8, r: 8, t: 10, b: 18 };
    const vals = pts.map(p => p.v).filter(v => v != null), bounds = [t.min, t.max].filter(v => v != null);
    if (!vals.length) return h('p', { className: 'muted', textContent: 'مفيش بيانات للفترة دي' });
    let lo = Math.min(...vals, ...bounds), hi = Math.max(...vals, ...bounds); if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const x = i => P.l + (pts.length < 2 ? (W - P.l - P.r) / 2 : i / (pts.length - 1) * (W - P.l - P.r));
    const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tr-chart', role: 'img', direction: 'ltr' });
    // The target band: between min and max (or to the edge when only one side is set).
    const bTop = y(t.max != null ? t.max : hi), bBot = y(t.min != null ? t.min : lo);
    s.append(svg('rect', { x: P.l, y: bTop, width: W - P.l - P.r, height: Math.max(0, bBot - bTop), fill: '#22c55e', 'fill-opacity': '0.10' }));
    for (const v of [t.min, t.max]) if (v != null) s.append(svg('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: '#22c55e', 'stroke-opacity': '0.55', 'stroke-dasharray': '4 4' }));
    // The line, broken where a day has no value.
    let d = '', pen = false;
    pts.forEach((p, i) => { if (p.v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); pen = true; });
    s.append(svg('path', { d, fill: 'none', stroke: '#7dd3fc', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const ok = v => (t.min == null || v >= t.min) && (t.max == null || v <= t.max);
    pts.forEach((p, i) => { if (p.v != null) s.append(svg('circle', { cx: x(i), cy: y(p.v), r: i === pts.length - 1 ? 4 : 2.5, fill: ok(p.v) ? '#4ade80' : '#f87171' },
      svg('title', {}, p.day + ': ' + withUnit(p.v, t.unit)))); });
    const lab = (i, anchor) => svg('text', { x: x(i), y: H - 4, 'text-anchor': anchor, fill: '#8a97ad', 'font-size': 10 }, pts[i].day.slice(5));
    s.append(lab(0, 'start')); if (pts.length > 1) s.append(lab(pts.length - 1, 'end'));
    return s;
  }

  async function render(from, to) {
    if (from === to) { const d = new Date(to + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 27); from = d.toISOString().slice(0, 10); }
    const d = await api('/api/trend?from=' + from + '&to=' + to, { timeout: 120000 });
    last = d;
    $('trendNote').textContent = 'من ' + d.from + ' إلى ' + d.to + ' — يوم بيوم. المساحة الخضرا هي الهدف، والنقطة الحمرا يوم برّه الهدف.';
    $('trendGrid').replaceChildren(...Object.entries(d.targets).map(([k, t]) => {
      const pts = d.days.map(x => ({ day: x.day, v: x.values[k] })), have = pts.filter(p => p.v != null);
      const lastV = have.length ? have[have.length - 1].v : null, inT = have.filter(p => (t.min == null || p.v >= t.min) && (t.max == null || p.v <= t.max)).length;
      const goal = goalText(t);
      return h('article', { className: 'panel tr-card' }, h('div', { className: 'tr-head' }, h('span', { className: 'tr-label', textContent: t.label }),
        h('b', { className: 'tr-last', textContent: withUnit(lastV, t.unit) })),
        h('small', { className: 'muted', textContent: 'الهدف ' + goal + (have.length ? ' · في الهدف ' + inT + ' من ' + have.length + ' يوم' : '') }), chart(t, pts));
    }));
  }
  function exportIt() {
    if (!last) return;
    const keys = Object.keys(last.targets);
    exportRows('على-مدار-الوقت', [{ title: 'اليوم', get: r => r.day }, ...keys.map(k => ({ title: last.targets[k].label + (last.targets[k].unit ? ' (' + last.targets[k].unit + ')' : ''), get: r => r.values[k] }))], last.days);
  }
  return { render, export: exportIt };
};
