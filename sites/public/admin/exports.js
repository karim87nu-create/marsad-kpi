'use strict';
// مرصد الدهان — التقارير اليومية Excel (Karim 11-16: «تقارير يوميه عايزها كل يوم اعرف اسحبها اكسل لليوم الي قبله أو لو
// هحدد فتره»): the call center's own sheets, written from the Marsad for the chosen day or period — the call center
// report, the branches' sales, the orders by region and source, the cancellations, customer service, QA. Each in the
// shape the team sends today; every sheet right to left.
window.MarsadExports = function MarsadExports(ctx) {
  const { api, h, $, state, showError } = ctx;
  const X = () => window.MarsadXlsx;
  // The three branches, in the order of the sheets (Apex names), and the names the sheets use for them.
  const BRANCHES = [{ apex: /نصر/, name: 'مدينة نصر', region: 'مصر الجديدة ومدينة نصر', short: 'مدينه نصر' }, { apex: /تجمع/, name: 'التجمع', region: 'التجمع الخامس', short: 'التجمع' }, { apex: /مدين[تة][يى]/, name: 'مدينتي', region: 'مدينتي', short: 'مدينتي' }];
  const branchOf = n => BRANCHES.find(b => b.apex.test(String(n || ''))) || null;
  const WEEKDAY = d => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
  const dmy = d => d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4);
  // RLM keeps «من … إلى …» in order inside a right-to-left cell.
  const label = () => state.day === state.to ? dmy(state.day) : 'من \u200F' + dmy(state.day) + '\u200F إلى \u200F' + dmy(state.to);
  const fileLabel = () => state.day === state.to ? state.day : state.day + '_' + state.to;
  const sum = (l, f) => l.reduce((n, x) => n + (Number(f(x)) || 0), 0);
  const round = v => Math.round((Number(v) || 0) * 100) / 100;
  const days = async () => (await api('/api/reports/days?from=' + state.day + '&to=' + state.to, { timeout: 120000 })).days;
  const say = t => { $('expMsg').textContent = t; };
  const merge = (r1, c1, r2, c2) => X().col(c1) + r1 + ':' + X().col(c2) + r2;

  // ---------- 1. تقرير الكول سنتر ----------
  async function callCenter() {
    const list = await days();
    const c = k => sum(list, d => d.calls?.[k]), hot = sum(list, d => d.hotline);
    const calls = c('calls'), missed = c('abandoned'), ans = c('answered');
    const H = (v) => ({ v, s: 'head', b: true });
    const rows = [
      [{ v: 'Call center Report', s: 'title', b: true, big: true }, null, null, null, null, null],
      [{ v: label(), s: 'sub', b: true, big: true }, null, null, null, null, null],
      [H('نسبه الطلبات'), H('عدد الاوردرات المفعله'), H('عدد المكالمات المستلمه'), H('نسبه المكالمات الفائته'), H('عدد المكالمات الفائته (اكثر من 10ثواني)'), H('اجمالي المكالمات الوارده')],
      [{ v: ans ? hot / ans : null, t: 'pct', b: true }, { v: hot, b: true }, { v: ans, b: true }, { v: calls ? missed / calls : null, t: 'pct', b: true }, { v: missed, b: true }, { v: calls, b: true }],
      [H('"الطلبات المحتملة من المكالمات الفائتة"'), null, null, H('بعد اوقات العمل'), null, null],
      [{ v: c('orderQueueMissed'), b: true }, null, null, { v: c('afterHours'), b: true }, null, null]];
    const sheets = [{ name: 'التقرير', widths: [22, 18, 20, 18, 24, 22], heights: [40, 34, 44, 34, 40, 30], rows, merges: ['A1:F1', 'A2:F2', 'A5:C5', 'D5:F5', 'A6:C6', 'D6:F6'] }];
    if (list.length > 1) sheets.push({ name: 'كل يوم', widths: [14, 12, 14, 12, 14, 12, 12, 14, 14], freeze: 1, rows: [
      ['التاريخ', 'اجمالي المكالمات الوارده', 'عدد المكالمات الفائته', 'نسبه الفائته', 'عدد المكالمات المستلمه', 'عدد الاوردرات المفعله', 'نسبه الطلبات', 'الطلبات المحتملة من الفائتة', 'بعد اوقات العمل'].map(H),
      ...list.map(d => [{ v: d.day, t: 'date' }, d.calls?.calls ?? null, d.calls?.abandoned ?? null, { v: d.calls?.calls ? d.calls.abandoned / d.calls.calls : null, t: 'pct' }, d.calls?.answered ?? null, d.hotline,
        { v: d.calls?.answered ? d.hotline / d.calls.answered : null, t: 'pct' }, d.calls?.orderQueueMissed ?? null, d.calls?.afterHours ?? null])] });
    X().grid('تقرير الكول سنتر ' + fileLabel(), sheets);
    return list.some(d => !d.calls) ? 'فيه أيام سجل المكالمات بتاعها لسه مااتسحبش من أرابيكس' : '';
  }

  // ---------- 2. مبيعات الفروع (هوت لاين، طلبات، وفرها، لينك، موقعنا) ----------
  function salesBlocks(list) {
    return BRANCHES.map(b => {
      const s = list.flatMap(d => d.branches.filter(x => branchOf(x.name) === b).flatMap(x => x.sales));
      const pick = f => { const l = s.filter(f); return { amount: Math.round(sum(l, x => x.sales)), orders: sum(l, x => x.orders) }; };
      const off = list.flatMap(d => d.branches.filter(x => branchOf(x.name) === b));
      return { b,
        // Karim's sheet: the Hotline «كاش» is everything not Visa (the payment link included; «لينك» shows it again below).
        hotCash: pick(x => x.kind === 'Hotline' && x.pay !== 'Visa'), hotVisa: pick(x => x.kind === 'Hotline' && x.pay === 'Visa'), hot: pick(x => x.kind === 'Hotline'),
        talCash: pick(x => x.kind === 'طلبات' && x.pay === 'Cash'), talPaid: pick(x => x.kind === 'طلبات' && x.pay !== 'Cash'), tal: pick(x => x.kind === 'طلبات'),
        waf: pick(x => x.kind === 'وفرها'), link: pick(x => x.kind === 'Hotline' && x.pay === 'Ledge'),
        siteCash: pick(x => x.kind === 'الموقع' && x.pay === 'Cash'), sitePaid: pick(x => x.kind === 'الموقع' && x.pay !== 'Cash'), site: pick(x => x.kind === 'الموقع'),
        all: pick(() => true), offTal: sum(off, x => x.offers.talabat), offSite: sum(off, x => x.offers.site) };
    });
  }
  function salesSheet(list, title, sub) {
    const bl = salesBlocks(list), W = 9, rows = [], merges = [];
    const row = () => { const r = Array(W).fill(null); rows.push(r); return r; };
    const r1 = row(); r1[0] = { v: title, s: 'sub', b: true, big: true }; merges.push('A1:I1');
    const r2 = row(); r2[0] = { v: sub, s: 'sub', b: true, big: true }; merges.push('A2:I2');
    const r3 = row(); bl.forEach((x, i) => { r3[i * 3] = { v: 'فرع ' + x.b.name, s: 'yellow', b: true }; merges.push(merge(3, i * 3, 3, i * 3 + 2)); });
    const r4 = row(); bl.forEach((x, i) => { r4[i * 3] = { v: 'الهوت لاين', s: 'blue', b: true }; r4[i * 3 + 1] = { v: 'المبلغ', s: 'blue', b: true }; r4[i * 3 + 2] = { v: 'عدد الاوردرات', s: 'blue', b: true }; });
    const line = (lab, key, s) => { const r = row(); bl.forEach((x, i) => { r[i * 3] = { v: lab, s, b: true }; r[i * 3 + 1] = { v: x[key].amount, s, b: true }; r[i * 3 + 2] = { v: x[key].orders, s, b: true }; }); };
    line('كاش', 'hotCash', 'blue'); line('فيزا', 'hotVisa', 'blue'); line('الاجمالي', 'hot', 'blue');
    line('اطلب كاش', 'talCash', 'orange'); line('اطلب مدفوع', 'talPaid', 'orange'); line('اجمالي اطلب', 'tal', 'orange');
    const gap = row(); for (let i = 0; i < W; i++) gap[i] = { v: null, s: 'gray' };
    line('وفرها مدفوع', 'waf', 'lavender'); line('لينك', 'link', 'sub'); line('موقعنا كاش', 'siteCash', 'lavender'); line('موقعنا مدفوع', 'sitePaid', 'lavender'); line('اجمالي موقعنا', 'site', 'lavender');
    const gap2 = row(); for (let i = 0; i < W; i++) gap2[i] = { v: null, s: 'gray' };
    const h1 = rows.length + 1, ra = row(), rb = row();
    bl.forEach((x, i) => { ra[i * 3] = { v: 'الاجمالي', s: 'blue', b: true }; rb[i * 3] = { v: null, s: 'blue' }; merges.push(merge(h1, i * 3, h1 + 1, i * 3));
      ra[i * 3 + 1] = { v: 'المبلغ', s: 'blue', b: true }; ra[i * 3 + 2] = { v: 'عدد الاوردرات', s: 'blue', b: true }; rb[i * 3 + 1] = { v: x.all.amount, s: 'blue', b: true }; rb[i * 3 + 2] = { v: x.all.orders, s: 'blue', b: true }; });
    row();
    const ro = row(), rv = row(); ro[3] = { v: 'عدد عروض طلبات', s: 'gray', b: true }; ro[4] = { v: 'عدد عروض الموقع', s: 'gray', b: true };
    rv[3] = { v: sum(bl, x => x.offTal), s: 'gray', b: true }; rv[4] = { v: sum(bl, x => x.offSite), s: 'gray', b: true };
    row();
    const t1 = rows.length + 1, ta = row(), tb = row();
    ta[0] = { v: 'الاجمالي', s: 'gray', b: true, big: true }; tb[0] = { v: null, s: 'gray' }; merges.push(merge(t1, 0, t1 + 1, 1));
    ta[2] = { v: 'المبلغ', s: 'gray', b: true }; tb[2] = { v: sum(bl, x => x.all.amount), b: true }; merges.push(merge(t1, 2, t1, 3), merge(t1 + 1, 2, t1 + 1, 3));
    ta[4] = { v: 'عدد الاوردرات', s: 'gray', b: true }; tb[4] = { v: sum(bl, x => x.all.orders), b: true }; merges.push(merge(t1, 4, t1, 5), merge(t1 + 1, 4, t1 + 1, 5));
    ta[6] = { v: 'هوت لاين فقط', s: 'gray', b: true }; tb[6] = { v: sum(bl, x => x.hot.orders), b: true };
    ta[7] = { v: 'مبلغ الاوردرات الهوت لاين', s: 'gray', b: true }; tb[7] = { v: sum(bl, x => x.hot.amount), b: true }; merges.push(merge(t1, 7, t1, 8), merge(t1 + 1, 7, t1 + 1, 8));
    return { widths: Array(W).fill(14), rows, merges };
  }
  async function sales() {
    const list = await days();
    const one = list.length === 1, sheets = [{ name: one ? WEEKDAY(list[0].day) : 'إجمالي الفترة', ...salesSheet(list, one ? WEEKDAY(list[0].day) : 'إجمالي الفترة', label()) }];
    if (!one) for (const d of list) sheets.push({ name: d.day, ...salesSheet([d], WEEKDAY(d.day), dmy(d.day)) });
    X().grid('مبيعات الفروع ' + fileLabel(), sheets);
    return list.some(d => !d.linked) ? 'فيه أيام Apex بتاعها مش عند المرصد' : '';
  }

  // ---------- 3. الأوردرات حسب المنطقة ومصدر الطلب ----------
  const SOURCES = ['تليفون', 'واتساب', 'شات', 'أبليكيشن', 'ويب سايت'];
  async function bySource() {
    const list = await days(), H = v => ({ v, s: 'head', b: true });
    const cellsOf = d => BRANCHES.flatMap(b => {
      const x = d.branches.filter(y => branchOf(y.name) === b), k = n => sum(x, y => y.kinds?.[n]);
      // Karim's sheet: «تليفون» = the Hotline and Wafarha orders; the website split by the app / the website.
      const app = sum(x, y => y.site?.app), web = sum(x, y => (y.site?.web || 0) + (y.site?.other || 0)), siteAll = k('الموقع');
      return [k('Hotline') + k('وفرها'), null, null, app, Math.max(siteAll - app, web)];
    });
    const rows = [[{ v: 'متابعة أوردرات الدهان اليومية حسب المنطقة ومصدر الطلب', s: 'title', b: true, big: true }, ...Array(16).fill(null)],
      [H('التاريخ'), ...BRANCHES.flatMap(b => [H(b.region), null, null, null, null]), H('إجمالي اليوم')],
      [H(null), ...BRANCHES.flatMap(() => SOURCES.map(H)), H(null)]];
    const merges = ['A1:Q1', 'A2:A3', 'Q2:Q3', 'B2:F2', 'G2:K2', 'L2:P2'];
    list.forEach((d, i) => { const r = 4 + i; rows.push([{ v: d.day, t: 'date' }, ...cellsOf(d), { f: 'SUM(B' + r + ':P' + r + ')' }]); });
    const last = 3 + list.length, s0 = last + 2;
    rows.push([], [{ v: 'ملخص الفترة', s: 'sub', b: true }], [H('المنطقة'), ...SOURCES.map(H), H('الإجمالي')]);
    BRANCHES.forEach((b, i) => { const r = s0 + 2 + i, c0 = 1 + i * 5;
      rows.push([{ v: b.region, b: true }, ...SOURCES.map((_, j) => ({ f: 'SUM(' + X().col(c0 + j) + '4:' + X().col(c0 + j) + last + ')' })), { f: 'SUM(B' + r + ':F' + r + ')', b: true }]); });
    const tr = s0 + 5; rows.push([{ v: 'الإجمالي', s: 'sub', b: true }, ...[1, 2, 3, 4, 5, 6].map(j => ({ f: 'SUM(' + X().col(j) + (s0 + 2) + ':' + X().col(j) + (tr - 1) + ')', s: 'sub', b: true }))]);
    X().grid('الأوردرات حسب المنطقة والمصدر ' + fileLabel(), [{ name: 'المتابعة اليومية', widths: [12, ...Array(15).fill(10), 12], rows, merges, freeze: 3 }]);
    return 'واتساب وشات بيتكتبوا بإيد (Apex مش بيفرّقهم عن التليفون)' + (list.some(d => d.branches.some(b => b.site?.other)) ? '؛ أوردرات الموقع اللي قبل التحديث متحسبة «ويب سايت»' : '');
  }

  // ---------- 4. الإلغاءات ----------
  const PLATFORM = { Hotline: 'Hotline', 'طلبات': 'Talabat', 'الموقع': 'WEB', 'وفرها': 'وفرها' };
  const REASONS = ['رفض من المطعم', 'تأخر في التوصيل', 'خطأ في الطلب', 'المنتج غير متوفر', 'إلغاء العميل', 'مشكلة في الدفع', 'مشكلة تقنية', 'جوده', 'أخرى'];
  const reasonOf = t => { const s = String(t || ''); return /رفض|reject/i.test(s) ? REASONS[0] : /تأخ|تاخ|late|delay/i.test(s) ? REASONS[1] : /خطأ|خطا|غلط|wrong/i.test(s) ? REASONS[2] : /متوفر|نواقص|نفذ|unavailable|out of stock/i.test(s) ? REASONS[3]
    : /العميل|customer/i.test(s) ? REASONS[4] : /دفع|payment|فيزا/i.test(s) ? REASONS[5] : /تقن|system|سيستم/i.test(s) ? REASONS[6] : /جود|quality|بارد/i.test(s) ? REASONS[7] : REASONS[8]; };
  async function cancels() {
    const [list, own, cs] = await Promise.all([days(), api('/api/cancels/owners?from=' + state.day + '&to=' + state.to).catch(() => ({ list: [] })), api('/api/cs?from=' + state.day + '&to=' + state.to).catch(() => ({ entries: [], ratings: [] }))]);
    const owner = new Map((own.list || []).map(c => [String(c.apexNo || c.ref), c]));
    const H = v => ({ v, s: 'head', b: true });
    const det = list.flatMap(d => (d.cancels || []).map(c => { const o = owner.get(String(c.no)), f = o?.final || o?.owner;
      return { day: d.day, month: d.day.slice(0, 7), branch: branchOf(c.branch)?.short || c.branch, platform: PLATFORM[c.kind] || c.kind, area: c.area || '', reason: reasonOf(c.reason), raw: c.reason,
        mine: f ? (['employee', 'branch', 'pilot'].includes(f) ? 'نعم' : 'لا') : '', amount: c.amount }; }));
    const sheets = [];
    sheets.push({ name: 'تفاصيل الإلغاءات', widths: [12, 10, 12, 12, 18, 16, 14, 28, 12], freeze: 2, merges: ['A1:I1'], rows: [[{ v: 'الالغاءات ' + label(), s: 'title', b: true, big: true }],
      ['التاريخ', 'الشهر', 'الفرع', 'منصة الطلب', 'منطقة الطلب', 'سبب الإلغاء', 'محمّل على المطعم؟', 'ملاحظات', 'اجمالي الاوردر'].map(H),
      ...det.map(x => [{ v: x.day, t: 'date' }, x.month, x.branch, x.platform, x.area, x.reason, x.mine, x.raw, x.amount])] });
    // Orders by branch and platform (the website split by app / web where known).
    const plats = ['Talabat', 'WEB', 'APP', 'Hotline', 'وفرها'];
    const ordersOf = (b, p) => sum(list, d => sum(d.branches.filter(x => branchOf(x.name) === b), x => p === 'Talabat' ? x.kinds?.['طلبات'] : p === 'Hotline' ? x.kinds?.Hotline : p === 'وفرها' ? x.kinds?.['وفرها']
      : p === 'APP' ? x.site?.app : (x.kinds?.['الموقع'] || 0) - (x.site?.app || 0)));
    const ratio = [[{ v: 'اجمالي الالغاءات ' + label(), s: 'title', b: true, big: true }], ['الفرع', 'منصة الطلب', 'إجمالي الإلغاءات', 'اجمالي الاوردرات', 'نسبة الالغاءات'].map(H)];
    for (const p of plats) for (const b of BRANCHES) { const n = det.filter(x => x.branch === b.short && x.platform === (p === 'APP' ? 'APP' : p)).length, o = ordersOf(b, p); ratio.push([b.short, p, n, o, { v: o ? n / o : 0, t: 'pct' }]); }
    const allN = det.length, allO = sum(list, d => d.orders);
    ratio.push([{ v: 'الإجمالي', s: 'sub', b: true }, { v: null, s: 'sub' }, { v: allN, s: 'sub', b: true }, { v: allO, s: 'sub', b: true }, { v: allO ? allN / allO : 0, t: 'pct', s: 'sub', b: true }]);
    sheets.push({ name: 'نسبه الالغاءات', widths: [14, 12, 14, 14, 14], freeze: 2, merges: ['A1:E1'], rows: ratio });
    sheets.push({ name: 'تحليل الأسباب', widths: [20, 14, 16, 12], merges: ['A1:D1'], rows: [[{ v: 'أسباب الإلغاء ' + label(), s: 'title', b: true, big: true }], ['سبب الإلغاء', 'إجمالي التكرار', 'محمّل على المطعم', 'غير محمّل'].map(H),
      ...REASONS.map(r => [r, det.filter(x => x.reason === r).length, det.filter(x => x.reason === r && x.mine === 'نعم').length, det.filter(x => x.reason === r && x.mine === 'لا').length]),
      [{ v: 'الإجمالي', s: 'sub', b: true }, { v: det.length, s: 'sub', b: true }, { v: det.filter(x => x.mine === 'نعم').length, s: 'sub', b: true }, { v: det.filter(x => x.mine === 'لا').length, s: 'sub', b: true }]] });
    // Talabat: each branch's rating (entered in «خدمة العملاء») and closing time (the last closure of the day).
    const close = [['التاريخ', 'الفرع', 'التقييم', 'تقييم المنافس', 'وقت الغلق'].map(H)];
    for (const d of list) for (const b of BRANCHES) {
      const rt = (cs.ratings || []).find(r => r.day === d.day && branchOf(r.branch) === b);
      const at = Object.entries(d.closedAt || {}).filter(([n]) => branchOf(n) === b).map(([, v]) => v).sort().pop();
      const tm = at ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at)) : null;
      close.push([{ v: d.day, t: 'date' }, b.short, rt?.rating ?? null, rt?.competitor ?? null, tm ? { v: tm, t: 'time' } : null]);
    }
    sheets.push({ name: 'وقت غلق طلبات والتقييم', widths: [12, 12, 10, 12, 10], freeze: 1, rows: close });
    sheets.push(commentsSheet(cs.entries || []));
    X().grid('الإلغاءات ' + fileLabel(), sheets);
    return '';
  }
  const commentsSheet = entries => ({ name: 'الكومنتات والشكاوي', widths: [12, 10, 12, 14, 34, 24, 26, 14], freeze: 1,
    rows: [['التاريخ', 'المنصه', 'الفرع', 'اسم العميل', 'الملاحظات', 'الشكوي', 'حل الشكوي', 'هل تم الوصول للعميل؟'].map(v => ({ v, s: 'head', b: true })),
      ...entries.map(e => [{ v: e.day, t: 'date' }, e.platform, branchOf(e.branch)?.short || e.branch, e.customer, e.comment, e.complaint, e.action, e.reached])] });

  // ---------- 5. خدمة العملاء: التقييمات والشكاوى لكل منصة ----------
  async function customerService() {
    const cs = await api('/api/cs?from=' + state.day + '&to=' + state.to);
    const H = v => ({ v, s: 'head', b: true });
    const sheetOf = (name, list) => {
      const rows = [[H(null), H(5), H(4), H(3), H(2), H(1), H('الإجمالي'), H('نسبة اقل من 5'), H('سئ')]];
      BRANCHES.forEach((b, i) => { const r = 2 + i, l = list.filter(e => branchOf(e.branch) === b); rows.push([{ v: b.short, b: true }, ...[5, 4, 3, 2, 1].map(n => l.filter(e => e.rating === n).length),
        { f: 'SUM(B' + r + ':F' + r + ')' }, { f: 'IFERROR(SUM(C' + r + ':F' + r + ')/G' + r + ',0)', t: 'pct' }, { f: 'IFERROR(F' + r + '/G' + r + ',0)', t: 'pct' }]); });
      rows.push([], ['الفرع', 'الشكوى / تعليق العميل', 'التقييم', 'التاريخ', 'رقم الطلب', 'رقم العميل', 'هل تم الوصول للعميل؟', 'ما تم مع العميل / الإجراء'].map(H));
      for (const e of list) rows.push([branchOf(e.branch)?.short || e.branch, [e.complaint, e.comment].filter(Boolean).join(' — '), e.rating, { v: e.day, t: 'date' }, e.orderNo, e.phone, e.reached, e.action]);
      return { name, widths: [12, 44, 9, 12, 12, 14, 16, 30, 8], rows };
    };
    const by = p => cs.entries.filter(e => e.platform === p);
    X().grid('خدمة العملاء ' + fileLabel(), [sheetOf('طلبات', by('طلبات')), sheetOf('الموقع', by('الموقع')), sheetOf('الكول سنتر', [...by('الكول سنتر'), ...by('وفرها')]), commentsSheet(cs.entries)]);
    return cs.entries.length ? '' : 'مفيش ولا سطر متسجل في «خدمة العملاء» للفترة دي';
  }

  // ---------- 6. الجودة ----------
  async function quality() {
    const q = await api('/api/qa?from=' + state.day + '&to=' + state.to);
    const H = v => ({ v, s: 'head', b: true });
    const list = [...q.entries].sort((a, b) => a.day.localeCompare(b.day) || a.employee.localeCompare(b.employee, 'ar'));
    const sheets = [{ name: 'تقييم QA', widths: [12, 16, 14, 10, 10, ...q.form.map(() => 9), 10, 9, 12, 40], freeze: 2, merges: ['A1:U1'], rows: [
      [{ v: 'شيت تقييم QA - الكول سنتر ' + label(), s: 'title', b: true, big: true }],
      ['التاريخ', 'اسم الموظف', 'رقم المكالمة', 'وقت المكالمه', 'نوع المكالمة', ...q.form.map(f => f.label + ' ' + f.max), 'الإجمالي', 'النسبة', 'التقدير', 'ملاحظات المقيم'].map(H),
      ...list.map(e => [{ v: e.day, t: 'date' }, e.employee, e.phone, e.time ? { v: e.time, t: 'time' } : null, e.type, ...e.scores.map(v => v), e.total, { v: e.pct / 100, t: 'pct' }, { v: e.grade, s: e.pct >= 90 ? 'green' : e.pct >= 70 ? 'amber' : 'red' }, e.notes])] }];
    // «النسبه»: each employee's average for the period, highest first (Karim's daily picture), then by day.
    const names = [...new Set(list.map(e => e.employee))];
    const avg = l => l.length ? sum(l, e => e.pct) / l.length / 100 : null;
    const per = names.map(n => ({ n, v: avg(list.filter(e => e.employee === n)) })).sort((a, b) => b.v - a.v);
    sheets.push({ name: 'النسبه', widths: [20, 12], rows: [[H('التاريخ'), { v: label(), b: true }], [H(null), H('QA')], ...per.map(x => [x.n, { v: x.v, t: 'pct' }]), [{ v: 'Grand Total', s: 'sub', b: true }, { v: avg(list), t: 'pct', s: 'sub', b: true }]] });
    const dayList = [...new Set(list.map(e => e.day))];
    if (dayList.length > 1) sheets.push({ name: 'كل يوم', widths: [20, ...dayList.map(() => 11), 12], freeze: 1, rows: [[H('الموظف'), ...dayList.map(d => H(d.slice(5))), H('الفترة')],
      ...per.map(x => [x.n, ...dayList.map(d => { const v = avg(list.filter(e => e.employee === x.n && e.day === d)); return v == null ? null : { v, t: 'pct' }; }), { v: x.v, t: 'pct', b: true }])] });
    X().grid('الجودة ' + fileLabel(), sheets);
    return list.length ? '' : 'مفيش تقييمات جودة في الفترة دي';
  }

  const RUN = { callCenter, sales, bySource, cancels, customerService, quality };
  let opened = false;
  function render(setRange, today) {
    // The report of the day before by default (Karim: «لليوم الي قبله»), once per visit of the page.
    if (!opened && setRange && state.day === today && state.to === today) { opened = true; const y = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10); setRange(y, y); return; }
    opened = true;
    $('expPeriod').textContent = label();
    for (const b of document.querySelectorAll('[data-exp]')) b.onclick = async () => {
      const all = [...document.querySelectorAll('[data-exp]')]; all.forEach(x => { x.disabled = true; });
      say('جاري تجهيز «' + b.textContent + '»…');
      try { const note = await RUN[b.dataset.exp](); say('اتنزل «' + b.textContent + '» — ' + label() + (note ? ' · ' + note : '')); } catch (e) { say(''); showError(e); } finally { all.forEach(x => { x.disabled = false; }); }
    };
  }
  return { render, RUN, BRANCHES, branchOf };
};
