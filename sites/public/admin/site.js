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
  const R = () => ctx.review();
  // A late row answered «مش غلط» (or of a learned pattern) is no longer an exception.
  const stillLate = (x, d) => x.late && R().counts(R().items.siteLate(x, d.day));
  const stillLateT = (x, d) => x.late && R().counts(R().items.siteTransfer(x, d.day));
  async function renderBranches(force) {
    const [d] = await Promise.all([load(force), R().reviews()]), rows = branchRows(d); lastBranch = d;
    note('siteBNote', d);
    const pick = fillPick('siteBPick', rows), only = $('siteBOnly').checked;
    const list = rows.filter(x => (!pick || branchOf(x) === pick) && (!only || x.late));
    const n = k => rows.filter(x => (!pick || branchOf(x) === pick) && x[k] && (!['prepLate', 'delLate'].includes(k) || stillLate(x, d))).length;
    $('siteBCards').replaceChildren(kpi('أوردرات دليفري', rows.filter(x => !pick || branchOf(x) === pick).length, 'info'), kpi('تجهيز أكتر من 30 دقيقة', n('prepLate'), n('prepLate') ? 'bad' : 'good'),
      kpi('توصيل أكتر من 30 دقيقة', n('delLate'), n('delLate') ? 'bad' : 'good'), kpi('توصيل أقل من 5 دقايق', n('fast'), n('fast') ? 'warn' : '', 'تأكيد التسليم بعد الخروج على طول'),
      kpi('لسه بيتجهز', n('prepOngoing'), '', 'بعد التحويل للفرع'), kpi('لسه مع الطيار', n('delOngoing')));
    table('siteBTable', [{ title: 'الأوردر', get: x => x.id, show: x => '#' + x.id, type: 'number' }, { title: 'الفرع', get: x => branchOf(x) },
      { title: 'وقت استلام الفرع', get: x => x.transferAt, show: x => t12(x.transferAt), type: 'datetime' },
      { title: 'وقت التجهيز', get: x => x.prep, show: prepText, cls: x => x.prepLate ? 'bad' : '' }, { title: 'وقت التوصيل', get: x => x.delivery, show: delText, cls: x => x.delLate ? 'bad' : x.fast ? 'warn' : '' },
      { title: 'اسم الطيار', get: x => x.driver || '—' }, { title: 'ضربه على Apex', get: x => x.apex?.user || '—' },
      { title: 'المراجعة', get: x => x.late ? R().judge(R().items.siteLate(x, d.day)).status : '', show: x => x.late ? R().cell(R().items.siteLate(x, d.day)) : (x.transfers > 1 ? pill('اتحوّل بين ' + x.transfers + ' فروع', 'info') : '') }], list.sort((a, b) => b.worst - a.worst), { empty: d.linked ? (only ? 'مفيش استثناءات' : 'مفيش أوردرات دليفري') : 'الموقع مش متربط لسه' });
  }
  async function renderTransfer(force) {
    const [d] = await Promise.all([load(force), R().reviews()]), rows = transferRows(d); lastTransfer = d;
    note('siteTNote', d);
    const pick = fillPick('siteTPick', rows), only = $('siteTOnly').checked;
    const all = rows.filter(x => !pick || branchOf(x) === pick), list = all.filter(x => !only || x.late);
    const late = all.filter(x => stillLateT(x, d)), waits = all.filter(x => !x.ongoing).map(x => x.wait);
    $('siteTCards').replaceChildren(kpi('أوردرات الموقع', all.length, 'info', 'من غير المجدولة'), kpi('اتحوّلت بعد أكتر من 5 دقايق', late.filter(x => !x.ongoing).length, late.length ? 'bad' : 'good'),
      kpi('لسه ماتحوّلتش', all.filter(x => x.ongoing).length, all.some(x => x.ongoing && x.late) ? 'bad' : ''), kpi('متوسط مدة التحويل', waits.length ? minSec(waits.reduce((a, b) => a + b, 0) / waits.length) : '—'),
      ...(d.apex?.linked ? [kpi('اتربطت بأوردر Apex', all.filter(x => x.apex).length + ' من ' + all.length, all.some(x => !x.apex && !x.ongoing) ? 'warn' : 'good', 'ومنها اسم اللي ضربها'),
        kpi('على Apex من غير أوردر موقع', (d.apex.unmatched || []).length, (d.apex.unmatched || []).length ? 'warn' : '', 'متسجلة «الموقع» على Apex ومالقيناش لها أوردر')] : []));
    table('siteTApex', [{ title: 'أوردر Apex', get: x => x.sn ?? x.no, type: 'number' }, { title: 'الفرع', get: x => x.branch }, { title: 'اتضرب', get: x => x.at, show: x => t12(x.at), type: 'datetime' }, { title: 'ضربه', get: x => x.user || '—' }, { title: 'المبلغ', get: x => x.amount, type: 'number' }],
      (d.apex?.unmatched || []).filter(x => !pick || x.branch === pick), { empty: d.apex?.linked ? 'كل أوردرات الموقع على Apex ليها أوردر على الموقع' : 'بيظهر مع نسخة سكريبت الكاشير الجديدة' });
    table('siteTTable', [{ title: 'الأوردر', get: x => x.id, show: x => '#' + x.id, type: 'number' }, { title: 'وقت الاستلام', get: x => x.receivedAt, show: x => t12(x.receivedAt), type: 'datetime' },
      { title: 'وقت التحويل للفرع', get: x => x.transferAt, show: x => x.transferAt ? t12(x.transferAt) : 'لسه ماتحوّلش', type: 'datetime' },
      { title: 'مدة التحويل', get: x => x.wait, show: waitText, cls: x => x.late ? 'bad' : '' }, { title: 'الفرع', get: x => branchOf(x) },
      { title: 'اتضرب على Apex', get: x => x.apex?.at, show: x => siteLinkCell(x, d), type: 'datetime' }, { title: 'ضربه', get: x => x.apex?.user || '—' },
      { title: 'المراجعة', get: x => x.late ? R().judge(R().items.siteTransfer(x, d.day)).status : '', show: x => h('span', { className: 'inline' }, x.transfers > 1 ? pill('اتحوّل بين ' + x.transfers + ' فروع', 'info') : '', x.late ? R().cell(R().items.siteTransfer(x, d.day)) : '') }], list.sort((a, b) => b.wait - a.wait), { empty: d.linked ? (only ? 'مفيش استثناءات' : 'مفيش أوردرات') : 'الموقع مش متربط لسه' });
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
    if (kind === 'siteBranches') exportBranches(); else if (kind === 'siteTransfer') exportTransfer(); else if (kind === 'talabat') exportTalabat(); else return false;
    return true;
  }

  function matchingLabel(x) {
    const state = x.matching?.state;
    if (state === 'manual-none' || state === 'excluded') return 'مالوش Apex (يدوي)';
    if (state === 'manual-conflict') return 'تعارض في الربط اليدوي — راجع';
    if (state === 'tentative' || state === 'ambiguous') {
      const e = x.matching.candidates?.[0]?.evidence, why = [];
      if (e) {
        if (e.phone == null) why.push('رقم العميل ناقص'); else if (!e.phone) why.push('رقم العميل مختلف');
        if (e.nameConflict) why.push('الاسم مختلف');
        if (e.addressConflict) why.push('العنوان مختلف');
        if (e.items == null) why.push('الأصناف ناقصة'); else if (!e.items) why.push('الأصناف أو الكميات مختلفة');
        if (e.branch !== true) why.push(e.branch === false ? 'الفرع مختلف' : 'الفرع غير مؤكد');
        if (!e.withinTime) why.push('الوقت خارج نطاق المطابقة');
        if (e.money == null || e.money >= .08) why.push('القيمة غير متوافقة');
      }
      return (state === 'ambiguous' ? 'مطابقة ملتبسة' : 'مرشح غير مؤكد') +
        (x.matching.candidates?.length ? ' · ' + x.matching.candidates.map(a => '#' + (a.sn ?? 'إيصال غير متاح')).join(' / ') : '') +
        (why.length ? ' · ' + why.join('، ') : ' · محتاج تمييز بين المرشحين');
    }
    return 'لم تتأكد مطابقته';
  }
  function siteLinkCell(x, d) {
    const label = x.apex ? t12(x.apex.at) + ' · #' + (x.apex.sn ?? 'إيصال غير متاح') + (x.apex.how === 'manual' ? ' (يدوي)' : ' ✓') : matchingLabel(x);
    if (!ctx.canWrite() || !d.apex?.linked) return label;
    const options = [...new Map([...(d.apex.unmatched || []), ...d.orders.filter(z => z.apex && !z.apex.manual).map(z => z.apex)].map(a => [String(a.no), a])).values()];
    const sel = h('select', { ariaLabel: 'ربط أوردر الموقع بـ Apex' }, h('option', { value: '', textContent: label }),
      h('option', { value: '__clear', textContent: 'رجّع الربط التلقائي' }), h('option', { value: 'none', textContent: 'مالوش أوردر على Apex' }),
      ...options.map(a => h('option', { value: a.no, textContent: '#' + (a.sn ?? 'إيصال غير متاح') + ' · ' + (a.branch || '') + ' · ' + t12(a.at) + ' · ' + (a.amount ?? '') + ' ج' })));
    sel.onchange = async () => { if (!sel.value) return; try { await api('/api/site/link', { method: 'POST', body: { siteId: x.id, apexNo: sel.value === '__clear' ? null : sel.value } }); cache = null; await renderTransfer(true); } catch (e) { ctx.showError(e); } };
    return sel;
  }
  // ---------- طلبات: every order, its times on Talabat, and its Apex order (who entered it) ----------
  const OWNER = { Customer: 'العميل', Vendor: 'المطعم', Platform: 'طلبات', Transport: 'التوصيل', Rider: 'الطيار' };
  const STATUS = { NEW: 'جديد', ACCEPTED: 'مقبول', READY: 'جاهز', 'READY FOR PICKUP': 'جاهز', 'PICKED UP': 'خرج', COMPLETED: 'اتسلّم', DELIVERED: 'اتسلّم', CANCELLED: 'اتلغى', REJECTED: 'مرفوض' };
  const secs = v => v == null ? '—' : v < 60 ? v + ' ث' : Math.floor(v / 60) + ' د ' + (v % 60) + ' ث';
  let tal = null, talCache = null, talFlight = null;
  async function loadTalabat(force = false) {
    if (talFlight?.day === state.day) return talFlight.promise;
    if (!force && talCache?.day === state.day && Date.now() - talCache.at < 12000) return talCache.value;
    const day = state.day;
    const promise = api('/api/talabat/day?day=' + day).then(value => {
      talCache = { day, at: Date.now(), value };
      return value;
    }).finally(() => { if (talFlight?.promise === promise) talFlight = null; });
    talFlight = { day, promise };
    return promise;
  }
  const entryDelay = x => x.apex && x.acceptedAt ? Math.round((Date.parse(x.apex.at) - Date.parse(x.acceptedAt)) / 1000) : null;
  async function renderTalabat(force) {
    const requestedDay = state.day, d = await loadTalabat(force);
    if (requestedDay !== state.day) return;
    tal = d; const now = serverNow();
    $('talNote').textContent = !d.linked ? 'شاشة مراقبة طلبات مش متربطة لسه: من «الإدارة» ← «شاشة مراقبة طلبات».' : (d.stale ? 'شاشة المراقبة مش بتبعت من ' + (d.lastPush ? t12(d.lastPush) : '—') + ' — اتأكد إن الجهاز وفايرفوكس شغالين' : 'لايف من شاشة المراقبة · آخر قراءة ' + t12(d.lastPush)) + (d.apexLinked ? '' : ' · الربط مع Apex بيبدأ مع نسخة سكريبت الكاشير الجديدة') + (state.day !== state.to ? ' · ليوم واحد: أول يوم في الفترة' : '');
    const pick = $('talPick').value, o = d.orders.filter(x => !pick || x.store === pick);
    const names = [...new Set(d.orders.map(x => x.store).filter(Boolean))].sort(); const v = $('talPick').value;
    $('talPick').replaceChildren(h('option', { value: '', textContent: 'كل الفروع' }), ...names.map(n => h('option', { value: n, textContent: n }))); $('talPick').value = names.includes(v) ? v : '';
    const acc = o.filter(x => x.acceptSeconds != null), canc = o.filter(x => x.status === 'CANCELLED'), live = o.filter(x => !x.final && x.status !== 'PICKED UP');
    await R().reviews();
    const notIn = d.apexLinked ? o.filter(x => !x.apex && x.acceptedAt && x.status !== 'CANCELLED' && now - Date.parse(x.acceptedAt) > 10 * 60000 && R().counts(R().items.talabatNE(x, d.day))) : [];
    const delays = o.map(entryDelay).filter(x => x != null);
    $('talCards').replaceChildren(kpi('أوردرات طلبات', o.length, 'info', live.length ? live.length + ' لسه في الفرع' : ''), kpi('متوسط القبول', acc.length ? secs(Math.round(acc.reduce((n, x) => n + x.acceptSeconds, 0) / acc.length)) : '—'),
      kpi('من القبول للضرب على Apex', delays.length ? secs(Math.round(delays.reduce((n, x) => n + x, 0) / delays.length)) : '—', '', 'متوسط'),
      kpi('متربطة بالهاشتاج', o.filter(x => x.apex?.how === 'code').length + ' من ' + o.filter(x => x.apex).length, '', 'كل ربط مؤكد يعتمد على بيانات العميل والطلب؛ اليدوي اقتراح'),
      kpi('اتقبلت وماتضربتش', notIn.length, notIn.length ? 'bad' : 'good', 'أكتر من 10 دقايق'), kpi('اتلغت', canc.length, canc.length ? 'bad' : 'good', canc.filter(x => x.cancelOwner === 'Vendor').length + ' بسبب المطعم'));
    // Who entered Talabat orders on Apex, and how fast after acceptance.
    const by = new Map();
    for (const x of o) { if (!x.apex) continue; const k = x.apex.user || '—', y = by.get(k) || { name: k, n: 0, sum: 0, cnt: 0, slow: 0 }; y.n++; const e = entryDelay(x); if (e != null) { y.sum += e; y.cnt++; if (e > 300) y.slow++; } by.set(k, y); }
    table('talStaff', [{ title: 'الموظف (Apex)', get: x => x.name }, { title: 'ضرب', get: x => x.n, type: 'number' }, { title: 'متوسط من القبول للضرب', get: x => x.cnt ? Math.round(x.sum / x.cnt) : null, show: x => x.cnt ? secs(Math.round(x.sum / x.cnt)) : '—', type: 'number' },
      { title: 'بعد أكتر من 5 دقايق', get: x => x.slow, type: 'number', cls: x => x.slow ? 'warn' : '' }], [...by.values()].sort((a, b) => b.n - a.n), { empty: 'لسه مفيش أوردرات متربطة بـ Apex' });
    const linkCell = x => {
      if (!d.apexLinked) return '—';
      const label = x.apex ? '#' + (x.apex.sn ?? 'إيصال غير متاح') + ' · ' + t12(x.apex.at) + ({ code: ' ✓ بمرجع المصدر', manual: ' (يدوي)', time: ' ≈ بالوقت', evidence: ' ✓ بالأدلة' })[x.apex.how] : matchingLabel(x);
      if (!ctx.canWrite()) return label;
      const sel = h('select', { ariaLabel: 'أوردر Apex' }, h('option', { value: '', textContent: label }),
        ...((x.apex || (x.matching?.how === 'manual' || x.matching?.state?.startsWith('manual'))) ? [h('option', { value: '__clear', textContent: 'رجّع الربط التلقائي' })] : []), h('option', { value: 'none', textContent: 'مالوش أوردر على Apex' }),
      );
      let choicesLoaded = false;
      const loadChoices = () => {
        if (choicesLoaded) return;
        choicesLoaded = true;
        sel.append(...[...new Map([...d.unmatchedApex, ...d.orders.filter(z => z.apex && !z.apex.manual).map(z => z.apex)].map(a => [String(a.no), a])).values()].filter(a => !x.store || !a.branch || x.store.includes(a.branch) || a.branch.includes((x.store.split(/[،,\-]/)[1] || '').trim().split(' ')[0])).map(a => h('option', { value: a.no, textContent: '#' + (a.sn ?? 'إيصال غير متاح') + ' · ' + t12(a.at) + ' · ' + (a.user || '') + ' · ' + (a.amount ?? '') + ' ج' })));
      };
      sel.onfocus = loadChoices; sel.onpointerdown = loadChoices;
      sel.onchange = async () => { try { await api('/api/talabat/link', { method: 'POST', body: { talabatId: x.id, apexNo: sel.value === '__clear' ? null : sel.value } }); renderTalabat(true); } catch (e) { ctx.showError(e); } };
      return sel;
    };
    table('talOrders', [{ title: 'رقم أوردر طلبات', get: x => x.id }, { title: 'هاشتاج طلبات', get: x => x.code || '—', show: x => x.code ? '#' + x.code : '—' }, { title: 'الفرع', get: x => x.store || '—' }, { title: 'وصل', get: x => x.receivedAt || x.placedAt, show: x => t12(x.receivedAt || x.placedAt), type: 'datetime' },
      { title: 'القبول', get: x => x.acceptSeconds, show: x => secs(x.acceptSeconds), type: 'number', cls: x => x.acceptSeconds > 60 ? 'warn' : '' },
      { title: 'على Apex', get: x => x.apex?.at, show: x => !x.apex && d.apexLinked && x.acceptedAt && x.status !== 'CANCELLED' ? h('span', { className: 'inline' }, linkCell(x), R().cell(R().items.talabatNE(x, d.day))) : linkCell(x) }, { title: 'ضربه', get: x => x.apex?.user || '—' }, { title: 'من القبول للضرب', get: entryDelay, show: x => secs(entryDelay(x)), type: 'number', cls: x => entryDelay(x) > 300 ? 'warn' : '' },
      { title: 'خرج', get: x => x.pickedUpAt, show: x => t12(x.pickedUpAt), type: 'datetime' }, { title: 'الحالة', get: x => x.status, show: x => pill(STATUS[x.status] || x.status || '—', x.status === 'CANCELLED' ? 'bad' : x.final ? 'ok' : 'warn') },
      { title: 'الأصناف', get: x => x.items.reduce((n, i) => n + i.qty, 0), show: x => itemsText(x) || '—', cls: () => 'wrap' },
      { title: 'مطابقة الأصناف مع Apex', get: x => x.apex?.items ? (x.apex.items.ok ? 'مطابقة' : 'مختلفة') : '', show: itemsCell }, { title: 'الإجمالي', get: x => x.subtotal ?? x.total, type: 'number' }],
      [...o].reverse(), { pageSize: 50, empty: d.linked ? 'مفيش أوردرات طلبات لليوم ده' : 'شاشة مراقبة طلبات مش متربطة لسه' });
    renderTalabatCancels(d, 'talCancels', pick);
  }
  // The dishes in English with what they are on Apex in Arabic (from the comparison), and whether Apex matches.
  function itemsText(x) {
    const ar = new Map((x.apex?.items?.pairs || []).map(p => [p.talabat, p.apex]));
    return x.items.map(i => i.qty + '× ' + i.name + (ar.get(i.name) ? ' (' + ar.get(i.name) + ')' : '') +
      (i.modifiers?.length ? ' [إضافات: ' + i.modifiers.join('، ') + ']' : i.modifierRead !== true ? ' [الإضافات غير مقروءة]' : '') +
      (i.modifierComplete === true ? '' : ' [قد توجد إضافات أخرى]')).join('، ');
  }
  function itemsCell(x) {
    const c = x.apex?.items;
    if (!c) return x.apex ? h('span', { className: 'muted', textContent: '—' }) : '';
    if (c.ok) return pill('✓ مطابقة', 'ok');
    const label = c.reviewedOk ? 'اتراجعت: مش غلط' : c.modifierUncertain ? 'مراجعة الإضافات' : c.uncertain ? 'مراجعة' : 'صنف مختلف';
    const box = h('span', { className: 'inline' }, pill(label, c.reviewedOk ? '' : c.uncertain ? 'warn' : 'bad'),
      h('small', { className: 'muted', textContent: [c.missingOnApex.length ? 'على طلبات بس: ' + c.missingOnApex.join('، ') : '', c.extraOnApex.length ? 'على Apex بس: ' + c.extraOnApex.join('، ') : ''].filter(Boolean).join(' · ') }));
    if (R().cell) box.append(R().cell(R().items.talabatItems(x, tal?.day || state.day)));
    return box;
  }
  // Talabat cancellations: time, who it is on, the reason (also shown in the branches' الإلغاءات).
  function renderTalabatCancels(d, id, pick) {
    table(id, [{ title: 'الأوردر', get: x => x.id }, { title: 'الفرع', get: x => x.store || '—' }, { title: 'وصل', get: x => x.receivedAt || x.placedAt, show: x => t12(x.receivedAt || x.placedAt), type: 'datetime' },
      { title: 'اتلغى', get: x => x.cancelledAt, show: x => t12(x.cancelledAt), type: 'datetime' }, { title: 'على مين', get: x => OWNER[x.cancelOwner] || x.cancelOwner || '—', show: x => pill(OWNER[x.cancelOwner] || x.cancelOwner || '—', x.cancelOwner === 'Vendor' ? 'bad' : '') },
      { title: 'اكتمال التفاصيل', get: x => x.cancellationReadiness === 'FAILED' ? 'تعذّر استكمال التفاصيل — راجع المصدر' : x.cancellationReadiness === 'PENDING' ? 'مستني تفاصيل الإلغاء' : 'مكتملة' },
      { title: 'السبب', get: x => x.cancelReason || '—', cls: () => 'wrap' }, { title: 'كان خرج', get: x => x.pickedUpAt ? 'أيوه' : 'لأ' }, { title: 'على Apex', get: x => x.apex ? '#' + (x.apex.sn ?? 'إيصال غير متاح') + ' · ' + (x.apex.user || '') : '—' },
      { title: 'الأصناف', get: x => itemsText(x) || '—', cls: () => 'wrap' }, { title: 'مطابقة الأصناف', get: x => x.apex?.items ? (x.apex.items.ok ? 'مطابقة' : 'مختلفة') : '', show: itemsCell }, { title: 'المبلغ', get: x => x.subtotal ?? x.total, type: 'number' }],
      d.orders.filter(x => x.status === 'CANCELLED' && (!pick || x.store === pick)).reverse(), { pageSize: 50, empty: 'مفيش إلغاءات على طلبات' });
  }
  async function renderBranchTalabatCancels() {
    try { const d = await api('/api/talabat/day?day=' + state.day); $('cancelTalabatPanel').hidden = !d.linked; if (d.linked) renderTalabatCancels(d, 'cancelTalabat'); } catch { $('cancelTalabatPanel').hidden = true; }
  }
  $('talPick').onchange = () => renderTalabat().catch(ctx.showError);
  function exportTalabat() {
    if (!tal) return;
    ctx.exportRows('أوردرات-طلبات', [{ title: 'الأوردر', get: x => x.id }, { title: 'الفرع', get: x => x.store }, { title: 'وصل', get: x => x.receivedAt || x.placedAt, type: 'datetime' }, { title: 'القبول (ث)', get: x => x.acceptSeconds, type: 'number' },
      { title: 'اتقبل', get: x => x.acceptedAt, type: 'datetime' }, { title: 'أوردر Apex', get: x => x.apex?.sn ?? x.apex?.no }, { title: 'اتضرب على Apex', get: x => x.apex?.at, type: 'datetime' }, { title: 'ضربه', get: x => x.apex?.user },
      { title: 'من القبول للضرب (ث)', get: entryDelay, type: 'number' }, { title: 'خرج', get: x => x.pickedUpAt, type: 'datetime' }, { title: 'اتسلّم', get: x => x.deliveredAt, type: 'datetime' }, { title: 'الحالة', get: x => STATUS[x.status] || x.status },
      { title: 'اتلغى', get: x => x.cancelledAt, type: 'datetime' }, { title: 'الإلغاء على', get: x => OWNER[x.cancelOwner] || x.cancelOwner }, { title: 'السبب', get: x => x.cancelReason },
      { title: 'الأصناف', get: x => itemsText(x) }, { title: 'مطابقة الأصناف', get: x => x.apex?.items ? (x.apex.items.ok ? 'مطابقة' : 'مختلفة: ' + [...x.apex.items.missingOnApex, ...x.apex.items.extraOnApex].join('، ')) : '' },
      { title: 'الإجمالي', get: x => x.subtotal ?? x.total, type: 'number' }, { title: 'نوع التوصيل', get: x => x.deliveryType }], tal.orders);
  }

  // ---------- الإدارة: شاشة مراقبة طلبات ----------
  async function renderTalabatKey(isAdmin) {
    $('talKeyPanel').hidden = !isAdmin;
    if (!isAdmin) return;
    const k = await api('/api/talabat/token');
    $('talLink').hidden = false;
    {
      const ext = await ctx.extensionCall({ type: 'TALABAT_STATUS' }, 1500);
      $('talKeyStatus').replaceChildren(k.lastPush ? h('span', { className: k.ageSeconds < 120 ? 'ok' : 'error', textContent: 'آخر قراءة من شاشة المراقبة ' + t12(k.lastPush) + (k.ageSeconds < 120 ? ' — شغالة' : ' — واقفة') }) : h('span', { className: 'muted', textContent: 'لسه مفيش جهاز متربط' }),
        ' · ', h('span', { className: 'muted', textContent: ext ? (ext.linked ? 'الجهاز ده هو شاشة المراقبة' : 'الإضافة موجودة على الجهاز ده (نسخة ' + ext.version + ')') : 'الإضافة مش على الجهاز ده (أو نسخة قديمة)' }));
    }
  }
  $('talLink').onclick = async () => {
    $('talKeyNote').textContent = 'جارٍ الربط…';
    if (!await ctx.extensionCall({ type: 'TALABAT_STATUS' }, 2000)) { $('talKeyNote').textContent = 'إضافة المرصد (3.1.0 أو أحدث) مش على الجهاز ده.'; return; }
    try {
      const { token } = await api('/api/talabat/token', { method: 'POST' });
      const r = await ctx.extensionCall({ type: 'LINK_TALABAT', token });
      $('talKeyNote').textContent = r?.ok ? 'اتربط. افتح في فايرفوكس partner-app.talabat.com بحساب الكول سنتر، والشاشة هتشتغل لوحدها. أي جهاز تاني كان متربط وقف.' : 'الإضافة رفضت الربط: ' + (r?.error || 'بدون رد');
      renderTalabatKey(true);
    } catch (e) { $('talKeyNote').textContent = e.message; }
  };

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

  // ---------- الإدارة: WhatsApp for Talabat customers (WhatsApp Web on the Talabat monitor PC) ----------
  async function renderWhatsApp(isAdmin) {
    $('waPanel').hidden = !isAdmin;
    if (!isAdmin) return;
    const s = await api('/api/whatsapp'), f = $('waWebForm');
    $('waStatus').replaceChildren(s.enabled ? pill('الإرسال شغال', 'ok') : pill('الإرسال واقف', 'warn'), ' ',
      h('span', { className: 'muted', textContent: 'النهارده: ' + s.today.orders + ' أوردر برقم · اتبعت ترحيب ' + s.today.welcome + ' · استطلاع ' + s.today.survey + ' · جاهز للإرسال ' + s.today.ready + ' · أرقام محفوظة للترحيب أو الاستطلاع ' + s.today.waiting + (s.unconfirmed ? ' · إرسال غير مؤكد يحتاج مراجعة: ' + s.unconfirmed : '') + (s.lastWeb ? ' · آخر رسالة ' + t12(s.lastWeb) : '') }));
    if (document.activeElement?.form !== f) { f.elements.welcomeText.value = s.welcomeText || ''; f.elements.surveyText.value = s.surveyText || ''; f.elements.delay.value = s.delay || 75; }
    $('waOn').hidden = s.enabled || !s.welcomeText; $('waOff').hidden = !s.enabled;
    $('waErrors').replaceChildren(...(s.errors.length ? [h('h3', { textContent: 'اللي ماتبعتش النهارده' }), ...s.errors.map(e => {
      const row=h('p',{className:'muted',textContent:t12(e.at)+' · أوردر '+e.order+' · '+(e.error==='delivery_unconfirmed'?'إرسال الرسالة غير مؤكد':e.error)});
      if(e.canConfirm){const button=h('button',{type:'button',textContent:'راجعتها على واتساب: اتبعتت'});button.onclick=async()=>{
        if(!confirm('تأكيد إن رسالة '+(e.kind==='survey'?'المتابعة':'الترحيب')+' للأوردر '+e.order+' ظاهرة في محادثته على واتساب؟ لن يُعاد إرسالها.'))return;
        button.disabled=true;await waDo({action:'confirm_sent',id:e.id,kind:e.kind},r=>r.surveyAvailable?'اتسجل الإرسال؛ المتابعة هتدخل الطابور عند موعدها.':'اتسجل الإرسال.');button.disabled=false;
      };row.append(' ',button);}return row;
    })] : []));
  }
  const waDo = async (body, ok) => { try { const r = await api('/api/whatsapp', { method: 'POST', body }); $('waNote').textContent = ok(r); renderWhatsApp(true); } catch (x) { $('waNote').textContent = x.message; } };
  $('waWebForm').onsubmit = e => { e.preventDefault(); const f = e.target;
    waDo({ action: 'web', welcomeText: f.elements.welcomeText.value, surveyText: f.elements.surveyText.value, delay: Number(f.elements.delay.value) }, () => 'اتحفظت. دوس «شغّل الإرسال» لما تكون جاهز.'); };
  $('waOn').onclick = () => waDo({ action: 'enable', on: true }, () => 'الإرسال اشتغل. على جهاز شاشة طلبات هيتفتح تاب واتساب ويب: امسح الكود من موبايل المطعم مرة واحدة.');
  $('waOff').onclick = () => waDo({ action: 'enable', on: false }, () => 'الإرسال وقف، والأرقام اللي كانت مستنية اتمسحت.');

  // ---------- الإدارة: كاتب Apex (التحويل الآلي) ----------
  const APX = { off: 'متوقف', shadow: 'معاينة بس', test: 'تجربة على قاعدة الاختبار', live: 'شغال على Apex' };
  const APX_STATE = { auto_pending: 'مستني', auto_sending: 'بيتكتب', auto_done: 'اتكتب', auto_failed: 'ماتمش', auto_preview: 'معاينة' };
  // ---------- الإدارة: شاشة طلبات — وقت التوصيل والقبول و«في الطريق» لكل فرع ----------
  async function renderTalabatActions() {
    $('talActPanel').hidden = false;
    const c = await api('/api/talabat/actions-config');
    $('talActRows').replaceChildren(...c.branches.map(b => h('div', { className: 'row', dataset: { store: b.store } },
      h('strong', { textContent: b.store }),
      h('label', {}, 'وقت التوصيل (دقيقة) ', h('input', { type: 'number', min: 5, max: 180, step: 5, value: b.minutes ?? '', className: 'talMin', style: 'width:80px' })),
      h('label', {}, h('input', { type: 'checkbox', checked: b.accept, className: 'talAccept' }), ' قبول آلي'),
      h('label', {}, h('input', { type: 'checkbox', checked: b.onTheWay, className: 'talOut' }), ' «في الطريق» لما يخرج مع الطيار'))));
    $('talActNote').textContent = c.acceptReady ? '' : 'القبول الآلي لسه بيتجهز: الشاشة بتسجل شكل شباك الأوردر الجديد الأول، ولحد ما يخلص مش هتقبل أوردرات. وقت التوصيل بيتحفظ دلوقتي.';
    $('talActLog').replaceChildren(...c.log.map(l => h('div', { textContent: t12(new Date(l.at).toISOString()) + ' — ' + (l.action === 'onTheWay' ? 'في الطريق' : l.action === 'accept' ? 'قبول' : l.action) + ' — ' + l.id + ' — ' + (l.ok ? '✓ ' : '✗ ') + l.note })));
  }
  $('talActSave').onclick = async () => {
    const branches = {};
    document.querySelectorAll('#talActRows [data-store]').forEach(r => { branches[r.dataset.store] = { minutes: Number(r.querySelector('.talMin').value) || null, accept: r.querySelector('.talAccept').checked, onTheWay: r.querySelector('.talOut').checked }; });
    try { await api('/api/talabat/actions-config', { method: 'POST', body: { branches } }); $('talActNote').textContent = 'اتحفظ.'; renderTalabatActions(); }
    catch (e) { $('talActNote').textContent = e.message; }
  };
  // ---------- الإدارة: إيقاف أصناف على طلبات لكل فرع ----------
  let stock = null; const stockSel = {};
  function drawStock() {
    const store = $('stockStore').value, q = $('stockFind').value.trim().toLowerCase(), only = $('stockOnly').checked;
    const sel = stockSel[store] || (stockSel[store] = new Set(stock.stopped[store] || []));
    const cats = new Map();
    for (const p of stock.products) { if ((q && !(p.name + ' ' + p.category).toLowerCase().includes(q)) || (only && !sel.has(p.id))) continue; if (!cats.has(p.category)) cats.set(p.category, []); cats.get(p.category).push(p); }
    $('stockList').replaceChildren(...[...cats].map(([c, ps]) => h('div', {}, h('strong', { textContent: c }),
      ...ps.map(p => h('label', { style: 'display:block' }, h('input', { type: 'checkbox', checked: sel.has(p.id), onchange: e => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); } }), ' ' + p.name)))));
    const a = stock.applied[store];
    $('stockNote').textContent = (sel.size ? sel.size + ' صنف موقوف في الفرع ده. ' : '') + (a ? 'آخر تطبيق على طلبات: ' + t12(new Date(a.at).toISOString()) + (a.ok ? ' ✓' : ' ✗ ' + a.note) : (stock.ready ? '' : 'الإيقاف بيتحفظ دلوقتي، والشاشة هتطبقه أول ما تتجهز.'));
  }
  async function renderStock() {
    $('stockPanel').hidden = false;
    stock = await api('/api/talabat/stock-config');
    const cur = $('stockStore').value;
    $('stockStore').replaceChildren(...stock.stores.map(s => h('option', { value: s, textContent: s, selected: s === cur })));
    drawStock();
  }
  $('stockStore').onchange = drawStock; $('stockFind').oninput = drawStock; $('stockOnly').onchange = drawStock;
  $('stockSave').onclick = async () => {
    const store = $('stockStore').value; if (!store) return;
    try { await api('/api/talabat/stock-config', { method: 'POST', body: { store, stopped: [...(stockSel[store] || [])] } }); delete stockSel[store]; await renderStock(); $('stockNote').textContent = 'اتحفظ للفرع ' + store + '. ' + $('stockNote').textContent; }
    catch (e) { $('stockNote').textContent = e.message; }
  };
  async function renderApexWriter(isAdmin) {
    $('apexWriterPanel').hidden = !isAdmin; $('talActPanel').hidden = !isAdmin; $('stockPanel').hidden = !isAdmin;
    if (!isAdmin) return;
    renderTalabatActions().catch(e => { $('talActNote').textContent = e.message; });
    renderStock().catch(e => { $('stockNote').textContent = e.message; });
    const s = await api('/api/apex-writer');
    const seen = s.lastSeen ? (Date.now() - s.lastSeen < 120000 ? 'الكاتب شغال (آخر سؤال ' + t12(new Date(s.lastSeen).toISOString()) + ')' : 'الكاتب واقف (آخر سؤال ' + t12(new Date(s.lastSeen).toISOString()) + ')') : (s.linked ? 'الكاتب لسه ماشتغلش' : 'مفيش مفتاح للكاتب');
    $('apexWriterStatus').replaceChildren(pill('الوضع: ' + APX[s.mode], s.mode === 'live' ? 'ok' : 'warn'), ' ', h('span', { className: 'muted', textContent: seen }),
      ...s.jobs.slice(0, 8).map(j => h('div', { className: 'muted', textContent: (j.source === 'talabat' ? 'طلبات ' : 'الموقع ') + j.ref + ' — ' + (APX_STATE[j.state] || j.state) + ' — ' + (j.by || '') +
        (j.result ? ' — ' + [j.result.orderNo && ('Apex ' + j.result.orderNo), j.result.total && ('إجمالي ' + j.result.total), j.result.error, j.result.detail].filter(Boolean).join(' · ') : '') })));
  }
  document.querySelectorAll('[data-apx-mode]').forEach(b => b.onclick = async () => {
    const mode = b.dataset.apxMode;
    if (mode === 'live' && !confirm('التشغيل هيكتب أوردرات حقيقية على Apex. اتأكدت من المعاينة والتجربة؟')) return;
    try { await api('/api/apex-writer', { method: 'POST', body: { action: 'mode', mode, confirm: mode === 'live' ? 'LIVE' : undefined } }); $('apexWriterNote').textContent = 'الوضع بقى: ' + APX[mode]; renderApexWriter(true); }
    catch (e) { $('apexWriterNote').textContent = e.message; }
  });
  $('apexWriterKey').onclick = async () => {
    if (!confirm('مفتاح جديد هيوقف القديم. تكمل؟')) return;
    try { const { token } = await api('/api/apex-writer', { method: 'POST', body: { action: 'token' } }); $('apexWriterToken').textContent = token; $('apexWriterNote').textContent = 'انسخ المفتاح والصقه في Setup-ApexWriter على جهاز الكاشير. بيظهر مرة واحدة.'; }
    catch (e) { $('apexWriterNote').textContent = e.message; }
  };

  return { renderBranches, renderTransfer, renderTalabat, renderBranchTalabatCancels, renderTalabatKey, exportKind, renderKey, renderWhatsApp, renderApexWriter, branchRows, transferRows, perBranch };
};

