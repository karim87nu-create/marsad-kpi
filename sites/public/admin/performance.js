'use strict';
window.MarsadPerformance = function ({ api, h, $, kpi, state, table, exportSheets, showError }) {
  const n = value => value == null ? '—' : Number(value).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: 2 });
  const branchName = value => /مدينة نصر|سيتي ستار|مكرم|nasr/i.test(value) ? 'مدينة نصر' : /التجمع|البنفسج|tagamo/i.test(value)
    ? 'التجمع' : /مدينت[يى]|ساوث بارك|madinaty/i.test(value) ? 'مدينتي' : value || 'غير محدد';
  const names = { Talabat: 'طلبات', APP: 'التطبيق', Hotline: 'الهوت لاين', Whatsapp: 'واتساب', talabat: 'طلبات', site: 'الموقع' };
  const pct = value => value == null ? '—' : n(value) + '%';
  const cash = value => value == null ? '—' : n(value) + ' ج';
  const col = (title, get, type, format) => ({ title, get, ...(type ? { type } : {}), ...(format ? { show: r => format(get(r)) } : {}) });
  const numeric = (title, key) => col(title, r => r[key], 'number', n);
  const percent = (title, key) => col(title, r => r[key], 'percent', pct);
  const money = (title, key) => col(title, r => r[key], 'number', cash);
  const named = title => col(title, r => r.name);
  let data = null, rendered = [], pending = null;

  const complaintCols = [
    named('الفرع'), numeric('أوردرات أبيكس', 'orders'), numeric('حالات الشكاوى', 'complaints'), percent('شكاوى / أوردرات', 'rate'),
    numeric('مربوطة بأبيكس', 'linked'), numeric('تم التواصل', 'contacted'), percent('نسبة التواصل', 'contactPct'),
    numeric('اتسجّل إجراء', 'actions'), percent('نسبة تسجيل إجراء', 'actionPct'),
    numeric('التقييمات', 'ratings'), numeric('متوسط التقييم من 5', 'rating'), numeric('نجمة أو نجمتين', 'lowRatings'),
  ];
  const breakdown = (...labels) => [
    ...labels.map((label, i) => col(label, r => r.labels[i])), numeric('العدد', 'count'), percent('من شكاوى الاختيار', 'pct'),
  ];
  const branchCols = [
    named('الفرع'), numeric('الأوردرات', 'orders'), money('المبيعات', 'sales'), money('متوسط الفاتورة', 'avgTicket'),
    money('الخصومات', 'discounts'), percent('الخصم من المبيعات', 'discountPct'), numeric('متوسط الخروج (د)', 'avgOut'),
    numeric('خرج بعد 30 دقيقة', 'outLate'), percent('نسبة التأخير', 'latePct'), numeric('إلغاءات أبيكس', 'cancels'),
    percent('نسبة إلغاءات أبيكس', 'cancelPct'), numeric('طلبات', 'talabat'), numeric('هوت لاين', 'hotline'), numeric('الموقع', 'site'),
    numeric('مرات القفل على طلبات', 'closures'), numeric('القفل على طلبات (س/يوم)', 'closedHours'),
    numeric('من تحويل الموقع للخروج (د)', 'siteOutMin'), numeric('بلاغات الأصناف الناقصة', 'itemOut'), numeric('طلبات بوت الفرع', 'botRequests'),
  ];
  const teamCols = [
    col('مكالمات أرابيكس المسجلة', r => r.recordedCalls ?? r.calls, 'number', n), numeric('اترد عليها', 'answered'), numeric('الفائتة المحتسبة', 'abandoned'), numeric('الفائتة القصيرة', 'shortAbandoned'),
    percent('نسبة الفائتة', 'abandon'), percent('الرد في 10 ثواني', 'sla'), numeric('متوسط الانتظار (ث)', 'asa'),
    numeric('متوسط المكالمة (ث)', 'meanCall'), percent('تحويل مكالمات الطلب لأوردر', 'conversionPct'), percent('الحل من أول متابعة', 'fcrPct'),
    numeric('فائتة كان ممكن تتلحق', 'missedOwned'), numeric('عملاء ماطلبوش بعد الفائتة', 'lost'), money('مبيعات ضايعة تقديريًا', 'lostValue'),
  ];
  const empCols = [
    named('الموظف'), numeric('المكالمات', 'calls'), numeric('متوسط المكالمة (ث)', 'meanCall'), numeric('متوسط الانتظار (ث)', 'avgAnswerWait'),
    percent('تحويل الطلبات', 'conversionPct'), numeric('أوردرات سجّلها', 'entered'), percent('FCR', 'fcrPct'),
    numeric('فائتة ممكن يلحقها', 'missedMine'), percent('الالتزام', 'adherencePct'), numeric('تأخير (د)', 'lateMinutes'),
    numeric('أيام الغياب', 'absentDays'), numeric('البريك (د/يوم)', 'breakPerDay'), percent('الجودة', 'qaScore'), numeric('عينات الجودة', 'qaCount'),
  ];
  const supCols = [
    named('المشرف'), numeric('متوسط انتظار الموافقة (د)', 'approvalMin'), numeric('متوسط مراجعة الأوردر (د)', 'reviewMin'),
    numeric('متوسط الرد على البريك (د)', 'breakReplyMin'), numeric('تقييمات الجودة في الأسبوع', 'qaPerWeek'),
  ];
  function redraw() {
    if (!data) return;
    const { cs, kpis, cancels, auto } = data;
    const pick = $('performanceBranch').value;
    const branch = cs?.branches.find(b => b.name === pick);
    const selection = pick ? branch : cs?.totals;
    const rows = list => (list || []).filter(r => !pick || r.branch === pick || r.name === pick);
    const groups = pick ? branch : cs;
    const tableSheet = (id, name, columns, records) => {
      table(id, columns, records, { pageSize: 25, empty: 'مفيش بيانات في الفترة والاختيار ده' });
      rendered.push([name, columns, records]);
    };
    const card = (title, value, detail, format = n) => kpi(title, format(value), value == null ? '' : 'info', detail || '');
    const t = kpis?.team;
    $('performanceCards').replaceChildren(
      card('أوردرات أبيكس', selection?.orders, cs && selection ? selection.apexDays + ' من ' + cs.days + ' يوم عليه قراءات' : ''),
      card('حالات الشكاوى', selection?.complaints),
      card('نسبة الشكاوى للأوردرات', selection?.rate, selection?.rate == null ? 'تحتاج إجمالي أوردرات كامل وفرع محدد' : '', pct),
      card('اتواصلنا مع العميل', selection?.contactPct, selection ? n(selection.contacted) + ' حالة' : '', pct),
      card('متوسط تقييم المنصات', selection?.rating, selection ? n(selection.ratings) + ' تقييم' : ''),
      card('مكالمات الكول سنتر', t?.recordedCalls ?? t?.calls, 'لكل الفريق'),
      card('نسبة المكالمات الفائتة', t?.abandon, 'لكل الفريق', pct),
      card('متوسط انتظار العميل', t?.asa, 'ثانية · لكل الفريق'),
    );
    const series = (pick ? branch?.daily : cs?.daily) || [];
    const stats = rows((kpis?.branches || []).map(b => ({ ...b, ...b.mix, name: branchName(b.name) })));
    const cancelGroups = new Map();
    for (const r of rows((cancels?.list || []).map(r => ({ ...r, branch: branchName(r.branch) }))).filter(r => r.owner === 'Vendor')) {
      const key = JSON.stringify([r.branch || 'غير محدد', r.platform]);
      const entry = cancelGroups.get(key) || { branch: r.branch || 'غير محدد', channel: names[r.platform] || r.platform, count: 0, value: null };
      entry.count++;
      if (r.amount != null) entry.value = (entry.value || 0) + Number(r.amount);
      cancelGroups.set(key, entry);
    }
    rendered = [];
    tableSheet('performanceComplaints', 'الشكاوى حسب الفرع', complaintCols, rows(cs?.branches));
    tableSheet('performanceTypes', 'أنواع الشكاوى', breakdown('نوع الشكوى'), groups?.types || []);
    tableSheet('performanceDepartments', 'الأقسام المعنية', breakdown('القسم المعني'), groups?.departments || []);
    tableSheet('performanceChannels', 'قنوات الشكاوى', breakdown('قناة الشكوى'), groups?.channels || []);
    tableSheet('performanceChannelTypes', 'القناة ونوع الشكوى', breakdown('القناة', 'نوع الشكوى'), groups?.channelTypes || []);
    tableSheet('performanceRecorders', 'مسجلو الشكاوى', [...breakdown('الموظف المسجّل'), numeric('تم التواصل', 'contacted'), numeric('اتسجّل إجراء', 'actions')], groups?.recorders || []);
    tableSheet('performanceDaily', 'متابعة يومية', [col('اليوم', r => r.day), numeric('الأوردرات', 'orders'), numeric('الشكاوى', 'complaints'), percent('شكاوى / أوردرات', 'rate')], series);
    tableSheet('performanceBranches', 'تشغيل الفروع', branchCols, stats);
    tableSheet('performanceCancels', 'إلغاءات على المطعم', [
      col('الفرع', r => r.branch), col('قناة الأوردر', r => r.channel), numeric('الإلغاءات المؤكدة', 'count'), money('قيمة الأوردرات', 'value'),
    ], [...cancelGroups.values()].sort((a, b) => b.count - a.count));
    tableSheet('performanceWebsite', 'خروج وتوصيل الموقع', [
      named('الفرع'), numeric('أوردرات التوصيل', 'count'), numeric('خرجت', 'dispatch'), numeric('تحميل من إضافة مرصد', 'extensionDispatch'),
      numeric('تحميل من الفرع', 'branchDispatch'), numeric('مصدر التحميل غير مسجّل', 'unknownDispatch'), numeric('عينات وقت التوصيل', 'deliveryN'),
      numeric('من الخروج للتسليم (د)', 'deliveryMinutes'),
    ], rows(cs?.website));
    tableSheet('performanceCalls', 'مؤشرات الكول سنتر', teamCols, t ? [t] : []);
    tableSheet('performanceAgents', 'الموظفون', empCols, kpis?.employees || []);
    tableSheet('performanceSupervisors', 'المشرفون', supCols, kpis?.supervisors || []);
    tableSheet('performanceAuto', 'التحويل الآلي', [named('المنصة'), numeric('اتراجعوا', 'all'), numeric('اتحوّلوا آلي', 'auto'), numeric('اتسابوا للموظف', 'staff'), numeric('كان هيتحوّل (تجربة)', 'would')],
      Object.entries(auto?.totals || {}).map(([source, row]) => ({ name: names[source] || source, ...row })));
    tableSheet('performanceAutoReasons', 'أسباب وقوف التحويل', [col('السبب', r => r.reason), numeric('عدد الأوردرات', 'orders'), percent('من الأوردرات اللي اتسابت', 'share'), numeric('طلبات', 'talabat'), numeric('الموقع', 'site')], auto?.reasons || []);
    $('performanceExport').disabled = !!pending || !rendered.some(([, , r]) => r.length);
  }
  async function render() {
    const start = state.day, end = state.to, query = '?from=' + start + '&to=' + end;
    const request = {};
    pending = request;
    data = null;
    $('performanceExport').disabled = true;
    $('performanceStatus').textContent = 'جاري تحميل التقرير…';
    for (const panel of document.querySelectorAll('#view-performance [data-performance-result]')) panel.hidden = true;
    const sources = [
      ['cs', 'الشكاوى والتقييمات', '/api/reports/complaint-performance'],
      ['kpis', 'أداء الفروع والكول سنتر', '/api/kpi'],
      ['cancels', 'إلغاءات المطعم', '/api/reports/platform-cancels'],
      ['auto', 'التحويل الآلي', '/api/auto-transfer/report'],
    ];
    const results = {}, failed = [];
    let remaining = sources.length;
    await Promise.all(sources.map(async ([key, label, path]) => {
      try { results[key] = await api(path + query, { timeout: 120000 }); }
      catch (error) { results[key] = null; failed.push(label + ' (' + error.message + ')'); }
      remaining--;
      if (pending !== request || state.day !== start || state.to !== end) return;
      data = results;
      if (!remaining) pending = null;
      const note = failed.length ? 'تعذّر تحميل ' + failed.join('، ') + '. ' : '';
      $('performanceStatus').textContent = (remaining ? 'جاري تحميل باقي المؤشرات… ' : '') + note +
        (data.kpis?.team?.complete === false ? 'سجل مكالمات أرابيكس للفترة غير مكتمل. ' : '') +
        (data.cs && data.cs.totals.apexDays < data.cs.days ? 'فيه أيام أو فروع قراءاتها ناقصة، وده بيظهر في نسبة الشكاوى.' : '');
      if (key === 'cs') {
        const branch = $('performanceBranch'), previous = branch.value;
        branch.replaceChildren(h('option', { value: '', textContent: 'كل الفروع' }),
          ...['مدينة نصر', 'التجمع', 'مدينتي', ...(data.cs?.branches.some(b => b.name === 'غير محدد') ? ['غير محدد'] : [])].map(name => h('option', { value: name, textContent: name })));
        if ([...branch.options].some(o => o.value === previous)) branch.value = previous;
      }
      for (const panel of document.querySelectorAll('#view-performance [data-performance-result]')) panel.hidden = false;
      redraw();
    }));
  }
  $('performanceBranch').onchange = redraw;
  $('performanceExport').onclick = () => {
    try { if (rendered.length && data) exportSheets('أداء-الفروع-والكول-سنتر', rendered); } catch (error) { showError(error); }
  };
  return { render };
};
