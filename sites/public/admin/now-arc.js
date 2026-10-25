'use strict';
// مرصد الأداء — the "now" screen: the team on an arc, the queue in the middle, the last hours as a pulse bar.
// Drawn from /api/live (every second), /api/pulse (every minute) and /api/now-layout (the seat order, shared by all admins).
window.MarsadArc = function MarsadArc(ctx) {
  const { api, QUEUE, OUT, hm, hms, canWrite } = ctx;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const short = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x; };
  const first = name => String(name || '').trim().split(/\s+/)[0] || '';
  const C = 2 * Math.PI * 38, BREAK_S = 900, CALL_S = 240, LATE_S = 7;
  const KIND = { ready: 'ready', on_call: 'call', break: 'break', unknown: 'gap', disconnected: 'gap', logged_in: 'idle', logged_out: 'out' };
  const CODE = { r: 'ready', c: 'call', b: 'break', u: 'gap', o: 'out', '-': 'none' };

  const S = { order: [], back: 0, playing: false, scrubbing: false, arranging: false, drag: null, picked: null, pulse: null, pulseAt: 0, live: null, now: 0, qAge: null, qFresh: false };

  // ---------- skeleton ----------
  const root = el('div', 'arc');
  const head = el('div', 'arc-head');
  const verdictBox = el('div', 'arc-verdict'), verdict = el('span', 'arc-word'), verdictLine = el('span', 'arc-line');
  verdictBox.append(verdict, verdictLine);
  const counts = el('div', 'arc-counts');
  const countEl = {};
  for (const [k, label] of [['ready', 'فاضيين'], ['call', 'في مكالمة'], ['break', 'بريك'], ['wait', 'انتظار']]) {
    const box = el('div', 'arc-count ' + k), n = el('span', 'n', '0'); box.append(n, el('span', 'l', label)); counts.append(box); countEl[k] = n;
  }
  head.append(verdictBox, counts);

  const tools = el('div', 'arc-tools');
  const clockEl = el('span', 'arc-clock');
  const arrangeBtn = el('button', 'ghost small arc-arrange', 'رتّب الأماكن'); arrangeBtn.type = 'button';
  const resetBtn = el('button', 'ghost small', 'رجّع الترتيب'); resetBtn.type = 'button'; resetBtn.hidden = true;
  tools.append(clockEl, resetBtn, arrangeBtn);

  const room = el('section', 'arc-room'); room.setAttribute('aria-label', 'الموظفين والطابور');
  const guides = svg('svg', { viewBox: '0 0 1000 520', preserveAspectRatio: 'none', class: 'arc-guides', 'aria-hidden': 'true' });
  guides.append(svg('path', { d: 'M 90 458 A 410 364 0 0 1 910 458', fill: 'none', stroke: '#1d2b47', 'stroke-dasharray': '3 7' }));
  guides.append(svg('path', { d: 'M 240 458 A 260 229 0 0 1 760 458', fill: 'none', stroke: '#16223a' }));
  const beams = svg('svg', { viewBox: '0 0 1000 520', preserveAspectRatio: 'none', class: 'arc-beams', 'aria-hidden': 'true' });
  const seatsBox = el('div', 'arc-seats');
  const queueBox = el('div', 'arc-queue'), queueTitle = el('span', 'arc-qt', 'الطابور'), queueList = el('div', 'arc-qlist');
  queueBox.append(queueTitle, queueList);
  room.append(guides, beams, seatsBox, queueBox);
  const away = el('p', 'arc-away muted'), outRow = el('div', 'arc-out');

  const pulse = el('section', 'arc-pulse'); pulse.setAttribute('aria-label', 'النبض');
  const pHead = el('div', 'arc-phead');
  const pTitle = el('span', 'arc-ptitle', 'النبض'), pHint = el('span', 'arc-hint muted');
  const playBtn = el('button', 'ghost small', 'شغّل آخر 3 ساعات'); playBtn.type = 'button';
  const nowBtn = el('button', 'small', 'رجوع للآن'); nowBtn.type = 'button'; nowBtn.hidden = true;
  const pBtns = el('div', 'inline'); pBtns.append(playBtn, nowBtn);
  pHead.append(pTitle, pHint, pBtns);
  const track = el('div', 'arc-track'); track.tabIndex = 0; track.setAttribute('role', 'slider'); track.setAttribute('aria-label', 'الوقت: ارجع لأي دقيقة');
  const bars = svg('svg', { class: 'arc-bars', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const handle = el('span', 'arc-handle'), marks = el('div', 'arc-marks');
  track.append(bars, el('span', 'arc-mid'), handle, marks);
  const axis = el('div', 'arc-axis');
  const detail = el('div', 'arc-detail'); detail.hidden = true; detail.setAttribute('aria-live', 'polite');
  pulse.append(pHead, track, axis, detail);
  root.append(tools, head, room, outRow, away, pulse);

  // ---------- seat order (shared) ----------
  api('/api/now-layout').then(d => { S.order = (d.order || []).map(String); draw(); }).catch(() => {});
  const saveOrder = order => { S.order = order; draw(); api('/api/now-layout', { method: 'POST', body: { order } }).catch(e => { pHint.textContent = 'الترتيب متحفظش: ' + (e.message || e); }); };

  // ---------- pulse data ----------
  async function loadPulse(force) {
    if (!force && Date.now() - S.pulseAt < 60000) return;
    S.pulseAt = Date.now();
    try { S.pulse = await api('/api/pulse?minutes=180', { timeout: 15000 }); drawBars(); draw(); } catch { S.pulseAt = Date.now() - 45000; }
  }
  const N = () => S.pulse ? S.pulse.count : 0;
  const minuteAt = i => Date.parse(S.pulse.from) + i * 60000;

  // ---------- who is on the arc ----------
  function people() {
    const live = S.live?.employees || [], back = S.back, P = S.pulse;
    if (back > 0 && P) {
      const i = N() - 1 - back;
      return P.people.map(p => {
        const lp = live.find(x => x.employeeId === p.employeeId) || {};
        return { id: String(p.employeeId), name: p.name || lp.name || '', ext: lp.extension || '', kind: CODE[p.s[i]] || 'none', past: true };
      }).filter(p => ['ready', 'call', 'break', 'gap'].includes(p.kind));
    }
    return live.filter(p => KIND[p.state] && KIND[p.state] !== 'out').map(p => ({ id: String(p.employeeId), name: p.name, ext: p.extension || '', kind: KIND[p.state],
      elapsed: p.since ? (S.now - Date.parse(p.since)) / 1000 : null, since: p.since, queue: p.queue, phone: p.phone, outKind: p.outKind, lastEvidence: p.lastEvidence }));
  }
  function ordered(list) {
    const pos = new Map(S.order.map((id, i) => [id, i]));
    return list.slice().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e6) - (pos.has(b.id) ? pos.get(b.id) : 1e6) || (Number(a.ext) || 1e9) - (Number(b.ext) || 1e9) || a.name.localeCompare(b.name, 'ar'));
  }
  // Up to 9 seats on one arc; more on two (outer then inner).
  function slots(n) {
    const outer = n <= 9 ? n : Math.ceil(n * 0.58), out = [];
    for (let i = 0; i < n; i++) {
      const inner = i >= outer, k = inner ? i - outer : i, m = inner ? n - outer : outer;
      const a = Math.PI * (0.06 + 0.88 * (m > 1 ? k / (m - 1) : 0.5));
      out.push(inner ? { a, x: 50 + 26 * Math.cos(a), y: 88 - 44 * Math.sin(a) } : { a, x: 50 + 41 * Math.cos(a), y: 88 - 70 * Math.sin(a) });
    }
    return out;
  }

  // ---------- one seat ----------
  const seatEls = new Map();
  function seatEl(id) {
    if (seatEls.has(id)) return seatEls.get(id);
    const s = el('div', 'arc-seat'); s.dataset.id = id;
    const dial = el('div', 'arc-dial'), ping = el('span', 'arc-ping');
    const g = svg('svg', { viewBox: '0 0 92 92', 'aria-hidden': 'true' });
    const base = svg('circle', { cx: 46, cy: 46, r: 38, 'stroke-width': 5 }), ring = svg('circle', { cx: 46, cy: 46, r: 38, fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round' });
    g.append(base, ring);
    const mid = el('div', 'arc-mid-txt'), ext = el('span', 'ext'), timer = el('span', 'timer'); mid.append(ext, timer);
    dial.append(ping, g, mid);
    const name = el('strong', 'arc-name'), note = el('span', 'arc-note');
    s.append(dial, name, note);
    const parts = { s, ping, base, ring, ext, timer, name, note };
    s.addEventListener('pointerdown', e => { if (!S.arranging) return; e.preventDefault(); S.drag = { id, x: null, y: null }; room.setPointerCapture?.(e.pointerId); });
    seatEls.set(id, parts); seatsBox.append(s);
    return parts;
  }
  function paintSeat(P, p, sl, n) {
    const el = p.elapsed;
    let k = p.kind, ring = '#2a3a58', fill = '#0a1222', tone = '#e9eef7', pct = 0, note = '', noteTone = '#8c9ab3', alarm = false, dim = false, track = 'none', timer = el != null && ['call', 'break'].includes(k) ? short(el) : '—';
    if (k === 'ready') { ring = '#4ade80'; fill = '#0c2a1a'; tone = '#86efac'; pct = 1; note = 'فاضي — مستني مكالمة'; noteTone = '#86efac'; timer = el != null ? short(el) : '—'; }
    if (k === 'call') { const over = el != null && el > CALL_S; ring = over ? '#f59e0b' : '#38bdf8'; fill = '#0a2033'; tone = over ? '#fcd34d' : '#7dd3fc'; pct = el == null ? 1 : Math.min(1, el / CALL_S); note = over ? 'مكالمة طويلة' : (p.queue ? QUEUE(p.queue) : 'في مكالمة'); noteTone = over ? '#fcd34d' : '#8c9ab3'; alarm = over; }
    if (k === 'break') { const over = el != null && el > BREAK_S; ring = over ? '#ef4444' : '#f59e0b'; fill = over ? '#2a1015' : '#271c08'; tone = over ? '#fca5a5' : '#fcd34d'; pct = el == null ? 1 : Math.min(1, el / BREAK_S); note = el == null ? 'بريك' : over ? 'عدّى الـ 15 د بـ ' + short(el - BREAK_S) : 'بريك — باقي ' + short(BREAK_S - el); noteTone = tone; alarm = over; }
    if (k === 'gap') { ring = '#ef4444'; tone = '#fca5a5'; note = p.since ? 'انقطاع رصد من ' + hm(p.since) : 'انقطاع رصد'; noteTone = '#fca5a5'; dim = 0.75; track = '4 6'; timer = '—'; }
    if (k === 'idle') { note = 'سجّل ولسه مدخلش الكونسول'; dim = 0.65; track = '4 6'; timer = '—'; }
    if (k === 'out') { note = (p.outKind ? OUT[p.outKind] : 'برّه التحويلة') + (p.since ? ' من ' + hm(p.since) : ''); dim = 0.55; track = '4 6'; timer = '—'; }
    if (k === 'none') { note = 'مكانش في الشيفت'; dim = 0.35; track = '4 6'; timer = '—'; }
    if (p.past && ['ready', 'call', 'break'].includes(k)) { timer = { ready: 'فاضي', call: 'مكالمة', break: 'بريك' }[k]; note = ''; alarm = false; }
    if (p.past && k === 'out') note = 'برّه التحويلة';
    const dragging = S.drag && S.drag.id === p.id && S.drag.x != null;
    P.s.style.left = (dragging ? S.drag.x : sl.x).toFixed(2) + '%';
    P.s.style.top = (dragging ? S.drag.y : sl.y).toFixed(2) + '%';
    P.s.classList.toggle('dragging', !!dragging);
    P.s.classList.toggle('arranging', S.arranging);
    P.s.classList.toggle('small', n > 12);
    P.s.style.opacity = dim || '';
    P.ping.hidden = !alarm; P.ping.style.borderColor = ring;
    P.base.setAttribute('fill', fill); P.base.setAttribute('stroke', '#1d2b47'); P.base.setAttribute('stroke-dasharray', track);
    P.ring.setAttribute('stroke', ring); P.ring.setAttribute('stroke-dasharray', (pct * C).toFixed(1) + ' ' + C.toFixed(1));
    P.ext.textContent = p.ext || ''; P.timer.textContent = timer; P.timer.style.color = tone;
    P.name.textContent = p.name; P.note.textContent = note; P.note.style.color = noteTone;
    P.s.title = [p.name, p.ext && 'تحويلة ' + p.ext, k === 'call' && p.phone, p.lastEvidence && 'آخر إشارة ' + hms(p.lastEvidence)].filter(Boolean).join(' · ');
  }

  // ---------- the queue ----------
  function queueNow() {
    if (S.back > 0) {
      const q = S.pulse?.queue[N() - 1 - S.back];
      return { known: !!q, waiting: q ? q[0] : 0, longest: q ? q[1] : 0, list: [] };
    }
    const q = S.live?.queue;
    if (!S.qFresh) return { known: false, waiting: 0, longest: 0, list: [] };
    const list = q.waiting.map(r => ({ queue: QUEUE(r.queue), phone: r.phone, wait: ctx.waitNow(r.wait, S.qAge) || 0 })).sort((a, b) => b.wait - a.wait);
    return { known: true, waiting: list.length, longest: list[0]?.wait || 0, list };
  }

  // ---------- draw ----------
  function draw() {
    if (!S.live) return;
    const past = S.back > 0 && !!S.pulse;
    if (!past) S.back = 0;
    const list = ordered(people()), n = list.length, sl = slots(n);
    room.classList.toggle('two', n > 9);
    const seen = new Set();
    list.forEach((p, i) => { const P = seatEl(p.id); seen.add(p.id); paintSeat(P, p, sl[i], n); });
    for (const [id, P] of seatEls) if (!seen.has(id)) { P.s.remove(); seatEls.delete(id); }
    // Keep the page order the same as the seat order (narrow screens show the seats as a grid).
    const want = list.map(p => seatEls.get(p.id).s);
    if (want.some((e, i) => seatsBox.children[i] !== e)) seatsBox.append(...want);
    S.slots = sl; S.list = list;

    const c = k => list.filter(p => p.kind === k).length;
    const cnt = { ready: c('ready'), call: c('call'), brk: c('break') };
    const q = queueNow(), late = q.longest > LATE_S && q.waiting > 0;
    countEl.ready.textContent = cnt.ready; countEl.call.textContent = cnt.call; countEl.break.textContent = cnt.brk;
    countEl.wait.textContent = q.known ? q.waiting : '—';
    countEl.wait.style.color = !q.known ? '#8c9ab3' : q.waiting && !cnt.ready ? '#f87171' : late ? '#fbbf24' : '#e9eef7';
    const readyNames = list.filter(p => p.kind === 'ready').map(p => first(p.name) + (p.ext ? ' (' + p.ext + ')' : '')).join('، ');
    const at = past ? minuteAt(N() - 1 - S.back) : S.now;
    clockEl.textContent = past ? hm(at) : hms(S.now);

    // The verdict.
    let word = 'مفيش ضغط', tone = '#4ade80', line = cnt.ready + ' فاضيين ومفيش حد في الانتظار أكتر من 7 ثواني';
    if (!q.known) { word = cnt.ready ? 'فيه فاضيين' : 'محدش فاضي'; tone = cnt.ready ? '#4ade80' : '#fbbf24'; line = 'بيانات الانتظار مش واصلة دلوقتي — ' + cnt.ready + ' فاضيين · ' + cnt.call + ' في مكالمة · ' + cnt.brk + ' بريك'; }
    else if (late && cnt.ready) { word = 'عميل في الانتظار'; tone = '#fbbf24'; line = 'في الانتظار من ' + short(q.longest) + ' وفيه ' + cnt.ready + ' فاضيين: ' + readyNames + ' — راجع التوزيع على نوع الطلب'; }
    else if (q.waiting && !cnt.ready) { word = 'محدش فاضي'; tone = '#f87171'; line = q.waiting + ' في الانتظار، أطولهم ' + short(q.longest) + ' — ' + cnt.call + ' في مكالمة و' + cnt.brk + ' في بريك'; }
    if (past) { const b = S.back; word = 'من ' + (b >= 60 ? Math.floor(b / 60) + ' س ' : '') + (b % 60) + ' د'; tone = '#e0b07a';
      line = 'كده كان الوضع ' + hm(at) + ': ' + cnt.ready + ' فاضيين · ' + cnt.call + ' في مكالمة · ' + cnt.brk + ' بريك · ' + (q.known ? q.waiting + ' في الانتظار' + (q.longest ? '، أطولهم ' + short(q.longest) : '') : 'الانتظار مش متسجل'); }
    verdict.textContent = word; verdict.style.color = tone; verdictLine.textContent = line;
    root.classList.toggle('alarm', !past && q.known && q.waiting > 0 && !cnt.ready);

    // The queue in the middle.
    queueList.replaceChildren();
    if (past) queueList.append(el('span', 'arc-empty', q.known ? (q.waiting ? q.waiting + ' في الانتظار · أطولهم ' + short(q.longest) : 'الطابور كان فاضي') : 'مفيش لقطة انتظار للدقيقة دي'));
    else if (!q.known) queueList.append(el('span', 'arc-empty', S.live.queue ? 'آخر بيانات انتظار ' + hm(S.live.queue.observedAt) + ' — قديمة' : 'الموصل مش باعت بيانات الانتظار'));
    else if (!q.list.length) queueList.append(el('span', 'arc-empty', 'الطابور فاضي'));
    else {
      for (const r of q.list.slice(0, 3)) {
        const lt = r.wait > LATE_S, red = lt && !cnt.ready, card = el('div', 'arc-cap' + (red ? ' red' : lt ? ' late' : ''));
        const top = el('div', 'arc-cap-top'); top.append(el('span', '', r.queue + ' · ' + r.phone), el('span', 'w', short(r.wait)));
        const bar = el('div', 'arc-cap-bar'), fillBar = el('span'); fillBar.style.width = Math.min(100, r.wait / 20 * 100).toFixed(1) + '%'; bar.append(fillBar, el('span', 'tick'));
        card.append(top, bar, el('span', 'who', !lt ? 'لسه في أول الانتظار' : cnt.ready ? 'فاضيين: ' + readyNames : 'محدش فاضي — كله في مكالمة أو بريك'));
        queueList.append(card);
      }
      if (q.list.length > 3) queueList.append(el('span', 'arc-empty', 'و' + (q.list.length - 3) + ' كمان في الانتظار'));
    }

    // Beams from the queue to the free people when a customer is late.
    beams.replaceChildren();
    if (!past && late && cnt.ready && !S.arranging) list.forEach((p, i) => { if (p.kind === 'ready') beams.append(svg('line', { x1: 500, y1: 470, x2: (sl[i].x * 10).toFixed(1), y2: (sl[i].y * 5.2 + 52).toFixed(1), class: 'beam' })); });

    // Off the arc: not working today.
    // Left the extension today: one small chip each, under the arc.
    const outs = (S.live.employees || []).filter(p => KIND[p.state] === 'out').sort((a, b) => Date.parse(b.since || 0) - Date.parse(a.since || 0));
    outRow.replaceChildren(...(outs.length ? [el('span', 'arc-out-t', 'خرجوا (' + outs.length + ')')] : []), ...outs.map(p => {
      const c = el('span', 'arc-chip'); c.append(el('strong', '', p.name), el('span', '', (p.outKind ? OUT[p.outKind] : 'خرج') + (p.since ? ' · ' + hm(p.since) : '')));
      c.title = p.name + (p.extension ? ' · تحويلة ' + p.extension : ''); return c; }));
    outRow.hidden = !outs.length || past;
    const offToday = (S.live.employees || []).filter(p => !KIND[p.state]);
    away.textContent = offToday.length ? 'مش في الشيفت دلوقتي: ' + offToday.map(p => first(p.name)).join('، ') : '';
    away.hidden = !offToday.length || past;

    // Tools and the time bar.
    arrangeBtn.hidden = !canWrite(); arrangeBtn.textContent = S.arranging ? 'خلصت' : 'رتّب الأماكن'; arrangeBtn.classList.toggle('on', S.arranging);
    resetBtn.hidden = !S.arranging;
    nowBtn.hidden = !past; playBtn.textContent = S.playing ? 'وقّف' : 'شغّل آخر 3 ساعات'; playBtn.disabled = !S.pulse;
    pHint.textContent = S.arranging ? 'اسحب أي موظف وسيبه في المكان اللي عايزه على القوس — الترتيب بيتحفظ لكل المشرفين'
      : !S.pulse ? 'بيحمّل آخر 3 ساعات…'
      : past ? 'بتتفرج على ' + hm(at) + ' · اسحب الشريط أو دوس «رجوع للآن» · النقط الحمرا فائتة'
      : 'اسحب الشريط لورا عشان ترجع لأي دقيقة · الأحمر وقت ضايع · النقط الحمرا فائتة (اضغط عليها)';
    if (S.pulse) { const step = 100 / N(); handle.style.left = (S.back * step + step / 2).toFixed(3) + '%'; track.setAttribute('aria-valuemax', String(N() - 1)); track.setAttribute('aria-valuenow', String(S.back)); track.setAttribute('aria-valuetext', hm(at)); }
  }

  // The bars: one per minute, now on the left. Up: free people; down: customers waiting; red: waiting with nobody free.
  function drawBars() {
    const P = S.pulse; if (!P) return;
    const n = P.count, W = n * 10, ready = [], wait = [];
    for (let i = 0; i < n; i++) { ready.push(P.people.reduce((k, p) => k + (p.s[i] === 'r' ? 1 : 0), 0)); wait.push(P.queue[i] ? P.queue[i][0] : 0); }
    const maxR = Math.max(4, ...ready), maxW = Math.max(3, ...wait);
    bars.setAttribute('viewBox', '0 0 ' + W + ' 150'); bars.replaceChildren();
    for (let i = 0; i < n; i++) {
      const x = (n - 1 - i) * 10 + 2, lost = ready[i] === 0 && wait[i] > 0;
      const up = lost ? 70 : ready[i] / maxR * 70, down = wait[i] / maxW * 52;
      if (up > 0) bars.append(svg('rect', { x, y: 75 - up, width: 6, height: up, rx: 1, fill: lost ? '#ef444455' : '#22c55e' }));
      if (down > 0) bars.append(svg('rect', { x, y: 76, width: 6, height: down, rx: 1, fill: lost ? '#ef4444' : '#f97316' }));
    }
    marks.replaceChildren();
    const step = 100 / n;
    P.missed.forEach(m => {
      const i = Math.floor((Date.parse(m.at) - Date.parse(P.from)) / 60000); if (i < 0 || i >= n) return;
      const b = el('button', 'arc-mark'); b.type = 'button'; b.style.left = ((n - 1 - i) * step + step / 2).toFixed(3) + '%';
      b.setAttribute('aria-label', 'مكالمة فائتة ' + hm(m.at) + ' — اعرض التفاصيل');
      b.classList.toggle('on', S.picked === m.index);
      b.onclick = e => { e.stopPropagation(); if (S.picked !== m.index) { S.back = n - 1 - i; S.playing = false; draw(); } pick(m); };
      marks.append(b);
    });
    axis.replaceChildren(...['الآن', 'من ساعة', 'من ساعتين', hm(P.from)].map(t => el('span', '', t)));
  }

  // A missed call: who could have answered.
  async function pick(m) {
    if (S.picked === m.index) { S.picked = null; detail.hidden = true; drawBars(); return; }
    S.picked = m.index; drawBars();
    detail.hidden = false; detail.replaceChildren(el('span', 'muted', 'بيحمّل تفاصيل الفائتة…'));
    try {
      const c = await api('/api/missed?date=' + S.pulse.date + '&index=' + m.index);
      if (S.picked !== m.index) return;
      const free = c.employees.filter(e => e.readyDuringWait), at = s => c.employees.filter(e => e.atEntry === s).length;
      const close = el('button', 'ghost small', 'قفل'); close.type = 'button'; close.onclick = () => { S.picked = null; detail.hidden = true; drawBars(); };
      detail.replaceChildren(el('strong', 'bad', 'فائتة ' + hm(c.call.enteredAt || m.at)),
        el('span', '', (c.call.queueLabel || m.queue) + ' · ' + (c.call.phone || '') + ' · انتظر ' + short(c.call.waitSeconds || 0)),
        el('span', free.length ? 'warn' : 'good', free.length ? 'كان فاضي أثناء انتظاره: ' + free.map(e => first(e.name) + (e.extension ? ' (' + e.extension + ')' : '')).join('، ') : 'محدش كان فاضي طول انتظاره'),
        el('span', 'muted', 'وقت دخوله: فاضي ' + at('ready') + ' · مكالمة ' + at('on_call') + ' · بريك ' + at('break')), close);
    } catch (e) { detail.replaceChildren(el('span', 'bad', 'تعذر تحميل التفاصيل: ' + (e.message || e))); }
  }

  // ---------- interaction ----------
  arrangeBtn.onclick = () => { S.arranging = !S.arranging; S.drag = null; S.back = 0; S.playing = false; draw(); };
  resetBtn.onclick = () => saveOrder([]);
  const roomPoint = e => { const b = room.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * 100, y: (e.clientY - b.top) / b.height * 100 }; };
  room.addEventListener('pointermove', e => { if (!S.drag) return; Object.assign(S.drag, roomPoint(e)); draw(); });
  const drop = () => {
    const d = S.drag; if (!d) return; S.drag = null;
    if (d.x == null) return draw();
    let best = 0, bestD = Infinity;
    S.slots.forEach((sl, i) => { const dd = (sl.x - d.x) ** 2 + ((sl.y - d.y) * 0.6) ** 2; if (dd < bestD) { bestD = dd; best = i; } });
    const next = S.list.map(p => p.id).filter(x => x !== d.id); next.splice(best, 0, d.id);
    saveOrder([...next, ...S.order.filter(id => !next.includes(id))]);
  };
  room.addEventListener('pointerup', drop); room.addEventListener('pointercancel', drop);

  const scrubAt = e => { const b = track.getBoundingClientRect(); return Math.max(0, Math.min(N() - 1, Math.floor((e.clientX - b.left) / b.width * N()))); };
  track.addEventListener('pointerdown', e => { if (!S.pulse || S.arranging || e.target.closest('button')) return; S.scrubbing = true; S.playing = false; track.setPointerCapture?.(e.pointerId); S.back = scrubAt(e); draw(); });
  track.addEventListener('pointermove', e => { if (S.scrubbing) { S.back = scrubAt(e); draw(); } });
  track.addEventListener('pointerup', () => { S.scrubbing = false; });
  track.addEventListener('keydown', e => {
    if (!S.pulse) return;
    const d = { ArrowLeft: 1, ArrowRight: -1, PageDown: 10, PageUp: -10, Home: -1e6, End: 1e6 }[e.key]; if (d == null) return;
    e.preventDefault(); S.playing = false; S.back = Math.max(0, Math.min(N() - 1, S.back + d)); draw();
  });
  playBtn.onclick = () => { if (S.playing) S.playing = false; else { S.playing = true; S.arranging = false; if (!S.back) S.back = N() - 1; } draw(); };
  nowBtn.onclick = () => { S.back = 0; S.playing = false; draw(); };
  setInterval(() => { if (!S.playing) return; S.back = Math.max(0, S.back - 1); if (!S.back) S.playing = false; draw(); }, 110);

  return {
    root,
    // Called every second by the page with the latest /api/live data.
    update(live, now, qAge) {
      S.live = live; S.now = now; S.qAge = qAge; S.qFresh = !!live.queue && qAge != null && qAge < 30;
      loadPulse(false);
      if (!S.scrubbing && !S.drag) draw();
    },
  };
};
