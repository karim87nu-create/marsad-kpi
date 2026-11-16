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

  // Karim 11-16 «لازم الشيتات تتسحب بمعادلات عشان لو عدلنا حاجه»: what the Marsad reads (calls, orders, money, each
  // cancellation, each rating, each evaluation) is written as values; every total, ratio, count and average is a formula
  // over them, so a number corrected by hand carries through the sheet. Each formula keeps its value for previews.
  const F = (f, v, more) => ({ f, v: v == null || Number.isNaN(v) ? null : v, ...more });
  const q = n => "'" + n.replace(/'/g, "''") + "'";
  const div = (a, b) => b ? a / b : 0;

  // ---------- 1. تقرير الكول سنتر ----------
  async function callCenter() {
    const list = await days(), H = v => ({ v, s: 'head', b: true });
    const c = k => sum(list, d => d.calls?.[k]), hot = sum(list, d => d.hotline);
    const calls = c('calls'), missed = c('abandoned'), ans = c('answered'), lost = c('orderQueueMissed'), after = c('afterHours');
    const sheets = [], multi = list.length > 1, D = q('كل يوم'), tot = list.length + 2;
    // One day: the numbers themselves; a period: the sums of «كل يوم» (fix a day there and the report follows).
    const ref = (colL, v) => multi ? F(D + '!' + colL + tot, v, { b: true }) : { v, b: true };
    const rows = [
      [{ v: 'Call center Report', s: 'title', b: true, big: true }, null, null, null, null, null],
      [{ v: label(), s: 'sub', b: true, big: true }, null, null, null, null, null],
      [H('نسبه الطلبات'), H('عدد الاوردرات المفعله'), H('عدد المكالمات المستلمه'), H('نسبه المكالمات الفائته'), H('عدد المكالمات الفائته (اكثر من 10ثواني)'), H('اجمالي المكالمات الوارده')],
      [F('IFERROR(B4/C4,0)', div(hot, ans), { t: 'pct', b: true }), ref('F', hot), ref('E', ans), F('IFERROR(E4/F4,0)', div(missed, calls), { t: 'pct', b: true }), ref('C', missed), ref('B', calls)],
      [H('"الطلبات المحتملة من المكالمات الفائتة"'), null, null, H('بعد اوقات العمل'), null, null],
      [ref('H', lost), null, null, ref('I', after), null, null]];
    sheets.push({ name: 'التقرير', widths: [22, 18, 20, 18, 24, 22], heights: [40, 34, 44, 34, 40, 30], rows, merges: ['A1:F1', 'A2:F2', 'A5:C5', 'D5:F5', 'A6:C6', 'D6:F6'] });
    if (multi) sheets.push({ name: 'كل يوم', widths: [14, 12, 14, 12, 14, 12, 12, 14, 14], freeze: 1, rows: [
      ['التاريخ', 'اجمالي المكالمات الوارده', 'عدد المكالمات الفائته', 'نسبه الفائته', 'عدد المكالمات المستلمه', 'عدد الاوردرات المفعله', 'نسبه الطلبات', 'الطلبات المحتملة من الفائتة', 'بعد اوقات العمل'].map(H),
      ...list.map((d, i) => { const r = i + 2, x = d.calls || {};
        return [{ v: d.day, t: 'date' }, x.calls ?? null, x.abandoned ?? null, F('IFERROR(C' + r + '/B' + r + ',0)', div(x.abandoned, x.calls), { t: 'pct' }), x.answered ?? null, d.hotline,
          F('IFERROR(F' + r + '/E' + r + ',0)', div(d.hotline, x.answered), { t: 'pct' }), x.orderQueueMissed ?? null, x.afterHours ?? null]; }),
      [{ v: 'الإجمالي', s: 'sub', b: true }, ...[['B', calls], ['C', missed], null, ['E', ans], ['F', hot], null, ['H', lost], ['I', after]].map((x, j) => x ? F('SUM(' + x[0] + '2:' + x[0] + (tot - 1) + ')', x[1], { s: 'sub', b: true })
        : F(j === 2 ? 'IFERROR(C' + tot + '/B' + tot + ',0)' : 'IFERROR(F' + tot + '/E' + tot + ',0)', j === 2 ? div(missed, calls) : div(hot, ans), { t: 'pct', s: 'sub', b: true }))]] });
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
        hotCash: pick(x => x.kind === 'Hotline' && x.pay !== 'Visa'), hotVisa: pick(x => x.kind === 'Hotline' && x.pay === 'Visa'),
        talCash: pick(x => x.kind === 'طلبات' && x.pay === 'Cash'), talPaid: pick(x => x.kind === 'طلبات' && x.pay !== 'Cash'),
        waf: pick(x => x.kind === 'وفرها'), link: pick(x => x.kind === 'Hotline' && x.pay === 'Ledge'),
        siteCash: pick(x => x.kind === 'الموقع' && x.pay === 'Cash'), sitePaid: pick(x => x.kind === 'الموقع' && x.pay !== 'Cash'),
        offTal: sum(off, x => x.offers.talabat), offSite: sum(off, x => x.offers.site) };
    });
  }
  // The layout (rows fixed): 5 كاش 6 فيزا 7 الاجمالي | 8 اطلب كاش 9 اطلب مدفوع 10 اجمالي اطلب | 12 وفرها 13 لينك 14 موقعنا كاش
  // 15 موقعنا مدفوع 16 اجمالي موقعنا | 19 الاجمالي | 22 العروض | 25 الاجمالي العام. Each branch: label, amount, orders.
  // The values are the Marsad's (or, on the period's sheet, the sum of the same cell on each day's sheet); totals formulas.
  const SALES_INPUT = { 5: 'hotCash', 6: 'hotVisa', 8: 'talCash', 9: 'talPaid', 12: 'waf', 13: 'link', 14: 'siteCash', 15: 'sitePaid' };
  function salesSheet(list, title, sub, daySheets) {
    const bl = salesBlocks(list), W = 9, rows = Array.from({ length: 25 }, () => Array(W).fill(null)), merges = [];
    const C = X().col, put = (r, c, v) => { rows[r - 1][c] = v; };
    const val = (r, c, v, s) => daySheets ? F(daySheets.map(n => q(n) + '!' + C(c) + r).join('+'), v, { s, b: true }) : { v, s, b: true };
    put(1, 0, { v: title, s: 'sub', b: true, big: true }); merges.push('A1:I1');
    put(2, 0, { v: sub, s: 'sub', b: true, big: true }); merges.push('A2:I2');
    const LAB = { 5: ['كاش', 'blue'], 6: ['فيزا', 'blue'], 7: ['الاجمالي', 'blue'], 8: ['اطلب كاش', 'orange'], 9: ['اطلب مدفوع', 'orange'], 10: ['اجمالي اطلب', 'orange'],
      12: ['وفرها مدفوع', 'lavender'], 13: ['لينك', 'sub'], 14: ['موقعنا كاش', 'lavender'], 15: ['موقعنا مدفوع', 'lavender'], 16: ['اجمالي موقعنا', 'lavender'] };
    const SUMS = { 7: [5, 6], 10: [8, 9], 16: [14, 15] };
    const got = {};
    bl.forEach((x, i) => {
      const c0 = i * 3, A = c0 + 1, O = c0 + 2;
      put(3, c0, { v: 'فرع ' + x.b.name, s: 'yellow', b: true }); merges.push(merge(3, c0, 3, c0 + 2));
      put(4, c0, { v: 'الهوت لاين', s: 'blue', b: true }); put(4, A, { v: 'المبلغ', s: 'blue', b: true }); put(4, O, { v: 'عدد الاوردرات', s: 'blue', b: true });
      const g = got[i] = {};
      for (const [r, [lab, st]] of Object.entries(LAB)) {
        put(+r, c0, { v: lab, s: st, b: true });
        if (SALES_INPUT[r]) { const k = SALES_INPUT[r]; g[r] = x[k]; put(+r, A, val(+r, A, x[k].amount, st)); put(+r, O, val(+r, O, x[k].orders, st)); }
      }
      for (const [r, [a, b]] of Object.entries(SUMS)) { g[r] = { amount: g[a].amount + g[b].amount, orders: g[a].orders + g[b].orders };
        const st = LAB[r][1]; put(+r, A, F(C(A) + a + '+' + C(A) + b, g[r].amount, { s: st, b: true })); put(+r, O, F(C(O) + a + '+' + C(O) + b, g[r].orders, { s: st, b: true })); }
      // The branch total: Hotline + Talabat + Wafarha + our website (the link is inside the Hotline cash).
      g.all = { amount: g[7].amount + g[10].amount + g[12].amount + g[16].amount, orders: g[7].orders + g[10].orders + g[12].orders + g[16].orders };
      put(18, c0, { v: 'الاجمالي', s: 'blue', b: true }); put(19, c0, { v: null, s: 'blue' }); merges.push(merge(18, c0, 19, c0));
      put(18, A, { v: 'المبلغ', s: 'blue', b: true }); put(18, O, { v: 'عدد الاوردرات', s: 'blue', b: true });
      put(19, A, F([7, 10, 12, 16].map(r => C(A) + r).join('+'), g.all.amount, { s: 'blue', b: true })); put(19, O, F([7, 10, 12, 16].map(r => C(O) + r).join('+'), g.all.orders, { s: 'blue', b: true }));
    });
    for (const r of [11, 17]) for (let i = 0; i < W; i++) put(r, i, { v: null, s: 'gray' });
    put(21, 3, { v: 'عدد عروض طلبات', s: 'gray', b: true }); put(21, 4, { v: 'عدد عروض الموقع', s: 'gray', b: true });
    put(22, 3, val(22, 3, sum(bl, x => x.offTal), 'gray')); put(22, 4, val(22, 4, sum(bl, x => x.offSite), 'gray'));
    const all = k => sum([0, 1, 2], i => got[i].all[k]), hot = k => sum([0, 1, 2], i => got[i][7][k]);
    put(24, 0, { v: 'الاجمالي', s: 'gray', b: true, big: true }); put(25, 0, { v: null, s: 'gray' }); merges.push('A24:B25');
    put(24, 2, { v: 'المبلغ', s: 'gray', b: true }); put(25, 2, F('B19+E19+H19', all('amount'), { b: true })); merges.push('C24:D24', 'C25:D25');
    put(24, 4, { v: 'عدد الاوردرات', s: 'gray', b: true }); put(25, 4, F('C19+F19+I19', all('orders'), { b: true })); merges.push('E24:F24', 'E25:F25');
    put(24, 6, { v: 'هوت لاين فقط', s: 'gray', b: true }); put(25, 6, F('C7+F7+I7', hot('orders'), { b: true }));
    put(24, 7, { v: 'مبلغ الاوردرات الهوت لاين', s: 'gray', b: true }); put(25, 7, F('B7+E7+H7', hot('amount'), { b: true })); merges.push('H24:I24', 'H25:I25');
    return { widths: Array(W).fill(14), rows, merges };
  }
  async function sales() {
    const list = await days(), one = list.length === 1;
    const sheets = [{ name: one ? WEEKDAY(list[0].day) : 'إجمالي الفترة', ...salesSheet(list, one ? WEEKDAY(list[0].day) : 'إجمالي الفترة', label(), one ? null : list.map(d => d.day)) }];
    if (!one) for (const d of list) sheets.push({ name: d.day, ...salesSheet([d], WEEKDAY(d.day), dmy(d.day), null) });
    X().grid('مبيعات الفروع ' + fileLabel(), sheets);
    return list.some(d => !d.linked) ? 'فيه أيام Apex بتاعها مش عند المرصد' : '';
  }

  // ---------- 3. الأوردرات حسب المنطقة ومصدر الطلب ----------
  const SOURCES = ['تليفون', 'واتساب', 'شات', 'أبليكيشن', 'ويب سايت'];
  async function bySource() {
    const list = await days(), H = v => ({ v, s: 'head', b: true }), C = X().col;
    const cellsOf = d => BRANCHES.flatMap(b => {
      const x = d.branches.filter(y => branchOf(y.name) === b), k = n => sum(x, y => y.kinds?.[n]);
      // Karim's sheet: «تليفون» = the Hotline and Wafarha orders; the website split by the app / the website.
      const app = sum(x, y => y.site?.app), web = sum(x, y => (y.site?.web || 0) + (y.site?.other || 0)), siteAll = k('الموقع');
      return [k('Hotline') + k('وفرها'), null, null, app, Math.max(siteAll - app, web)];
    });
    const rows = [[{ v: 'متابعة أوردرات الدهان اليومية حسب المنطقة ومصدر الطلب', s: 'title', b: true, big: true }, ...Array(16).fill(null)],
      [H('التاريخ'), ...BRANCHES.flatMap(b => [H(b.region), null, null, null, null]), H('إجمالي اليوم')],
      [H(null), ...BRANCHES.flatMap(() => SOURCES.map(H)), H(null)]];
    const merges = ['A1:Q1', 'A2:A3', 'Q2:Q3', 'B2:F2', 'G2:K2', 'L2:P2'], grid = list.map(cellsOf);
    list.forEach((d, i) => { const r = 4 + i; rows.push([{ v: d.day, t: 'date' }, ...grid[i], F('SUM(B' + r + ':P' + r + ')', sum(grid[i], v => v), { b: true })]); });
    const last = 3 + list.length, s0 = last + 2, colSum = j => sum(grid, g => g[j]);
    rows.push([], [{ v: 'ملخص الفترة', s: 'sub', b: true }], [H('المنطقة'), ...SOURCES.map(H), H('الإجمالي')]);
    BRANCHES.forEach((b, i) => { const r = s0 + 2 + i, c0 = 1 + i * 5;
      rows.push([{ v: b.region, b: true }, ...SOURCES.map((_, j) => F('SUM(' + C(c0 + j) + '4:' + C(c0 + j) + last + ')', colSum(i * 5 + j))), F('SUM(B' + r + ':F' + r + ')', sum(SOURCES, (_, j) => colSum(i * 5 + j)), { b: true })]); });
    const tr = s0 + 5;
    rows.push([{ v: 'الإجمالي', s: 'sub', b: true }, ...[0, 1, 2, 3, 4, 5].map(j => F('SUM(' + C(j + 1) + (s0 + 2) + ':' + C(j + 1) + (tr - 1) + ')', j < 5 ? sum([0, 1, 2], i => colSum(i * 5 + j)) : sum(grid, g => sum(g, v => v)), { s: 'sub', b: true }))]);
    X().grid('الأوردرات حسب المنطقة والمصدر ' + fileLabel(), [{ name: 'المتابعة اليومية', widths: [12, ...Array(15).fill(10), 12], rows, merges, freeze: 3 }]);
    return 'واتساب وشات بيتكتبوا بإيد (Apex مش بيفرّقهم عن التليفون)' + (list.some(d => d.branches.some(b => b.site?.other)) ? '؛ أوردرات الموقع اللي قبل التحديث متحسبة «ويب سايت»' : '');
  }

  // ---------- 4. الإلغاءات (نفس شيت الإلغاءات: التفاصيل، النسبة، الأسباب، الغلق والتقييم، الكومنتات، الإجمالي) ----------
  // Platforms as in Karim's file; Wafarha counts with the Hotline (as the team counts it); Page and WhatsApp are written by hand.
  const PLATFORM = { Hotline: 'Hotline', 'وفرها': 'Hotline', 'طلبات': 'Talabat', 'الموقع': 'WEB' };
  const PLATS = ['APP', 'Hotline', 'Page', 'Talabat', 'WEB', 'Whatsapp'];
  const REASONS = ['رفض من المطعم', 'تأخر في التوصيل', 'خطأ في الطلب', 'المنتج غير متوفر', 'إلغاء العميل', 'مشكلة في الدفع', 'مشكلة تقنية', 'جوده', 'أخرى'];
  const reasonOf = t => { const s = String(t || ''); return /رفض|reject/i.test(s) ? REASONS[0] : /تأخ|تاخ|late|delay/i.test(s) ? REASONS[1] : /خطأ|خطا|غلط|wrong/i.test(s) ? REASONS[2] : /متوفر|نواقص|نفذ|unavailable|out of stock/i.test(s) ? REASONS[3]
    : /العميل|customer/i.test(s) ? REASONS[4] : /دفع|payment|فيزا/i.test(s) ? REASONS[5] : /تقن|system|سيستم/i.test(s) ? REASONS[6] : /جود|quality|بارد/i.test(s) ? REASONS[7] : REASONS[8]; };
  const ordersOf = (list, b, p) => sum(list, d => sum(d.branches.filter(x => branchOf(x.name) === b), x => p === 'Talabat' ? x.kinds?.['طلبات'] : p === 'Hotline' ? (x.kinds?.Hotline || 0) + (x.kinds?.['وفرها'] || 0)
    : p === 'APP' ? x.site?.app : p === 'WEB' ? (x.kinds?.['الموقع'] || 0) - (x.site?.app || 0) : 0));
  async function cancels() {
    const [list, own, cs] = await Promise.all([days(), api('/api/cancels/owners?from=' + state.day + '&to=' + state.to).catch(() => ({ list: [] })), api('/api/cs?from=' + state.day + '&to=' + state.to).catch(() => ({ entries: [], ratings: [] }))]);
    const owner = new Map((own.list || []).map(c => [String(c.apexNo || c.ref), c]));
    const H = v => ({ v, s: 'head', b: true }), DT = q('تفاصيل الإلغاءات'), RT = q('نسبه الالغاءات'), CL = q('وقت غلق طلبات والتقييم'), CM = q('الكومنتات والشكاوي');
    const det = list.flatMap(d => (d.cancels || []).map(c => { const o = owner.get(String(c.no)), f = o?.final || o?.owner;
      return { day: d.day, month: d.day.slice(0, 7), branch: branchOf(c.branch)?.short || c.branch, platform: PLATFORM[c.kind] || c.kind, area: c.area || '', reason: reasonOf(c.reason), raw: c.reason,
        mine: f ? (['employee', 'branch', 'pilot'].includes(f) ? 'نعم' : 'لا') : '', amount: c.amount }; }));
    const sheets = [];
    sheets.push({ name: 'تفاصيل الإلغاءات', widths: [12, 10, 12, 12, 18, 16, 14, 28, 12], freeze: 2, merges: ['A1:I1'], rows: [[{ v: 'الالغاءات ' + label(), s: 'title', b: true, big: true }],
      ['التاريخ', 'الشهر', 'الفرع', 'منصة الطلب', 'منطقة الطلب', 'سبب الإلغاء', 'محمّل على المطعم؟', 'ملاحظات', 'اجمالي الاوردر'].map(H),
      ...det.map((x, i) => [{ v: x.day, t: 'date' }, F('IF(A' + (i + 3) + '="","",TEXT(A' + (i + 3) + ',"YYYY-MM"))', x.month), x.branch, x.platform, x.area, x.reason, x.mine, x.raw, x.amount])] });
    // «نسبه الالغاءات»: the cancellations counted from the details; the orders are the Marsad's; the ratio a formula.
    const ratio = [[{ v: 'اجمالي الالغاءات ' + label(), s: 'title', b: true, big: true }], ['الفرع', 'منصة الطلب', 'إجمالي الإلغاءات', 'اجمالي الاوردرات', 'نسبة الالغاءات'].map(H)];
    const rr = {};
    for (const p of PLATS) for (const b of BRANCHES) {
      const r = ratio.length + 1, n = det.filter(x => x.branch === b.short && x.platform === p).length, o = ordersOf(list, b, p); rr[b.short + '|' + p] = { n, o };
      ratio.push([b.short, p, F('COUNTIFS(' + DT + '!$C:$C,A' + r + ',' + DT + '!$D:$D,B' + r + ')', n), o, F('IFERROR(C' + r + '/D' + r + ',0)', div(n, o), { t: 'pct' })]);
    }
    const rl = ratio.length, allN = det.length, allO = sum(Object.values(rr), x => x.o);
    ratio.push([{ v: 'الإجمالي', s: 'sub', b: true }, { v: null, s: 'sub' }, F('SUM(C3:C' + rl + ')', allN, { s: 'sub', b: true }), F('SUM(D3:D' + rl + ')', allO, { s: 'sub', b: true }), F('IFERROR(C' + (rl + 1) + '/D' + (rl + 1) + ',0)', div(allN, allO), { t: 'pct', s: 'sub', b: true })]);
    sheets.push({ name: 'نسبه الالغاءات', widths: [14, 12, 14, 14, 14], freeze: 2, merges: ['A1:E1'], rows: ratio });
    // «تحليل الأسباب»: counted from the details (as in Karim's sheet).
    const cnt = (r, mine) => det.filter(x => x.reason === r && (mine == null || x.mine === mine)).length;
    sheets.push({ name: 'تحليل الأسباب', widths: [20, 14, 16, 12], merges: ['A1:D1'], rows: [[{ v: 'أسباب الإلغاء ' + label(), s: 'title', b: true, big: true }], ['سبب الإلغاء', 'إجمالي التكرار', 'محمّل على المطعم', 'غير محمّل'].map(H),
      ...REASONS.map((r, i) => { const R = i + 3; return [r, F('COUNTIF(' + DT + '!$F:$F,A' + R + ')', cnt(r)), F('COUNTIFS(' + DT + '!$F:$F,A' + R + ',' + DT + '!$G:$G,"نعم")', cnt(r, 'نعم')), F('COUNTIFS(' + DT + '!$F:$F,A' + R + ',' + DT + '!$G:$G,"لا")', cnt(r, 'لا'))]; }),
      [{ v: 'الإجمالي', s: 'sub', b: true }, ...['B', 'C', 'D'].map((L, j) => F('SUM(' + L + '3:' + L + '11)', [det.length, det.filter(x => x.mine === 'نعم').length, det.filter(x => x.mine === 'لا').length][j], { s: 'sub', b: true }))]] });
    // Talabat: each branch's rating (entered in «خدمة العملاء») and closing time (the last closure of the day).
    const close = [['التاريخ', 'الفرع', 'التقييم', 'تقييم المنافس', 'وقت الغلق'].map(H)], lastRow = {};
    for (const d of list) for (const b of BRANCHES) {
      const rt = (cs.ratings || []).find(r => r.day === d.day && branchOf(r.branch) === b);
      const at = Object.entries(d.closedAt || {}).filter(([n]) => branchOf(n) === b).map(([, v]) => v).sort().pop();
      const tm = at ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at)) : null;
      close.push([{ v: d.day, t: 'date' }, b.short, rt?.rating ?? null, rt?.competitor ?? null, tm ? { v: tm, t: 'time' } : null]);
      lastRow[b.short] = { r: close.length, rating: rt?.rating, competitor: rt?.competitor, tm };
    }
    sheets.push({ name: 'وقت غلق طلبات والتقييم', widths: [12, 12, 10, 12, 10], freeze: 1, rows: close });
    sheets.push(commentsSheet(cs.entries || []));
    // «اجمالي» (Karim's last sheet): the ratio by branch and platform, the rating, the closing time, the complaints, the orders.
    const T = Array.from({ length: 14 }, () => Array(16).fill(null)), put = (r, c, v) => { T[r - 1][c] = v; }, C = X().col;
    put(1, 0, { v: 'نسبة الالغاءات', s: 'title', b: true }); put(2, 0, H(null)); PLATS.forEach((p, j) => put(2, 1 + j, H(p))); put(2, 7, H('Grand Total'));
    const sumifs = (col, b, p) => 'SUMIFS(' + RT + '!$' + col + ':$' + col + ',' + RT + '!$A:$A,' + b + (p ? ',' + RT + '!$B:$B,' + p : '') + ')';
    BRANCHES.forEach((b, i) => { const r = 3 + i; put(r, 0, { v: b.short, b: true });
      PLATS.forEach((p, j) => { const x = rr[b.short + '|' + p]; put(r, 1 + j, F('IFERROR(' + sumifs('C', '$A' + r, C(1 + j) + '$2') + '/' + sumifs('D', '$A' + r, C(1 + j) + '$2') + ',0)', div(x.n, x.o), { t: 'pct' })); });
      const n = sum(PLATS, p => rr[b.short + '|' + p].n), o = sum(PLATS, p => rr[b.short + '|' + p].o);
      put(r, 7, F('IFERROR(' + sumifs('C', '$A' + r) + '/' + sumifs('D', '$A' + r) + ',0)', div(n, o), { t: 'pct', b: true })); });
    put(6, 0, { v: 'Grand Total', s: 'sub', b: true });
    PLATS.forEach((p, j) => { const n = sum(BRANCHES, b => rr[b.short + '|' + p].n), o = sum(BRANCHES, b => rr[b.short + '|' + p].o);
      put(6, 1 + j, F('IFERROR(SUMIFS(' + RT + '!$C:$C,' + RT + '!$B:$B,' + C(1 + j) + '$2)/SUMIFS(' + RT + '!$D:$D,' + RT + '!$B:$B,' + C(1 + j) + '$2),0)', div(n, o), { t: 'pct', s: 'sub', b: true })); });
    put(6, 7, F('IFERROR(' + RT + '!C' + (rl + 1) + '/' + RT + '!D' + (rl + 1) + ',0)', div(allN, allO), { t: 'pct', s: 'sub', b: true }));
    // Rating and competitor: the period's average per branch; closing time: the last day's.
    put(3, 8, H(null)); put(3, 9, H('التقييم')); put(3, 10, H('تقييم المنافس')); put(3, 12, H(null)); put(3, 13, H('وقت الغلق')); put(3, 14, H('الفرع')); put(3, 15, H('Count of الشكوي'));
    const avgOf = (b, k) => { const l = (cs.ratings || []).filter(r => branchOf(r.branch) === b && r[k] != null); return l.length ? sum(l, r => r[k]) / l.length : null; };
    BRANCHES.forEach((b, i) => { const r = 4 + i, L = lastRow[b.short];
      put(r, 8, { v: b.short, b: true }); put(r, 12, { v: b.short, b: true }); put(r, 14, { v: b.short, b: true });
      put(r, 9, F('IFERROR(AVERAGEIFS(' + CL + '!$C:$C,' + CL + '!$B:$B,I' + r + '),"")', avgOf(b, 'rating') ?? '', { t: 'dec' }));
      put(r, 10, F('IFERROR(AVERAGEIFS(' + CL + '!$D:$D,' + CL + '!$B:$B,I' + r + '),"")', avgOf(b, 'competitor') ?? '', { t: 'dec' }));
      put(r, 13, L ? F('IF(' + CL + '!E' + L.r + '="","",' + CL + '!E' + L.r + ')', L.tm ? (+L.tm.slice(0, 2) * 60 + +L.tm.slice(3)) / 1440 : '', { t: 'time' }) : null);
      put(r, 15, F('COUNTIFS(' + CM + '!$C:$C,O' + r + ',' + CM + '!$F:$F,"<>")', (cs.entries || []).filter(e => branchOf(e.branch) === b && e.complaint).length)); });
    put(7, 14, { v: 'Grand Total', s: 'sub', b: true }); put(7, 15, F('SUM(P4:P6)', (cs.entries || []).filter(e => branchOf(e.branch) && e.complaint).length, { s: 'sub', b: true }));
    // The orders by branch and platform (from «نسبه الالغاءات»).
    put(9, 7, { v: 'اجمالي الاوردرات', s: 'title', b: true }); put(10, 7, H(null)); PLATS.forEach((p, j) => put(10, 8 + j, H(p))); put(10, 14, H('Grand Total'));
    BRANCHES.forEach((b, i) => { const r = 11 + i; put(r, 7, { v: b.short, b: true });
      PLATS.forEach((p, j) => put(r, 8 + j, F(sumifs('D', '$H' + r, C(8 + j) + '$10'), rr[b.short + '|' + p].o)));
      put(r, 14, F('SUM(I' + r + ':N' + r + ')', sum(PLATS, p => rr[b.short + '|' + p].o), { b: true })); });
    T[13][7] = { v: 'Grand Total', s: 'sub', b: true };
    for (let j = 8; j <= 14; j++) T[13][j] = F('SUM(' + C(j) + '11:' + C(j) + '13)', j < 14 ? sum(BRANCHES, b => rr[b.short + '|' + PLATS[j - 8]].o) : allO, { s: 'sub', b: true });
    sheets.push({ name: 'اجمالي', widths: [12, 9, 9, 9, 9, 9, 9, 11, 12, 10, 12, 9, 10, 10, 11, 14], rows: T, merges: ['A1:H1', 'H9:O9'] });
    X().grid('الإلغاءات ' + fileLabel(), sheets);
    return 'Page و Whatsapp بيتكتبوا بإيد في «نسبه الالغاءات» والإجمالي بيتحسب لوحده';
  }
  const commentsSheet = entries => ({ name: 'الكومنتات والشكاوي', widths: [12, 10, 12, 14, 34, 24, 26, 14], freeze: 1,
    rows: [['التاريخ', 'المنصه', 'الفرع', 'اسم العميل', 'الملاحظات', 'الشكوي', 'حل الشكوي', 'هل تم الوصول للعميل؟'].map(v => ({ v, s: 'head', b: true })),
      ...entries.map(e => [{ v: e.day, t: 'date' }, e.platform, branchOf(e.branch)?.short || e.branch, e.customer, e.comment, e.complaint, e.action, e.reached])] });

  // ---------- 5. خدمة العملاء: التقييمات والشكاوى لكل منصة ----------
  async function customerService() {
    const cs = await api('/api/cs?from=' + state.day + '&to=' + state.to);
    const H = v => ({ v, s: 'head', b: true });
    // The stars per branch are counted from the list below (change a rating and the counts follow).
    const sheetOf = (name, list) => {
      const end = 7 + Math.max(list.length, 1) + 200, rows = [[H(null), H(5), H(4), H(3), H(2), H(1), H('الإجمالي'), H('نسبة اقل من 5'), H('سئ')]];
      BRANCHES.forEach((b, i) => { const r = 2 + i, l = list.filter(e => branchOf(e.branch) === b), n = s => l.filter(e => e.rating === s).length, all = l.filter(e => e.rating != null).length;
        rows.push([{ v: b.short, b: true }, ...[5, 4, 3, 2, 1].map((s, j) => F('COUNTIFS($A$7:$A$' + end + ',$A' + r + ',$C$7:$C$' + end + ',' + X().col(1 + j) + '$1)', n(s))),
          F('SUM(B' + r + ':F' + r + ')', all), F('IFERROR(SUM(C' + r + ':F' + r + ')/G' + r + ',0)', div(all - n(5), all), { t: 'pct' }), F('IFERROR(F' + r + '/G' + r + ',0)', div(n(1), all), { t: 'pct' })]); });
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
    const qa = await api('/api/qa?from=' + state.day + '&to=' + state.to);
    const H = v => ({ v, s: 'head', b: true }), QS = q('تقييم QA');
    const list = [...qa.entries].sort((a, b) => a.day.localeCompare(b.day) || a.employee.localeCompare(b.employee, 'ar'));
    const GRADE = R => 'IF(' + R + '="","",IF(' + R + '>=0.9,"ممتاز",IF(' + R + '>=0.8,"جيد جدًا",IF(' + R + '>=0.7,"جيد",IF(' + R + '>=0.6,"مقبول","ضعيف")))))';
    const n = list.length + 2;
    // Each line: the 11 items are the evaluation; the total, the percent (out of 120, or 100 before «احترافية المكالمة») and the grade are formulas.
    const sheets = [{ name: 'تقييم QA', widths: [12, 16, 14, 10, 10, ...qa.form.map(() => 9), 10, 9, 12, 40], freeze: 2, merges: ['A1:T1'], rows: [
      [{ v: 'شيت تقييم QA - الكول سنتر ' + label(), s: 'title', b: true, big: true }],
      ['التاريخ', 'اسم الموظف', 'رقم المكالمة', 'وقت المكالمه', 'نوع المكالمة', ...qa.form.map(f => f.label + ' ' + f.max), 'الإجمالي', 'النسبة', 'التقدير', 'ملاحظات المقيم'].map(H),
      ...list.map((e, i) => { const r = i + 3;
        return [{ v: e.day, t: 'date' }, e.employee, e.phone, e.time ? { v: e.time, t: 'time' } : null, e.type, ...e.scores.map(v => v),
          F('IF(COUNT(F' + r + ':P' + r + ')=0,"",SUM(F' + r + ':P' + r + '))', e.total), F('IF(Q' + r + '="","",Q' + r + '/IF(P' + r + '="",100,120))', e.pct / 100, { t: 'pct' }), F(GRADE('R' + r), e.grade), e.notes]; })] }];
    // «النسبه»: each employee's average for the period, highest first (Karim's daily picture); «كل يوم» by day.
    const names = [...new Set(list.map(e => e.employee))];
    const avg = l => l.length ? sum(l, e => e.pct) / l.length / 100 : null;
    const per = names.map(nm => ({ nm, v: avg(list.filter(e => e.employee === nm)) })).sort((a, b) => b.v - a.v);
    sheets.push({ name: 'النسبه', widths: [20, 12], rows: [[H('التاريخ'), { v: label(), b: true }], [H(null), H('QA')],
      ...per.map((x, i) => [x.nm, F('IFERROR(AVERAGEIFS(' + QS + '!$R$3:$R$' + n + ',' + QS + '!$B$3:$B$' + n + ',A' + (i + 3) + '),"")', x.v, { t: 'pct' })]),
      [{ v: 'Grand Total', s: 'sub', b: true }, F('IFERROR(AVERAGE(' + QS + '!$R$3:$R$' + n + '),"")', avg(list), { t: 'pct', s: 'sub', b: true })]] });
    const dayList = [...new Set(list.map(e => e.day))];
    if (dayList.length > 1) sheets.push({ name: 'كل يوم', widths: [20, ...dayList.map(() => 11), 12], freeze: 1, rows: [[H('الموظف'), ...dayList.map(d => ({ v: d, t: 'date', s: 'head', b: true })), H('الفترة')],
      ...per.map((x, i) => { const r = i + 2; return [x.nm, ...dayList.map((d, j) => { const v = avg(list.filter(e => e.employee === x.nm && e.day === d));
        return F('IFERROR(AVERAGEIFS(' + QS + '!$R$3:$R$' + n + ',' + QS + '!$B$3:$B$' + n + ',$A' + r + ',' + QS + '!$A$3:$A$' + n + ',' + X().col(1 + j) + '$1),"")', v ?? '', { t: 'pct' }); }),
        F('IFERROR(AVERAGEIFS(' + QS + '!$R$3:$R$' + n + ',' + QS + '!$B$3:$B$' + n + ',$A' + r + '),"")', x.v, { t: 'pct', b: true })]; })] });
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
