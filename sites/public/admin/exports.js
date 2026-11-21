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
  // Karim 11-16 «عايز يمكن سحبها في اي وقت في اليوم والارقام تبقي لحد منا سحبت التقرير»: a day still running says until when.
  const cairoNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const d = p.year + '-' + p.month + '-' + p.day; return { day: +p.hour < 9 ? new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10) : d, time: p.hour + ':' + p.minute }; };
  const until = () => { const n = cairoNow(); return state.to >= n.day ? ' (لحد الساعة \u200F' + n.time + ')' : ''; };
  const label = () => (state.day === state.to ? dmy(state.day) : 'من \u200F' + dmy(state.day) + '\u200F إلى \u200F' + dmy(state.to)) + until();
  const fileLabel = () => (state.day === state.to ? state.day : state.day + '_' + state.to) + (until() ? '_' + cairoNow().time.replace(':', '') : '');
  const sum = (l, f) => l.reduce((n, x, i) => n + (Number(f(x, i)) || 0), 0);
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

  // ---------- 1. تقرير الكول سنتر (الصورة: شيت واحد) ----------
  async function callCenter() {
    const list = await days(), H = v => ({ v, s: 'head', b: true });
    const c = k => sum(list, d => d.calls?.[k]), hot = sum(list, d => d.hotline);
    const calls = c('calls'), missed = c('abandoned'), ans = c('answered'), incoming = c('recordedCalls');
    const hasCalls = list.some(d => d.calls);
    const rows = [
      [{ v: 'Call center Report', s: 'title', b: true, big: true }, null, null, null, null, null],
      [{ v: label(), s: 'sub', b: true, big: true }, null, null, null, null, null],
      [H('نسبه الطلبات'), H('عدد الاوردرات المفعله'), H('عدد المكالمات المستلمه'), H('نسبه المكالمات الفائته'), H('عدد المكالمات الفائتة (أكتر من 7 ثواني)'), H('إجمالي المكالمات الواردة أثناء التشغيل')],
      [F('IFERROR(B4/C4,0)', div(hot, ans), { t: 'pct', b: true }), { v: hot, b: true }, { v: hasCalls ? ans : null, b: true }, F('IFERROR(E4/B8,0)', div(missed, calls), { t: 'pct', b: true }), { v: hasCalls ? missed : null, b: true }, { v: hasCalls ? incoming : null, b: true }],
      [H('"الطلبات المحتملة من المكالمات الفائتة"'), null, null, H('بعد اوقات العمل'), null, null],
      [{ v: c('orderQueueMissed'), b: true }, null, null, { v: hasCalls ? c('afterHours') : null, b: true }, null, null],
      [H('المكالمات المحتسبة'), null, H('فائتة قصيرة ≤7 ثواني'), null, null, null],
      [null, hasCalls ? calls : null, hasCalls ? c('shortAbandoned') : null, null, null, null],
      [list.some(d => !d.calls) ? 'بيانات Arabix ناقصة لجزء من الفترة المختارة' : null]];
    X().grid('Call center Report ' + fileLabel(), [{ name: 'Call center Report', widths: [22, 18, 20, 18, 24, 22], heights: [40, 34, 44, 34, 40, 30], rows, merges: ['A1:F1', 'A2:F2', 'A5:C5', 'D5:F5', 'A6:C6', 'D6:F6', 'A9:F9'] }]);
    return list.some(d => !d.calls) ? 'فيه أيام سجل المكالمات بتاعها لسه مااتسحبش من أرابيكس' : '';
  }

  // ---------- 2. مبيعات الفروع (هوت لاين، طلبات، وفرها، لينك، موقعنا) ----------
  function salesBlocks(list) {
    return BRANCHES.map(b => {
      // Each day's amount rounded on its own, so the period equals the sum of the days' sheets.
      const per = list.map(d => d.branches.filter(x => branchOf(x.name) === b).flatMap(x => x.sales));
      const pick = f => ({ amount: sum(per, s => Math.round(sum(s.filter(f), x => x.sales))), orders: sum(per, s => sum(s.filter(f), x => x.orders)) });
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

  // ---------- 3. الأوردرات حسب المنطقة ومصدر الطلب (ملف FB: الشهر كله في شيت) ----------
  const SOURCES = ['تليفون', 'واتساب', 'شات', 'أبليكيشن', 'ويب سايت'];
  async function bySource() {
    // The month of the chosen day, every day in its row; the days up to the chosen one are filled.
    const to = state.to, m0 = to.slice(0, 8) + '01', ym = to.slice(0, 7);
    const list = (await api('/api/reports/days?from=' + m0 + '&to=' + to, { timeout: 180000 })).days, byDay = new Map(list.map(d => [d.day, d]));
    const n = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(), H = v => ({ v, s: 'head', b: true }), C = X().col;
    const cellsOf = d => BRANCHES.flatMap(b => {
      const x = d.branches.filter(y => branchOf(y.name) === b), k = nm => sum(x, y => y.kinds?.[nm]);
      // Karim's sheet: «تليفون» = the Hotline and Wafarha orders; the website split by the app / the website.
      const app = sum(x, y => y.site?.app), web = sum(x, y => (y.site?.web || 0) + (y.site?.other || 0)), siteAll = k('الموقع');
      // WhatsApp / the page: Hotline orders with «واتساب» / «بيدج» next to the customer's name (Karim 11-16); «شات» the page's chat.
      const wa = sum(x, y => y.sources?.whatsapp), pg = sum(x, y => y.sources?.page);
      return [k('Hotline') + k('وفرها') - wa - pg, wa, pg, app, Math.max(siteAll - app, web)];
    });
    const rows = [[{ v: 'متابعة أوردرات الدهان اليومية حسب المنطقة ومصدر الطلب', s: 'title', b: true, big: true }, ...Array(16).fill(null)],
      [H('التاريخ'), ...BRANCHES.flatMap(b => [H(b.region), null, null, null, null]), H('إجمالي اليوم')],
      [H(null), ...BRANCHES.flatMap(() => SOURCES.map(H)), H(null)], []];
    const merges = ['A1:Q1', 'A2:A3', 'Q2:Q3', 'B2:F2', 'G2:K2', 'L2:P2'], grid = [];
    for (let i = 1; i <= n; i++) {
      const day = ym + '-' + String(i).padStart(2, '0'), d = byDay.get(day), r = 4 + i, cells = d?.linked ? cellsOf(d) : Array(15).fill(null);
      grid.push(cells.map(v => v || 0));
      rows.push([{ v: day, t: 'date' }, ...cells, F('SUM(B' + r + ':P' + r + ')', sum(cells, v => v), { b: true })]);
    }
    const last = 4 + n, s0 = last + 4, colSum = j => sum(grid, g => g[j]);
    rows.push([], [], [], [{ v: 'ملخص الشهر', s: 'sub', b: true }], [H('المنطقة'), ...SOURCES.map(H), H('الإجمالي')]);
    BRANCHES.forEach((b, i) => { const r = s0 + 2 + i, c0 = 1 + i * 5;
      rows.push([{ v: b.region, b: true }, ...SOURCES.map((_, j) => F('SUM(' + C(c0 + j) + '5:' + C(c0 + j) + last + ')', colSum(i * 5 + j))), F('SUM(B' + r + ':F' + r + ')', sum(SOURCES, (_, j) => colSum(i * 5 + j)), { b: true })]); });
    const t0 = s0 + 2;
    rows.push([{ v: 'الإجمالي', s: 'sub', b: true }, ...[0, 1, 2, 3, 4, 5].map(j => F('SUM(' + C(j + 1) + t0 + ':' + C(j + 1) + (t0 + 2) + ')', j < 5 ? sum([0, 1, 2], i => colSum(i * 5 + j)) : sum(grid, g => sum(g, v => v)), { s: 'sub', b: true }))]);
    X().grid('ElDahan_Daily_Orders_' + ym, [{ name: 'المتابعة اليومية', widths: [12, ...Array(15).fill(10), 12], rows, merges, freeze: 3 }]);
    return 'الشهر ' + ym + ' لحد ' + dmy(to);
  }

  // ---------- 4. الإلغاءات (نفس الست شيتات بالترتيب) ----------
  const PLATS = ['Talabat', 'WEB', 'APP'];
  const REASONS = ['رفض من المطعم', 'تأخر في التوصيل', 'خطأ في الطلب', 'المنتج غير متوفر', 'إلغاء العميل', 'مشكلة في الدفع', 'مشكلة تقنية', 'جوده', 'أخرى'];
  const reasonOf = t => { const s = String(t || ''); return /رفض|reject/i.test(s) ? REASONS[0] : /تأخ|تاخ|late|delay/i.test(s) ? REASONS[1] : /خطأ|خطا|غلط|wrong/i.test(s) ? REASONS[2] : /متوفر|نواقص|نفذ|unavailable|out of stock/i.test(s) ? REASONS[3]
    : /العميل|customer/i.test(s) ? REASONS[4] : /دفع|payment|فيزا/i.test(s) ? REASONS[5] : /تقن|system|سيستم/i.test(s) ? REASONS[6] : /جود|quality|بارد/i.test(s) ? REASONS[7] : REASONS[8]; };
  async function cancels() {
    const range = '?from=' + state.day + '&to=' + state.to;
    const [platforms, cs] = await Promise.all([api('/api/reports/platform-cancels' + range, { timeout: 120000 }), api('/api/cs' + range)]);
    const list = platforms.days;
    const H = v => ({ v, s: 'head', b: true }), DT = q('تفاصيل الإلغاءات'), RT = q('نسبه الالغاءات'), CL = q('وقت غلق طلبات والتقييم'), CM = q('الكومنتات والشكاوي'), C = X().col;
    const shortBranch = name => branchOf(name)?.short || 'فرع غير معروف';
    const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' });
    const det = platforms.list.map(c => ({ ...c, month: c.day.slice(0, 7), branch: shortBranch(c.branch), raw: c.reason,
      reason: c.reason ? reasonOf(c.reason) : c.status === 'REJECTED' ? REASONS[0] : REASONS[8],
      mine: /^vendor$/i.test(c.owner || '') ? 'نعم' : /^(customer|platform|transport|rider)$/i.test(c.owner || '') ? 'لا' : '' }));
    const unknown = platforms.platformTotals.some(x => !branchOf(x.branch));
    const ratioBranches = unknown ? [...BRANCHES, { short: 'فرع غير معروف' }] : BRANCHES;
    const sheets = [];
    // «تحليل الأسباب»: counted from the details (as in Karim's sheet).
    const cnt = (r, mine) => det.filter(x => x.reason === r && (mine == null || x.mine === mine)).length;
    sheets.push({ name: 'تحليل الأسباب', widths: [20, 14, 16, 12], merges: ['A1:D1'], rows: [[{ v: '  أسباب الإلغاء', s: 'title', b: true, big: true }], [{ v: label(), b: true }], ['سبب الإلغاء', 'إجمالي التكرار', 'محمّل على المطعم', 'غير محمّل'].map(H),
      ...REASONS.map((r, i) => { const R = i + 4; return [r, F('COUNTIF(' + DT + '!$F:$F,A' + R + ')', cnt(r)), F('COUNTIFS(' + DT + '!$F:$F,A' + R + ',' + DT + '!$G:$G,"نعم")', cnt(r, 'نعم')), F('COUNTIFS(' + DT + '!$F:$F,A' + R + ',' + DT + '!$G:$G,"لا")', cnt(r, 'لا'))]; }),
      [{ v: 'الإجمالي', s: 'sub', b: true }, ...['B', 'C', 'D'].map((L, j) => F('SUM(' + L + '4:' + L + '12)', [det.length, det.filter(x => x.mine === 'نعم').length, det.filter(x => x.mine === 'لا').length][j], { s: 'sub', b: true }))]] });
    sheets.push({ name: 'تفاصيل الإلغاءات', widths: [12, 10, 12, 12, 18, 16, 14, 28, 12, 16, 13, 23, 17], freeze: 2, merges: ['A1:M1'], heights: [36], rows: [[{ v: 'الالغاءات\n' + label(), s: 'title', b: true, big: true }],
      ['التاريخ', 'الشهر', 'الفرع', 'منصة الطلب', 'منطقة الطلب', 'سبب الإلغاء', 'محمّل على المطعم؟', 'السبب من المنصة', 'اجمالي الاوردر', 'رقم أوردر المنصة', 'الكود', 'وقت الإلغاء أو الرصد', 'صاحب الإلغاء'].map(H),
      ...det.map((x, i) => [{ v: x.day, t: 'date' }, F('IF(A' + (i + 3) + '="","",TEXT(A' + (i + 3) + ',"YYYY-MM"))', x.month), x.branch, x.platform, null, x.reason, x.mine, x.raw, x.amount, x.orderNo, x.code, x.at ? localTime.format(new Date(x.at)) : x.observedAt ? 'رُصد ' + localTime.format(new Date(x.observedAt)) : null, x.owner])] });
    // «نسبه الالغاءات»: the cancellations counted from the details; the orders are the Marsad's; the ratio and the day's total formulas.
    const ratio = [[{ v: 'اجمالي الالغاءات\n' + label(), s: 'title', b: true, big: true }], ['الشهر', 'الفرع', 'منصة الطلب', 'إجمالي الإلغاءات', 'اجمالي الاوردرات', 'نسبة الالغاءات', 'اجمالي نسبه الغاءات اليوم'].map(H)];
    const rr = {}, month = state.to.slice(0, 7);
    for (const p of PLATS) for (const b of ratioBranches) {
      const r = ratio.length + 1, nn = det.filter(x => x.branch === b.short && x.platform === p).length, o = sum(platforms.platformTotals, x => shortBranch(x.branch) === b.short && x.platform === p ? x.orders : 0); rr[b.short + '|' + p] = { n: nn, o };
      ratio.push([month, b.short, p, F('COUNTIFS(' + DT + '!$C:$C,B' + r + ',' + DT + '!$D:$D,C' + r + ')', nn), o, F('IFERROR(D' + r + '/E' + r + ',0)', div(nn, o), { t: 'pct' }), null]);
    }
    const rl = ratio.length, allN = det.length, allO = sum(Object.values(rr), x => x.o);
    ratio[2][6] = F('IFERROR(SUM(D3:D' + rl + ')/SUM(E3:E' + rl + '),0)', div(allN, allO), { t: 'pct', b: true });
    sheets.push({ name: 'نسبه الالغاءات', widths: [10, 14, 12, 14, 14, 14, 16], freeze: 2, merges: ['A1:G1'], heights: [36], rows: ratio });
    // Talabat: each branch's rating and competitor's, and closing time (the last closure of the day).
    const close = [['التاريخ', 'الفرع', 'التقييم', 'تقييم المنافس', 'وقت الغلق'].map(H)], lastRow = {};
    for (const d of list) for (const b of BRANCHES) {
      const rt = (cs.ratings || []).find(r => r.day === d.day && branchOf(r.branch) === b);
      const at = Object.entries(d.closedAt || {}).filter(([nm]) => branchOf(nm) === b).map(([, v]) => v).sort().pop();
      const tm = at ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at)) : null;
      close.push([{ v: d.day, t: 'date' }, b.short, rt?.rating ?? null, rt?.competitor ?? null, tm ? { v: tm, t: 'time' } : null]);
      lastRow[b.short] = { r: close.length, tm };
    }
    sheets.push({ name: 'وقت غلق طلبات والتقييم', widths: [12, 12, 10, 12, 10], freeze: 1, rows: close });
    // «الكومنتات والشكاوي»: the date, then Karim's columns.
    const ent = cs.entries || [];
    sheets.push({ name: 'الكومنتات والشكاوي', widths: [40, 12, 14, 26, 24, 10], rows: [[{ v: state.to, t: 'date', b: true }], ['الملاحظات', 'الفرع', 'اسم العميل', 'حل الشكوي', 'الشكوي', 'المنصه'].map(H),
      ...ent.map(e => [e.comment, branchOf(e.branch)?.short || e.branch, e.customer, e.action, e.complaint, e.platform]),
      // Karim 11-16: the positive comments come by themselves (5 stars with words on Talabat and the website), unless typed already.
      ...(cs.positive || []).filter(p => !ent.some(e => (p.orderNo && e.orderNo === p.orderNo) || (e.comment && e.comment === p.comment)))
        .map(p => [p.comment, branchOf(p.branch)?.short || p.branch || '', p.customer || '', null, null, p.platform])] });
    // «اجمالي»: the ratio by branch and platform, the rating, the closing time, the complaints, the orders.
    const T = Array.from({ length: 14 }, () => Array(16).fill(null)), put = (r, c, v) => { T[r - 1][c] = v; };
    const sumifs = (col, b, p) => 'SUMIFS(' + RT + '!$' + col + ':$' + col + ',' + RT + '!$B:$B,' + b + (p ? ',' + RT + '!$C:$C,' + p : '') + ')';
    put(1, 0, { v: ' نسبة الالغاءات', s: 'title', b: true }); put(2, 0, H(null)); PLATS.forEach((p, j) => put(2, 1 + j, H(p))); put(2, 7, H('Grand Total'));
    BRANCHES.forEach((b, i) => { const r = 3 + i; put(r, 0, { v: b.short, b: true });
      PLATS.forEach((p, j) => { const x = rr[b.short + '|' + p]; put(r, 1 + j, F('IFERROR(' + sumifs('D', '$A' + r, C(1 + j) + '$2') + '/' + sumifs('E', '$A' + r, C(1 + j) + '$2') + ',0)', div(x.n, x.o), { t: 'pct' })); });
      const nn = sum(PLATS, p => rr[b.short + '|' + p].n), o = sum(PLATS, p => rr[b.short + '|' + p].o);
      put(r, 7, F('IFERROR(' + sumifs('D', '$A' + r) + '/' + sumifs('E', '$A' + r) + ',0)', div(nn, o), { t: 'pct', b: true })); });
    put(6, 0, { v: 'Grand Total', s: 'sub', b: true });
    PLATS.forEach((p, j) => { const nn = sum(ratioBranches, b => rr[b.short + '|' + p].n), o = sum(ratioBranches, b => rr[b.short + '|' + p].o);
      put(6, 1 + j, F('IFERROR(SUMIFS(' + RT + '!$D:$D,' + RT + '!$C:$C,' + C(1 + j) + '$2)/SUMIFS(' + RT + '!$E:$E,' + RT + '!$C:$C,' + C(1 + j) + '$2),0)', div(nn, o), { t: 'pct', s: 'sub', b: true })); });
    put(6, 7, F(RT + '!G3', div(allN, allO), { t: 'pct', s: 'sub', b: true }));
    put(3, 8, H(null)); put(3, 9, H('التقييم ')); put(3, 10, H(' تقييم المنافس')); put(3, 12, H(null)); put(3, 13, H('وقت الغلق ')); put(3, 14, H('الفرع')); put(3, 15, H('Count of الشكوي'));
    const avgOf = (b, k) => { const l = (cs.ratings || []).filter(r => branchOf(r.branch) === b && r[k] != null); return l.length ? sum(l, r => r[k]) / l.length : null; };
    BRANCHES.forEach((b, i) => { const r = 4 + i, L = lastRow[b.short];
      put(r, 8, { v: b.short, b: true }); put(r, 12, { v: b.short, b: true }); put(r, 14, { v: b.short, b: true });
      put(r, 9, F('IFERROR(AVERAGEIFS(' + CL + '!$C:$C,' + CL + '!$B:$B,I' + r + '),"")', avgOf(b, 'rating') ?? '', { t: 'dec' }));
      put(r, 10, F('IFERROR(AVERAGEIFS(' + CL + '!$D:$D,' + CL + '!$B:$B,I' + r + '),"")', avgOf(b, 'competitor') ?? '', { t: 'dec' }));
      put(r, 13, L ? F('IF(' + CL + '!E' + L.r + '="","",' + CL + '!E' + L.r + ')', L.tm ? (+L.tm.slice(0, 2) * 60 + +L.tm.slice(3)) / 1440 : '', { t: 'time' }) : null);
      put(r, 15, F('COUNTIFS(' + CM + '!$B:$B,O' + r + ',' + CM + '!$E:$E,"<>")', ent.filter(e => branchOf(e.branch) === b && e.complaint).length)); });
    put(7, 14, { v: 'Grand Total', s: 'sub', b: true }); put(7, 15, F('SUM(P4:P6)', ent.filter(e => branchOf(e.branch) && e.complaint).length, { s: 'sub', b: true }));
    put(8, 7, { v: ' اجمالي الاوردرات', s: 'title', b: true }); put(9, 7, H(null)); PLATS.forEach((p, j) => put(9, 8 + j, H(p))); put(9, 14, H('Grand Total'));
    BRANCHES.forEach((b, i) => { const r = 10 + i; put(r, 7, { v: b.short, b: true });
      PLATS.forEach((p, j) => put(r, 8 + j, F(sumifs('E', '$H' + r, C(8 + j) + '$9'), rr[b.short + '|' + p].o)));
      put(r, 14, F('SUM(I' + r + ':N' + r + ')', sum(PLATS, p => rr[b.short + '|' + p].o), { b: true })); });
    put(13, 7, { v: 'Grand Total', s: 'sub', b: true });
    PLATS.forEach((p, j) => put(13, 8 + j, F('SUMIF(' + RT + '!$C:$C,' + C(8 + j) + '9,' + RT + '!$E:$E)', sum(ratioBranches, b => rr[b.short + '|' + p].o), { s: 'sub', b: true })));
    put(13, 14, F('SUM(I13:N13)', allO, { s: 'sub', b: true }));
    sheets.push({ name: 'اجمالي', widths: [12, 9, 9, 9, 9, 9, 9, 11, 12, 10, 12, 9, 10, 10, 11, 14], rows: T, merges: ['A1:H1', 'H8:O8'] });
    X().grid('الالغاءات ' + fileLabel(), sheets);
    return '';
  }

  // ---------- 5. خدمة العملاء (شيتين: طلبات والموقع) ----------
  async function customerService() {
    const cs = await api('/api/cs?from=' + state.day + '&to=' + state.to);
    const H = v => ({ v, s: 'head', b: true });
    // The stars per branch are counted from the list below (change a rating and the counts follow).
    // Karim 11-16 «التقييمات السلبيه الي من غير تعليق تدخل في العدد بس… الي يتكتب يبقي التعليقات السلبيه فقط»: the list holds
    // the negative ones with words (below 5, or a complaint typed); every rating is counted (the formula over the list plus
    // the ones not listed, so a line added or changed still counts).
    const sheetOf = (name, every) => {
      const listed = every.filter(e => (e.comment || e.complaint) && (e.complaint || e.rating == null || e.rating < 5)), quiet = every.filter(e => !listed.includes(e));
      const unknown = { short: 'فرع غير معروف' }, branch = e => branchOf(e.branch) || unknown;
      const branches = every.some(e => e.rating != null && branch(e) === unknown) ? [...BRANCHES, unknown] : BRANCHES;
      const start = branches.length + 3, list = listed, end = start + list.length + 300, rows = [[H(null), H(5), H(4), H(3), H(2), H(1), H('الإجمالي'), H('نسبة اقل من 5'), H('سئ ')]];
      branches.forEach((b, i) => { const r = 2 + i, l = every.filter(e => branch(e) === b), n = s => l.filter(e => e.rating === s).length, all = l.filter(e => e.rating != null).length;
        const qn = s => quiet.filter(e => branch(e) === b && e.rating === s).length;
        rows.push([{ v: b.short, b: true }, ...[5, 4, 3, 2, 1].map((s, j) => F('COUNTIFS($A$' + start + ':$A$' + end + ',$A' + r + ',$C$' + start + ':$C$' + end + ',' + X().col(1 + j) + '$1)' + (qn(s) ? '+' + qn(s) : ''), n(s))),
          F('SUM(B' + r + ':F' + r + ')', all), F('IFERROR(SUM(C' + r + ':F' + r + ')/G' + r + ',0)', div(all - n(5), all), { t: 'pct' }), F('IFERROR(F' + r + '/G' + r + ',0)', div(n(1), all), { t: 'pct' })]); });
      rows.push(['الفرع', 'الشكوى / تعليق العميل', 'التقييم', 'التاريخ', 'رقم الطلب', 'رقم العميل', 'هل تم الوصول للعميل؟', 'ما تم مع العميل / الإجراء'].map(H));
      for (const e of list) rows.push([branch(e).short, [e.complaint, e.comment].filter(Boolean).join(' — '), e.rating, { v: e.day, t: 'date' }, e.orderNo, e.phone, e.reached, e.action]);
      return { name, widths: [12, 44, 9, 12, 12, 14, 16, 30, 8], rows };
    };
    const sourced = cs.platformFeedback || [];
    const linked = new Set(sourced.map(e => e.followupId).filter(Boolean));
    const by = p => [...sourced.filter(e => e.platform === p),
      ...cs.entries.filter(e => e.platform === p && !linked.has(e.id) && (e.complaint || e.action || e.comment)).map(e => ({ ...e, rating: null }))];
    X().grid('خدمة العملاء ' + fileLabel(), [sheetOf('طلبات', by('طلبات')), sheetOf('الموقع', by('الموقع'))]);
    return by('طلبات').length + by('الموقع').length ? '' : 'مفيش تقييمات للفترة دي';
  }

  // ---------- 6. الجودة: شيت QA (تقييم QA، المعايير، النسبه، Dashboard) و«النسبه» لوحدها (الصورة) ----------
  const QA_HELP = ['تحية واضحة + اسم المكان + اسم الموظف + استعداد للخدمة', 'المنطقة، رقم الهاتف، الاسم، العنوان، رقم إضافي إن وجد', 'شرح الأصناف والبدائل والرد على الاستفسارات بدون لخبطة',
    'اقتراح مناسب بدون ضغط: كومبو، إضافة، صنف مكمل', 'الأصناف، الكميات، الملاحظات، السعر، الفرع/القناة، طريقة الدفع', 'هدوء، وضوح، احترام، عدم مقاطعة، تحكم في المكالمة',
    'احتواء العميل، اعتذار مناسب، تسجيل صحيح، تصعيد عند الحاجة', 'تأكيد الطلب/الخطوة التالية + سؤال عن أي استفسار + شكر العميل', 'عدم إعطاء وعود غلط، عدم تحويل العميل بدون داعي، الالتزام بالسكريبت',
    'عدم وجود سلوك أو مخالفة تؤثر على جودة المكالمة', null];
  const QA_NAMES = ['الافتتاح والترحيب', 'تأكيد بيانات العميل', 'معرفة المنتج والمنيو', 'البيع الإضافي والاقتراحات', 'دقة تسجيل الطلب', 'نبرة الصوت والاحتراف', 'التعامل مع الشكوى/الاعتراض', 'إنهاء المكالمة', 'الالتزام بالسياسات', 'الالتزام العام', 'احترافية المكالمة'];
  const GRADES = ['ممتاز', 'جيد جدًا', 'جيد', 'مقبول', 'ضعيف'];
  const qaData = async () => { const qa = await api('/api/qa?from=' + state.day + '&to=' + state.to); return { qa, list: [...qa.entries].sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || '') || a.employee.localeCompare(b.employee, 'ar')) }; };
  const avgPct = l => l.length ? sum(l, e => e.pct) / l.length / 100 : null;
  const perEmployee = list => [...new Set(list.map(e => e.employee))].map(nm => ({ nm, v: avgPct(list.filter(e => e.employee === nm)) })).sort((a, b) => b.v - a.v);
  // «النسبه» (the picture): each employee's average, highest first, and the total. With the evaluations: formulas over them.
  function ratioSheet(list, withSource) {
    const H = v => ({ v, s: 'head', b: true }), QS = q('تقييم QA'), n = 3 + list.length, per = perEmployee(list);
    return { name: 'النسبه', widths: [22, 12], rows: [[H('التاريخ'), state.day === state.to ? { v: state.day, t: 'date', b: true } : { v: label(), b: true }], [H(null), H('QA')],
      ...per.map((x, i) => [x.nm, withSource ? F('IFERROR(AVERAGEIFS(' + QS + '!$R$4:$R$' + n + ',' + QS + '!$B$4:$B$' + n + ',A' + (i + 3) + '),"")', x.v, { t: 'pct' }) : { v: x.v, t: 'pct' }]),
      [{ v: 'Grand Total', s: 'sub', b: true }, withSource ? F('IFERROR(AVERAGE(' + QS + '!$R$4:$R$' + n + '),"")', avgPct(list), { t: 'pct', s: 'sub', b: true }) : { v: avgPct(list), t: 'pct', s: 'sub', b: true }]] };
  }
  async function qaDaily() {
    const { list } = await qaData();
    X().grid('QA ' + fileLabel(), [ratioSheet(list, false)]);
    return list.length ? '' : 'مفيش تقييمات جودة في الفترة دي';
  }
  async function quality() {
    const { qa, list } = await qaData();
    const H = v => ({ v, s: 'head', b: true }), QS = q('تقييم QA'), n = 3 + list.length;
    const GRADE = R => 'IF(' + R + '="","",IF(' + R + '>=0.9,"ممتاز",IF(' + R + '>=0.8,"جيد جدًا",IF(' + R + '>=0.7,"جيد",IF(' + R + '>=0.6,"مقبول","ضعيف")))))';
    // Each line: the 11 items are the evaluation; the total, the percent (out of 120, or 100 before «احترافية المكالمة») and the grade are formulas.
    const sheets = [{ name: 'تقييم QA', widths: [12, 16, 14, 10, 10, ...qa.form.map(() => 9), 10, 9, 12, 40], freeze: 2, merges: ['A1:T1'], rows: [
      [{ v: 'شيت تقييم QA - الكول سنتر', s: 'title', b: true, big: true }],
      ['التاريخ', 'اسم الموظف', 'رقم المكالمة', 'وقت المكالمه', 'نوع المكالمة', ...qa.form.map(f => f.label + ' ' + f.max), 'الإجمالي', 'النسبة', 'التقدير', 'ملاحظات المقيم'].map(H), [],
      ...list.map((e, i) => { const r = i + 4;
        return [{ v: e.day, t: 'date' }, e.employee, e.phone, e.time ? { v: e.time, t: 'time' } : null, e.type, ...e.scores.map(v => v),
          F('IF(COUNT(F' + r + ':P' + r + ')=0,"",SUM(F' + r + ':P' + r + '))', e.total), F('IF(Q' + r + '="","",Q' + r + '/IF(P' + r + '="",100,120))', e.pct / 100, { t: 'pct' }), F(GRADE('R' + r), e.grade), e.notes]; })] }];
    sheets.push({ name: 'المعايير', widths: [26, 10, 60, 14], rows: [['البند', 'الدرجة', 'شرح مختصر للتقييم', 'ملاحظات'].map(H),
      ...QA_NAMES.map((nm, i) => [nm, qa.form[i]?.max ?? null, QA_HELP[i], null]), [{ v: 'الإجمالي', s: 'sub', b: true }, F('SUM(B2:B12)', sum(qa.form, f => f.max), { s: 'sub', b: true }), null, null]] });
    sheets.push(ratioSheet(list, true));
    // «Dashboard»: the counts, the average, the highest and lowest, the grades, each employee's average — formulas over «تقييم QA».
    const R = QS + '!$R$4:$R$' + n, S = QS + '!$S$4:$S$' + n, per = perEmployee(list), pcts = list.map(e => e.pct / 100);
    const D = [[{ v: 'Dashboard تقييم QA', s: 'title', b: true, big: true }], ['المؤشر', 'النتيجة', 'توزيع التقييمات', 'العدد', null, 'متوسط حسب الموظف', 'النسبة'].map(v => v ? H(v) : null)];
    const kp = [['عدد التقييمات', F('COUNT(' + R + ')', list.length)], ['متوسط الجودة', F('IFERROR(AVERAGE(' + R + '),0)', avgPct(list) ?? 0, { t: 'pct' })],
      ['أعلى تقييم', F('IFERROR(MAX(' + R + '),0)', pcts.length ? Math.max(...pcts) : 0, { t: 'pct' })], ['أقل تقييم', F('IFERROR(MIN(' + R + '),0)', pcts.length ? Math.min(...pcts) : 0, { t: 'pct' })],
      ['نسبة النجاح (80% فأكتر)', F('IFERROR(COUNTIF(' + R + ',">=0.8")/COUNT(' + R + '),0)', div(pcts.filter(v => v >= 0.8).length, pcts.length), { t: 'pct' })]];
    const rowsN = Math.max(kp.length, GRADES.length, per.length);
    for (let i = 0; i < rowsN; i++) { const r = i + 3;
      D.push([kp[i]?.[0] ?? null, kp[i]?.[1] ?? null, GRADES[i] ?? null, GRADES[i] ? F('COUNTIF(' + S + ',C' + r + ')', list.filter(e => e.grade === GRADES[i]).length) : null, null,
        per[i]?.nm ?? null, per[i] ? F('IFERROR(AVERAGEIFS(' + R + ',' + QS + '!$B$4:$B$' + n + ',F' + r + '),0)', per[i].v, { t: 'pct' }) : null]); }
    sheets.push({ name: 'Dashboard', widths: [24, 12, 16, 10, 4, 20, 12], merges: ['A1:G1'], rows: D });
    X().grid('QA1 ' + fileLabel(), sheets);
    return list.length ? '' : 'مفيش تقييمات جودة في الفترة دي';
  }

  const RUN = { callCenter, sales, qaDaily, bySource, cancels, customerService, quality };
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
