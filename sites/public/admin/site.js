'use strict';
// مرصد الدهان — أوردرات الموقع: «تقرير أداء الموقع للفروع» (branches) and «تحويل أوردرات الموقع» (call center).
// The server reads the site every minute (/api/site/day); the reports follow the daily rules exactly, and the
// Excel buttons write the same files that go to the branches (one sheet per branch, at least 5 rows each).
window.MarsadSite = function MarsadSite(ctx) {
  const { api, h, $, table, kpi, pill, serverNow, state } = ctx;
  const MIN = 60000;
  const t12 = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const hhmm = v => new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
  const dmy = d => d.split('-').reverse().join('-');
  const mins = ms => Math.round(ms / MIN) + ' دقيقة';
  const minSec = ms => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), x = s % 60; return m ? m + ' دقيقة' + (x ? ' و' + x + ' ثانية' : '') : x + ' ثانية'; };
  const branchOf = o => o.branch || 'من غير فرع';

  let cache = null;
  async function load(force) {
    const day = state.day;
    if (!force && cache && cache.day === day && Date.now() - cache.at < 20000) return cache.value;
    const value = await api('/api/site/day?day=' + day);
    cache = { day, at: Date.now(), value };
    return value;
  }
  // The snapshot: now for the running day, the last read of the site for a past day.
  const snapOf = d => d.live ? serverNow() : (d.lastSync ? Date.parse(d.lastSync) : serverNow());

  // ---------- branch report rows ----------
  function branchRows(d) {
    const snap = snapOf(d), r = d.rules;
    return d.orders.filter(o => o.fulfillment === 'delivery' && !o.excluded).map(o => {
      const tr = o.transferAt && Date.parse(o.transferAt), out = o.outAt && Date.parse(o.outAt), del = o.deliveredAt && Date.parse(o.deliveredAt);
      const prepOngoing = !!tr && !out && !del, prep = out && tr ? out - tr : prepOngoing ? snap - tr : null;
      const delOngoing = !!out && !del && o.status === 'app-delivering', delivery = del && out ? del - out : delOngoing ? snap - out : null;
      const prepLate = prep != null && prep > r.prep * MIN, delLate = delivery != null && delivery > r.delivery * MIN;
      return { ...o, prep, prepOngoing, delivery, delOngoing, prepLate, delLate, fast: delivery != null && !delOngoing && delivery < 5 * MIN, late: prepLate || delLate, worst: Math.max(prep || 0, delivery || 0) };
    });
  }
  const prepText = x => x.prep == null ? '—' : x.prepOngoing ? 'لسه بيتجهز من ' + mins(x.prep) : mins(x.prep);
  const delText = x => x.delivery == null ? (x.outAt ? '—' : 'لم يخرج بعد') : x.delOngoing ? 'لسه مع الطيار من ' + mins(x.delivery) : x.fast ? minSec(x.delivery) + ' فقط ⚠' : mins(x.delivery);

  // ---------- call center rows ----------
  function transferRows(d) {
    const snap = snapOf(d), r = d.rules;
    return d.orders.filter(o => !o.excluded && !o.scheduled && o.receivedAt).map(o => {
      const rec = Date.parse(o.receivedAt), tr = o.transferAt && Date.parse(o.transferAt);
      const ongoing = !tr, wait = tr ? Math.max(0, tr - rec) : snap - rec;
      return { ...o, wait, ongoing, late: wait > r.transfer * MIN };
    });
  }
  const waitText = x => x.ongoing ? 'لسه مستني من ' + mins(x.wait) : x.late ? mins(x.wait) : minSec(x.wait);

  // Each branch: all its exceptions, topped up to 5 rows with its slowest on-time orders; by order number.
  function perBranch(rows, slow) {
    const by = new Map();
    for (const x of rows) { const b = branchOf(x); if (!by.has(b)) by.set(b, []); by.get(b).push(x); }
    return [...by].sort((a, b) => a[0].localeCompare(b[0], 'ar')).map(([b, list]) => {
      const late = list.filter(x => x.late), ok = list.filter(x => !x.late).sort((a, z) => slow(z) - slow(a));
      return [b, [...late, ...ok.slice(0, Math.max(0, 5 - late.length)).map(x => ({ ...x, filler: true }))].sort((a, z) => a.id - z.id)];
    });
  }

  // ---------- views ----------
  const note = (id, d) => { $(id).textContent = !d.linked ? 'الموقع مش متربط لسه: من «الإدارة» حط مفتاح WooCommerce.' : (d.live ? 'يوم ' + dmy(d.day) + ' لحد دلوقتي — الأرقام مش نهائية' : 'يوم ' + dmy(d.day)) + (d.lastSync ? ' · آخر قراءة من الموقع ' + t12(d.lastSync) : '') + (d.error ? ' · آخر محاولة فشلت: ' + d.error : '') + (state.day !== state.to ? ' · التقرير ده ليوم واحد: أول يوم في الفترة' : ''); };
  let lastBranch = null, lastTransfer = null;
  async function renderBranches(force) {
    const d = await load(force), rows = branchRows(d); lastBranch = d;
    note('siteBNote', d);
    const pick = fillPick('siteBPick', rows), only = $('siteBOnly').checked;
    const list = rows.filter(x => (!pick || branchOf(x) === pick) && (!only || x.late));
    const n = k => rows.filter(x => (!pick || branchOf(x) === pick) && x[k]).length;
    $('siteBCards').replaceChildren(kpi('أوردرات دليفري', rows.filter(x => !pick || branchOf(x) === pick).length, 'info'), kpi('تجهيز أكتر من 30 دقيقة', n('prepLate'), n('prepLate') ? 'bad' : 'good'),
      kpi('توصيل أكتر من 30 دقيقة', n('delLate'), n('delLate') ? 'bad' : 'good'), kpi('توصيل أقل من 5 دقايق', n('fast'), n('fast') ? 'warn' : '', 'تأكيد التسليم بعد الخروج على طول'),
      kpi('لسه بيتجهز', n('prepOngoing'), '', 'بعد التحويل للفرع'), kpi('لسه مع الطيار', n('delOngoing')));
    table('siteBTable', [{ title: 'الأوردر', get: x => x.id, show: x => '#' + x.id, type: 'number' }, { title: 'الفرع', get: x => branchOf(x) },
      { title: 'وقت استلام الفرع', get: x => x.transferAt, show: x => t12(x.transferAt), type: 'datetime' },
      { title: 'وقت التجهيز', get: x => x.prep, show: prepText, cls: x => x.prepLate ? 'bad' : '' }, { title: 'وقت التوصيل', get: x => x.delivery, show: delText, cls: x => x.delLate ? 'bad' : x.fast ? 'warn' : '' },
      { title: 'اسم الطيار', get: x => x.driver || '—' }], list.sort((a, b) => b.worst - a.worst), { empty: d.linked ? (only ? 'مفيش استثناءات' : 'مفيش أوردرات دليفري') : 'الموقع مش متربط لسه' });
  }
  async function renderTransfer(force) {
    const d = await load(force), rows = transferRows(d); lastTransfer = d;
    note('siteTNote', d);
    const pick = fillPick('siteTPick', rows), only = $('siteTOnly').checked;
    const all = rows.filter(x => !pick || branchOf(x) === pick), list = all.filter(x => !only || x.late);
    const late = all.filter(x => x.late), waits = all.filter(x => !x.ongoing).map(x => x.wait);
    $('siteTCards').replaceChildren(kpi('أوردرات الموقع', all.length, 'info', 'من غير المجدولة'), kpi('اتحوّلت بعد أكتر من 5 دقايق', late.filter(x => !x.ongoing).length, late.length ? 'bad' : 'good'),
      kpi('لسه ماتحوّلتش', all.filter(x => x.ongoing).length, all.some(x => x.ongoing && x.late) ? 'bad' : ''), kpi('متوسط مدة التحويل', waits.length ? minSec(waits.reduce((a, b) => a + b, 0) / waits.length) : '—'));
    table('siteTTable', [{ title: 'الأوردر', get: x => x.id, show: x => '#' + x.id, type: 'number' }, { title: 'وقت الاستلام', get: x => x.receivedAt, show: x => t12(x.receivedAt), type: 'datetime' },
      { title: 'وقت التحويل للفرع', get: x => x.transferAt, show: x => x.transferAt ? t12(x.transferAt) : 'لسه ماتحوّلش', type: 'datetime' },
      { title: 'مدة التحويل', get: x => x.wait, show: waitText, cls: x => x.late ? 'bad' : '' }, { title: 'الفرع', get: x => branchOf(x) }], list.sort((a, b) => b.wait - a.wait), { empty: d.linked ? (only ? 'مفيش استثناءات' : 'مفيش أوردرات') : 'الموقع مش متربط لسه' });
  }
  function fillPick(id, rows) {
    const sel = $(id), v = sel.value, names = [...new Set(rows.map(branchOf))].sort((a, b) => a.localeCompare(b, 'ar'));
    sel.replaceChildren(h('option', { value: '', textContent: 'كل الفروع' }), ...names.map(n => h('option', { value: n, textContent: n })));
    sel.value = names.includes(v) ? v : ''; return sel.value;
  }
  for (const id of ['siteBPick', 'siteBOnly']) $(id).onchange = () => renderBranches().catch(ctx.showError);
  for (const id of ['siteTPick', 'siteTOnly']) $(id).onchange = () => renderTransfer().catch(ctx.showError);

  // ---------- the Excel files sent to the branches ----------
  function exportBranches() {
    const d = lastBranch; if (!d) return;
    const until = hhmm(snapOf(d)), cols = [['الأوردر', 11], ['الفرع', 16], ['وقت استلام الفرع', 18], ['وقت التجهيز', 26], ['وقت التوصيل', 28], ['اسم الطيار', 32]].map(([title, width]) => ({ title, width }));
    window.MarsadXlsx.report('تقرير_أداء_الموقع_للفروع_' + d.day, perBranch(branchRows(d), x => x.worst).map(([b, list]) => ({ name: b,
      title: 'تقرير أداء الموقع للفروع — ' + b + ' — يوم ' + dmy(d.day) + (d.live ? ' (حتى الساعة ' + until + ')' : ''), columns: cols,
      rows: list.map(x => [{ v: '#' + x.id, fill: x.filler ? 'green' : undefined }, { v: branchOf(x) }, { v: x.transferAt ? t12(x.transferAt) : '—' },
        { v: prepText(x), fill: x.prepLate ? 'red' : undefined }, { v: delText(x), fill: x.delLate ? 'red' : x.fast ? 'yellow' : undefined }, { v: x.driver || '—' }]) })));
  }
  function exportTransfer() {
    const d = lastTransfer; if (!d) return;
    const until = hhmm(snapOf(d)), cols = [['الأوردر', 11], ['وقت الاستلام', 16], ['وقت التحويل للفرع', 20], ['مدة التحويل', 24], ['الفرع', 18]].map(([title, width]) => ({ title, width }));
    window.MarsadXlsx.report('تقرير_أداء_الكول_سنتر_' + d.day, perBranch(transferRows(d), x => x.wait).map(([b, list]) => ({ name: b,
      title: 'تقرير أداء الكول سنتر — تحويل الأوردرات لفرع ' + b + ' — يوم ' + dmy(d.day) + (d.live ? ' (حتى الساعة ' + until + ')' : ''), columns: cols,
      rows: list.map(x => [{ v: '#' + x.id }, { v: t12(x.receivedAt) }, { v: x.transferAt ? t12(x.transferAt) : 'لسه ماتحوّلش' }, { v: waitText(x), fill: x.late ? 'red' : 'green' }, { v: branchOf(x) }]) })));
  }
  function exportKind(kind) {
    if (kind === 'siteBranches') exportBranches(); else if (kind === 'siteTransfer') exportTransfer(); else return false;
    return true;
  }

  // ---------- طلبات: accept speed and who accepted (from the Live Orders screens) ----------
  let tal = null;
  const secs = v => v == null ? '—' : v < 60 ? v + ' ث' : Math.floor(v / 60) + ' د ' + (v % 60) + ' ث';
  async function renderTalabat() {
    const d = tal = await api('/api/talabat/day?day=' + state.day), now = serverNow();
    const o = d.orders, acc = o.filter(x => x.acceptSeconds != null), slow = acc.filter(x => x.acceptSeconds > 60);
    const waiting = o.filter(x => x.column === 'new' && !x.goneAt && !x.acceptedSeen);
    $('talNote').textContent = 'يوم ' + dmy(d.day) + ' · من شاشات Live Orders اللي عليها إضافة المرصد ومسجل عليها موظف. سرعة القبول من أول ما الأوردر ظهر في New لحد ما ظهر في Accepted.' + (state.day !== state.to ? ' · ليوم واحد: أول يوم في الفترة' : '');
    $('talCards').replaceChildren(kpi('أوردرات ظهرت', o.length, 'info'), kpi('متوسط القبول', acc.length ? secs(Math.round(acc.reduce((n, x) => n + x.acceptSeconds, 0) / acc.length)) : '—', acc.length ? (acc.reduce((n, x) => n + x.acceptSeconds, 0) / acc.length > 60 ? 'warn' : 'good') : ''),
      kpi('اتقبلت بعد أكتر من دقيقة', slow.length, slow.length ? 'warn' : 'good'), kpi('مستنية قبول دلوقتي', waiting.length, waiting.length ? 'bad' : 'good', waiting.length ? 'أقدم واحد من ' + secs(Math.round((now - Math.min(...waiting.map(x => Date.parse(x.newSeen || x.firstSeen)))) / 1000)) : ''));
    const by = new Map();
    for (const x of acc) { const k = x.acceptedBy || 'من غير موظف'; const y = by.get(k) || { name: k, n: 0, sum: 0, slow: 0, max: 0 }; y.n++; y.sum += x.acceptSeconds; y.max = Math.max(y.max, x.acceptSeconds); if (x.acceptSeconds > 60) y.slow++; by.set(k, y); }
    table('talStaff', [{ title: 'الموظف', get: x => x.name }, { title: 'قبل', get: x => x.n, type: 'number' }, { title: 'متوسط القبول', get: x => Math.round(x.sum / x.n), show: x => secs(Math.round(x.sum / x.n)), type: 'number' },
      { title: 'أبطأ قبول', get: x => x.max, show: x => secs(x.max), type: 'number' }, { title: 'بعد أكتر من دقيقة', get: x => x.slow, type: 'number', cls: x => x.slow ? 'warn' : '' }], [...by.values()].sort((a, b) => b.n - a.n), { empty: 'لسه محدش قبل أوردرات على شاشة عليها المرصد' });
    table('talOrders', [{ title: 'الأوردر', get: x => x.id }, { title: 'الكود', get: x => x.code ? '#' + x.code : '—' }, { title: 'الحساب', get: x => x.store || x.account || '—' },
      { title: 'ظهر', get: x => x.newSeen || x.firstSeen, show: x => t12(x.newSeen || x.firstSeen), type: 'datetime' }, { title: 'اتقبل', get: x => x.acceptedSeen, show: x => t12(x.acceptedSeen), type: 'datetime' },
      { title: 'وقت القبول', get: x => x.acceptSeconds, show: x => secs(x.acceptSeconds), type: 'number', cls: x => x.acceptSeconds > 60 ? 'warn' : '' }, { title: 'قبله', get: x => x.acceptedBy || '—' },
      { title: 'الحالة', get: x => x.goneAt ? 'خرج من الشاشة' : x.column, show: x => pill(x.goneAt ? 'خرج من الشاشة' : ({ new: 'مستني قبول', accepted: 'مقبول', ready: 'جاهز' })[x.column] || x.column, x.column === 'new' && !x.goneAt ? 'bad' : '') }],
      [...o].reverse(), { empty: 'مفيش أوردرات طلبات متسجلة لليوم ده' });
  }

  // ---------- الإدارة: the WooCommerce key ----------
  async function renderKey(isAdmin) {
    $('siteKeyPanel').hidden = !isAdmin;
    if (!isAdmin) return;
    const s = await api('/api/site');
    $('siteKeyStatus').replaceChildren(s.linked ? pill('متربط · المفتاح ينتهي بـ ' + s.keyEnd, 'ok') : pill('مش متربط', 'warn'), ' ',
      h('span', { className: s.error ? 'error' : 'muted', textContent: s.error ? 'آخر محاولة فشلت: ' + s.error : s.lastSync ? 'آخر قراءة ' + t12(s.lastSync) : '' }));
    $('siteSync').hidden = $('siteUnlink').hidden = !s.linked;
  }
  $('siteKeyForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    $('siteKeyNote').textContent = 'بجرب المفتاح على الموقع…';
    try { const r = await api('/api/site', { method: 'POST', body: { action: 'key', key: f.elements.key.value.trim(), secret: f.elements.secret.value.trim() } }); f.reset();
      $('siteKeyNote').textContent = 'اتربط. اتقرا ' + (r.sync?.orders ?? 0) + ' أوردر؛ الباقي هيكمل كل دقيقة.'; renderKey(true); }
    catch (x) { $('siteKeyNote').textContent = x.message; }
  };
  $('siteSync').onclick = async () => { try { const r = await api('/api/site', { method: 'POST', body: { action: 'sync' } }); $('siteKeyNote').textContent = r.sync?.error ? 'فشلت: ' + r.sync.error : 'اتقرا ' + (r.sync?.orders ?? 0) + ' أوردر اتغير.'; renderKey(true); } catch (x) { $('siteKeyNote').textContent = x.message; } };
  $('siteUnlink').onclick = async () => { if (!confirm('فك ربط الموقع؟ المرصد هيبطل يقرا الأوردرات الجديدة.')) return; try { await api('/api/site', { method: 'POST', body: { action: 'unlink' } }); renderKey(true); } catch (x) { $('siteKeyNote').textContent = x.message; } };

  return { renderBranches, renderTransfer, renderTalabat, exportKind, renderKey, branchRows, transferRows, perBranch };
};
