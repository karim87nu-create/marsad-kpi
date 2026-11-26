'use strict';
// Karim 11-16: the daily Excel reports (call center, branches' sales, orders by region and source, cancellations,
// customer service, QA), built from two real days (14–15 Nov, Apex + Arabicss, names and phones removed), and the
// customer-service sheet and the management users.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');
const DAYS = require('./fixtures/report-days-2026-11-14.json');

async function seed(t) {
  for (const [day, d] of Object.entries(DAYS)) t.app.db.raw.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?,?,?)').run(day, JSON.stringify(d.full), t.clock.now);
  t.app.day = async day => DAYS[day] ? { history: { report: DAYS[day].report, queues: DAYS[day].queues } } : null;
  // Half of the website orders of the 14th came from the app.
  const ids = DAYS['2026-11-14'].full.online.filter(o => o.kind === 'الموقع').map(o => Number(o.tag));
  ids.forEach((id, i) => t.app.db.raw.prepare('INSERT INTO site_channels (id, via) VALUES (?, ?)').run(id, i % 2 ? 'rest-api' : 'checkout'));
}

test('daily reports: the numbers of a day (Karim\'s sheets of 14-11), kept once the day is over', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 12, 0) });
  try {
    await seed(t);
    const admin = await t.admin();
    const r = (await admin('GET', '/api/reports/days?from=2026-11-14&to=2026-11-15')).body;
    assert.equal(r.days.length, 2);
    const d = r.days[0], br = n => d.branches.find(b => b.name === n), s = (b, f) => br(b).sales.filter(f).reduce((n, x) => n + x.orders, 0);
    assert.deepEqual([d.calls.calls, d.calls.answered, d.calls.abandoned, d.calls.afterHours, d.calls.orderQueueMissed], [735, 734, 1, 11, 0]);
    assert.equal(d.orders, 797);
    // The sheet of 14-11: Madinaty Hotline cash 26 (the link's 3 inside it), Visa 13; Talabat paid 91.
    assert.equal(s('مدينتى', x => x.kind === 'Hotline' && x.pay !== 'Visa'), 26);
    assert.equal(s('مدينتى', x => x.kind === 'Hotline' && x.pay === 'Visa'), 13);
    assert.equal(s('مدينتى', x => x.kind === 'طلبات' && x.pay !== 'Cash'), 91);
    assert.equal(d.branches.reduce((n, b) => n + b.offers.talabat, 0), 399, 'Talabat\'s offers (the sheet: 399)');
    const site = d.branches.reduce((n, b) => n + b.site.app + b.site.web + b.site.other, 0);
    assert.equal(site, 60); assert.equal(d.branches.reduce((n, b) => n + b.site.app, 0), Math.floor(DAYS['2026-11-14'].full.online.filter(o => o.kind === 'الموقع' && /^\d+$/.test(o.tag)).length / 2));
    assert.equal(d.cancels.length, 15);
    assert.ok(t.app.db.raw.prepare('SELECT 1 FROM report_days WHERE day = ?').get('2026-11-14'), 'a finished day is kept');
  } finally { await t.close(); }
});

test('customer service and management users', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 12, 0) });
  try {
    const admin = await t.admin();
    const bad = await admin('POST', '/api/cs', { day: '2026-11-15', platform: 'طلبات', branch: 'التجمع' });
    assert.equal(bad.status, 400);
    assert.equal((await admin('POST', '/api/cs', { day: '2026-11-15', platform: 'طلبات', branch: 'التجمع', rating: 6, comment: 'x' })).status, 400);
    const ok = await admin('POST', '/api/cs', { day: '2026-11-15', platform: 'طلبات', branch: 'التجمع', rating: 2, comment: 'الأكل وصل بارد', complaint: 'بارد', reached: 'تم التواصل', action: 'اعتذار وخصم 10%', phone: '0100 123 4567' });
    assert.equal(ok.status, 200);
    await admin('POST', '/api/cs/rating', { day: '2026-11-15', branch: 'التجمع', rating: 5, competitor: 4.9 });
    const g = (await admin('GET', '/api/cs?from=2026-11-15&to=2026-11-15')).body;
    assert.deepEqual([g.entries[0].phone, g.entries[0].rating, g.ratings[0].competitor], ['01001234567', 2, 4.9]);
    assert.equal((await admin('DELETE', '/api/cs', { id: g.entries[0].id })).status, 200);
    // A management user: takes calls, no additional-break requests.
    const boss = await t.employee(admin, { name: 'مدير', code: 'M1', pin: '9090' });
    await admin('PATCH', '/api/employees', { id: boss.id, manager: true });
    const s = await t.session('9090', '101');
    const req = await t.call('POST', '/api/break-requests', { headers: { 'x-device-token': '7000865f1220458f86506b41a97cab7d', 'x-employee-session': s.token }, body: { action: 'request', id: 'break-request:' + crypto.randomUUID(), requestedMinutes: 15 } });
    assert.equal(req.status, 409); assert.match(req.body.error || req.body.message || JSON.stringify(req.body), /إداري/);
  } finally { await t.close(); }
});

test('admin «التقارير Excel»: the seven files of a period, right to left', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 12, 0) });
  let dom;
  try {
    await seed(t);
    const admin = await t.admin();
    const emp = await t.employee(admin, { name: 'اماني احمد', code: 'Q1', pin: '4545' });
    const full = { opening: 10, verify: 10, product: 10, upsell: 10, record: 15, tone: 15, complaint: 10, closing: 5, policy: 10, general: 5, pro: 20 };
    await admin('POST', '/api/qa', { day: '2026-11-14', employeeId: emp.id, phone: '01223277391', time: '12:40', type: 'اوردر', scores: full });
    await admin('POST', '/api/qa', { day: '2026-11-15', employeeId: emp.id, phone: '01061151799', time: '15:31', type: 'استفسار', scores: { ...full, upsell: 0 }, notes: 'العرض' });
    await admin('POST', '/api/cs', { day: '2026-11-14', platform: 'طلبات', branch: 'مدينة نصر', rating: 1, comment: 'food arrived very cold', reached: 'تم التواصل', action: 'تم الاعتذار للعميل' });
    await admin('POST', '/api/cs', { day: '2026-11-14', platform: 'الموقع', branch: 'مدينتي', rating: 5, comment: 'ممتاز' });
    await admin('POST', '/api/cs/rating', { day: '2026-11-14', branch: 'مدينة نصر', rating: 5, competitor: 4.7 });
    const db = t.app.db.raw;
    const apex = structuredClone(DAYS['2026-11-14'].full);
    const nasr = apex.branches.find(b => b.name === 'مدينة نصر');
    nasr.sources = { whatsapp: 4, page: 2 };
    apex.cancels.push(
      { no: 11111, kind: 'Hotline', branch: nasr.name, amount: 80, reasonNo: 183, reasonName: 'جودة', reason: 'انسكاب، حالة هوت لاين' },
      { no: 11112, kind: 'Hotline', branch: nasr.name, amount: 81, reasonNo: 6, reasonName: 'بناء على طلب العميل' },
      { no: 11113, kind: 'Hotline', branch: nasr.name, amount: 82, reasonNo: 183, reasonName: 'جودة', customer: { name: 'وسم بيدج' } },
      { no: 11114, kind: 'Hotline', branch: nasr.name, amount: 83, src: 'whatsapp', reasonNo: 186, reasonName: 'صنف غير متوفر', area: 'النزهة' },
      { no: 11115, kind: 'Hotline', branch: nasr.name, amount: 84, src: 'hotline', reasonNo: 6, reasonName: 'طلب العميل', reason: 'انسكاب' },
    );
    apex.hotlineCancelsBeforeOut = [
      { no: 11116, kind: 'Hotline', branch: nasr.name, amount: 999, reasonNo: 183, reasonName: 'جودة' },
    ];
    db.prepare('UPDATE orders_days SET data = ? WHERE day = ?').run(JSON.stringify(apex), '2026-11-14');
    db.prepare('INSERT INTO talabat_reviews (order_id,vendor,branch,day,at,rating,text,seen_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('10001', 'HF_EG;608556', 'مدينة نصر', '2026-11-14', t.clock.now, 1, 'تقييم من طلبات', t.clock.now);
    const seedCancel = db.prepare('INSERT INTO talabat_orders (id,day,vendor_id,status,cancel_owner,cancel_reason,total,first_seen,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
    db.prepare('INSERT INTO talabat_ratings (day,branch,side,vendor_id,rate,at) VALUES (?,?,?,?,?,?)')
      .run('2026-11-13','التجمع','ours','760858', 4.3, t.clock.now);
    db.prepare('INSERT INTO talabat_closures (day,outlet,state,started_at) VALUES (?,?,?,?)')
      .run('2026-11-14', 'HF_EG;608556', 'CLOSED', cairoToUtc(2026, 11, 14, 22, 30));
    seedCancel.run('10001', '2026-11-14', 'HF_EG;608556', 'CANCELLED', 'Owner: المطعم (Vendor)', 'تأخير بسبب انسكاب الشوربة', 100, t.clock.now, t.clock.now);
    seedCancel.run('10002', '2026-11-14', 'HF_EG;608556', 'CANCELLED', 'Customer', 'انسكاب', 100, t.clock.now, t.clock.now);
    seedCancel.run('10004', '2026-11-15', 'HF_EG;760858', 'REJECTED', null, 'طلب مرفوض', 100, t.clock.now, t.clock.now);
    seedCancel.run('10003', '2026-11-15', 'HF_EG;760858', 'CANCELLED', null, 'تم الإلغاء من قبل المطعم: الصنف غير متاح', 100, t.clock.now, t.clock.now);
    db.prepare('INSERT INTO site_orders (id,day,status,branch,total,created_at) VALUES (?,?,?,?,?,?)')
      .run(10001, '2026-11-14', 'cancelled', 'مدينتي', 120, t.clock.now);
    db.prepare('INSERT INTO site_channels (id,via) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET via=excluded.via').run(10001, 'rest-api');
    db.prepare('INSERT INTO site_orders (id,day,status,branch,total,created_at) VALUES (?,?,?,?,?,?)')
      .run(10002, '2026-11-14', 'cancelled', 'مدينتي', 125, t.clock.now);
    db.prepare('INSERT INTO site_channels (id,via) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET via=excluded.via').run(10002, 'checkout');
    db.prepare('INSERT INTO site_cancel_notes (site_id, reason, at) VALUES (?, ?, ?)').run(10001, 'تم الإلغاء من قبل الفرع: الصنف غير متاح', t.clock.now);
    db.prepare('INSERT INTO site_ratings (order_id,rating,comment,at) VALUES (?,?,?,?)').run(10001, 2, 'تقييم من الموقع', t.clock.now);
    await admin('POST', '/api/cs', { day: '2026-11-14', platform: 'طلبات', branch: 'مدينة نصر', orderNo: '10001', rating: 5, action: 'تمت المتابعة' });
    const lookup = '/api/cs/order?day=2026-11-14&no=10001&platform=';
    assert.equal((await admin('GET', lookup + encodeURIComponent('طلبات'))).body.order.platform, 'طلبات');
    assert.equal((await admin('GET', lookup + encodeURIComponent('الموقع'))).body.order.platform, 'الموقع');
    const token = await t.login(), root = path.join(__dirname, '../../sites/public/admin');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    dom = new JSDOM(html, { url: 'http://localhost/admin/#exports', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; w.sessionStorage.setItem('marsadAdminToken', token); w.MARSAD_API = t.base; w.fetch = (u, o) => fetch(u, o); w.AbortController = AbortController; w.AbortSignal = AbortSignal;
    w.confirm = () => true;
    const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]).filter(f => f !== 'config.js' && fs.existsSync(path.join(root, f)));
    for (const f of scripts) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
    const files = [];
    const grid = w.MarsadXlsx.grid; w.MarsadXlsx.grid = (name, sheets) => { files.push({ name, sheets, blob: grid(null, sheets) }); };
    const until = async (f, what) => { for (let i = 0; i < 400; i++) { if (f()) return; await new Promise(r => setTimeout(r, 15)); } throw Error('UI did not finish: ' + what + ' ' + w.document.getElementById('error').textContent + ' | app hidden=' + w.document.getElementById('app').hidden + ' view=' + [...w.document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id) + ' title=' + w.document.getElementById('title')?.textContent); };
    await until(() => !w.document.getElementById('app').hidden && !w.document.getElementById('view-exports').hidden, 'exports page');
    await until(() => w.document.getElementById('expPeriod').textContent, 'period shown');
    const today = w.document.getElementById('dayToday'), y = w.document.getElementById('day').value;
    assert.ok(y && y === w.document.getElementById('dayTo').value, 'one day: the day before');
    w.document.getElementById('day').value = '2026-11-14'; w.document.getElementById('dayTo').value = '2026-11-15'; w.document.getElementById('applyRange').click();
    await until(() => /14-11-2026.*15-11-2026/.test(w.document.getElementById('expPeriod').textContent), 'period');
    for (const b of w.document.querySelectorAll('[data-exp]')) { const n = files.length; b.click(); await until(() => files.length > n, b.textContent); }
    assert.equal(files.length, 7);
    assert.equal(JSON.stringify(files.map(f => f.sheets.map(x => x.name))), JSON.stringify([['Call center Report'], ['إجمالي الفترة', '2026-11-14', '2026-11-15'], ['النسبه'], ['المتابعة اليومية'],
      ['تفاصيل الإلغاءات', 'نسبه الالغاءات', 'وقت غلق طلبات والتقييم', 'الكومنتات والشكاوي', 'اجمالي'], ['طلبات', 'الموقع'], ['تقييم QA', 'المعايير', 'النسبه', 'Dashboard']]), 'each file with the team\'s own sheets');
    const cc = files[0].sheets[0].rows;
    assert.equal(cc[3][1].v, DAYS['2026-11-14'].full.totals.kinds.Hotline + DAYS['2026-11-15'].full.totals.kinds.Hotline, 'the Hotline orders of the two days');
    const aggregate = Object.values(DAYS).map(d => d.report);
    assert.equal(cc[3][2].v, aggregate.reduce((n, d) => n + d.answered, 0), 'received uses Arabix success count');
    assert.equal(cc[3][5].v, aggregate.reduce((n, d) => n + (d.recordedCalls ?? d.calls), 0), 'incoming includes short abandons');
    const cancellationBook = files.find(f => /^الالغاءات/.test(f.name)).sheets;
    const details = cancellationBook[0].rows;
    assert.equal(details[1].length, 9);
    assert.deepEqual(Array.from(details.slice(2), r => [r[3], r[5]]).sort(), [
      ['APP', 'المنتج غير متوفر'], ['Hotline', 'جوده'], ['Talabat', 'جوده'], ['Talabat', 'رفض من المطعم'], ['Talabat', 'المنتج غير متوفر'], ['Whatsapp', 'المنتج غير متوفر'],
    ].sort());
    assert.equal(details.find(r => r[3] === 'Whatsapp')[4], 'النزهة');
    const rating = cancellationBook[2].rows;
    assert.equal(rating[0].length, 5);
    const historical = rating.find(r => r[0]?.v === '2026-11-14' && r[1] === 'التجمع');
    assert.equal(historical[2], '4.3 (آخر قراءة 13-11-2026)', 'dated fallback within the original rating column');
    const platform = (await admin('GET', '/api/reports/platform-cancels?from=2026-11-14&to=2026-11-15')).body;
    assert.ok(!platform.list.some(r => r.orderNo === '11116'), 'Apex cancellations before driver loading are ignored');
    assert.equal(rating.find(r => r[0]?.v === '2026-11-14' && r[1] === 'مدينه نصر')[4].v, '22:30');
    const summary = cancellationBook[4].rows;
    assert.equal(summary[3][13].v, (22 * 60 + 30) / 1440, 'latest closure stays visible when the final day has none');
    assert.equal(summary[4][9].v, '4.3 (آخر قراءة 13-11-2026)');
    const comments = cancellationBook[3].rows;
    assert.ok(comments.some(r => r[0] === 'تقييم من طلبات' && r[3] === 'تمت المتابعة' && r[5] === 'طلبات'));
    assert.ok(comments.some(r => r[0] === 'تقييم من الموقع' && r[5] === 'الموقع'), 'separate platforms retain the same order ID');
    assert.ok(platform.list.some(r => r.orderNo === '10001' && r.platform === 'APP'));
    assert.ok(!platform.list.some(r => r.platform === 'WEB'));
    assert.equal(platform.list.find(r => r.orderNo === '11115').owner, null, 'contradictory Apex evidence remains unsettled');
    const rates = cancellationBook[1].rows;
    assert.equal(rates.find(r => r[1] === 'مدينه نصر' && r[2] === 'Talabat')[4], 2);
    assert.equal(rates.find(r => r[1] === 'التجمع' && r[2] === 'APP')[5].v, 'غير متاح');
    assert.equal(rates.find(r => r[1] === 'مدينه نصر' && r[2] === 'Whatsapp')[4], 4);
    assert.equal(platform.platformTotals.find(r => r.day === '2026-11-14' && r.branch === 'مدينة نصر' && r.platform === 'Hotline').orders, nasr.kinds.Hotline - 6);
    const q = files.find(f => /^QA1/.test(f.name)).sheets;
    assert.equal(JSON.stringify(q[0].rows.slice(3).map(r => [r[1], r[17].v])), JSON.stringify([['اماني احمد', 1], ['اماني احمد', 0.917]]));
    const cs = files.find(f => /خدمة العملاء/.test(f.name)).sheets[0].rows;
    assert.equal(JSON.stringify(cs[1].slice(1, 6).map(c => c.v)), JSON.stringify([0, 0, 0, 0, 1]), 'Nasr City: one 1-star rating on Talabat');
    assert.ok(cs.some(r => r[4] === '10001' && r[7] === 'تمت المتابعة'), 'platform review retains manual follow-up');
    const website = files.find(f => /خدمة العملاء/.test(f.name)).sheets[1].rows;
    assert.ok(website.some(r => r[4] === '10001' && r[2] === 2), 'matching numeric ID retains the website rating');
    assert.match(cs[1][1].f, /^COUNTIFS\(/, 'counted by a formula from the list');
    if (process.env.REPORT_OUT) for (const f of files) fs.writeFileSync(path.join(process.env.REPORT_OUT, f.name + '.xlsx'), Buffer.from(await f.blob.arrayBuffer()));
  } finally { dom?.window.close(); await t.close(); }
});

test('Talabat ratings (Karim 11-16): ours and the competitor\'s from Talabat\'s public pages; a rating typed by hand stays first', async () => {
  const { ratingFromPage, vendorIdOf } = await import('../src/talabat-ratings.js');
  const page = (rate, branch) => '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"gtmEventData":{"restaurant":{"id":604313,"name":"الدهان","rate":' + rate + ',"totalRatings":1000,"branchName":"' + branch + '"}}}}}</script>';
  assert.deepEqual(ratingFromPage(page(4.4, 'الدهان سيتي ستار')), { rate: 4.4, ratings: 1000, branch: 'الدهان سيتي ستار' });
  assert.equal(vendorIdOf('https://www.talabat.com/ar/egypt/restaurant/503267/al-dahan--tagammoa-5?aid=9668'), '503267');
  const seen = [];
  const t = await start({ at: cairoToUtc(2026, 11, 16, 12, 0), config: { talabatFetch: async url => { seen.push(url); return new Response(/608556/.test(url) ? page(4.4, 'ours') : /503267/.test(url) ? page(4.6, 'rival') : 'blocked', { status: /608556|503267/.test(url) ? 200 : 403 }); } } });
  try {
    const admin = await t.admin();
    await admin('GET', '/api/health'); await new Promise(r => setTimeout(r, 50));
    let cs = (await admin('GET', '/api/cs?from=2026-11-16&to=2026-11-16')).body;
    const r = Object.fromEntries(cs.ratings.map(x => [x.branch, x]));
    assert.equal(r['مدينة نصر'].rating, 4.4); assert.equal(r['التجمع'].competitor, 4.6);
    assert.equal(seen.length, 6, 'our three branches and the competitor\'s');
    assert.ok(seen.some(u => /egypt\/al-dahan-od$/.test(u)), 'the competitor\'s brand page where its branch is not known');
    await admin('POST', '/api/cs/rating', { day: '2026-11-16', branch: 'مدينة نصر', rating: 5 });
    cs = (await admin('GET', '/api/cs?from=2026-11-16&to=2026-11-16')).body;
    assert.equal(cs.ratings.find(x => x.branch === 'مدينة نصر').rating, 5, 'typed by hand wins');
    const bad = await admin('POST', '/api/talabat/rating-pages', { pages: { 'مدينتي': { ours: 'not a link' } } });
    assert.equal(bad.status, 400);
    assert.equal((await admin('POST', '/api/talabat/rating-pages', { pages: { 'مدينتي': { ours: 'https://www.talabat.com/ar/egypt/restaurant/700001/x', rival: '700002' } } })).status, 200);
    const p = (await admin('GET', '/api/talabat/rating-pages')).body;
    assert.deepEqual(p.pages['مدينتي'], { ours: '700001', rival: '700002' });
  } finally { await t.close(); }
});

test('Talabat portal reviews (Karim 11-16): the main screen sends each store\'s reviews; the day\'s average per branch; the negative words listed', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 12, 0), config: { talabatFetch: async () => new Response('x', { status: 403 }) } });
  try {
    const admin = await t.admin();
    const tok = (await admin('POST', '/api/talabat/token')).body.token;
    const at = (h, m) => cairoToUtc(2026, 11, 16, h, m);
    const send = body => t.call('POST', '/api/talabat/reviews', { headers: { 'x-talabat-token': tok }, body });
    assert.equal((await t.call('POST', '/api/talabat/reviews', { body: { vendor: 'HF_EG;608556' } })).status, 401);
    assert.equal((await send({ vendor: 'HF_EG;1', reviews: [] })).status, 400);
    const r = await send({ vendor: 'HF_EG;760858', stats: { rating: 4.3, total: 900 }, reviews: [
      { orderId: '4723779338', at: at(10, 38), rating: 1, text: 'الأكل بارد' }, { orderId: '4722644332', at: at(11, 41), rating: 5, text: 'طعم ممتاز' }, { orderId: '4722644399', at: at(11, 50), rating: 3, text: '' }] });
    assert.equal(r.status, 200);
    const cs = (await admin('GET', '/api/cs?from=2026-11-16&to=2026-11-16')).body;
    assert.equal(cs.talabat.length, 3);
    const tg = cs.ratings.find(x => x.branch === 'التجمع');
    assert.equal(tg.rating, 3, 'the day\'s average of the reviews');
  } finally { await t.close(); }
});

test('orders monitor (Karim 11-16): Apex\'s day closed and no order yet — the monitor says it is reading, so no «مش بيقرا» alert', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 9, 20) });
  try {
    const admin = await t.admin();
    const tok = (await admin('POST', '/api/orders/token')).body.token;
    assert.equal((await t.call('POST', '/api/orders/alive', { body: {} })).status, 401);
    assert.equal((await t.call('POST', '/api/orders/alive', { headers: { 'x-orders-token': tok }, body: {} })).status, 200);
    const live = (await admin('GET', '/api/orders/live')).body;
    assert.equal(live.ageSeconds, 0);
  } finally { await t.close(); }
});

test('performance report groups confirmed complaints and suppresses rates when Apex coverage is partial', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 12, 0) });
  try {
    const admin = await t.admin(), db = t.app.db.raw;
    db.prepare('INSERT INTO orders_days(day,data,received_at) VALUES (?,?,?)').run('2026-11-14',
      JSON.stringify({ branches: [{ name: 'فرع مدينة نصر', orders: 100 }, { name: 'التجمع', orders: 50 }, { name: 'مدينتى', orders: 50 }] }), t.clock.now);
    db.prepare('INSERT INTO orders_days(day,data,received_at) VALUES (?,?,?)').run('2026-11-15',
      JSON.stringify({ branches: [{ name: 'مدينة نصر', orders: 100 }] }), t.clock.now);
    const first = { day: '2026-11-14', branch: 'مدينة نصر', platform: 'طلبات', complaint: 'الأكل بارد', complaintType: 'جودة الأكل',
      department: 'المطبخ', reached: 'تم التواصل', action: 'اعتذار', phone: '01055555555' };
    const saved = await admin('POST', '/api/cs', first);
    assert.equal(saved.status, 200);
    const { complaintType, department, ...oldUi } = first;
    assert.equal((await admin('PUT', '/api/cs', { ...oldUi, id: saved.body.id })).status, 200, 'old CS client keeps saved classifications');
    await admin('POST', '/api/cs', { day: '2026-11-14', branch: 'التجمع', platform: 'الموقع', complaint: 'انسكاب' });
    await admin('POST', '/api/cs', { day: '2026-11-15', branch: 'التجمع', platform: 'الموقع', complaint: 'التأخير في التوصيل' });
    await admin('POST', '/api/cs', { day: '2026-11-14', branch: 'مدينة نصر', platform: 'طلبات', rating: 1, comment: 'rating only' });
    db.prepare('INSERT INTO site_orders (id,day,status,fulfillment,branch,out_at,delivered_at,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(32344, '2026-11-14', 'completed', 'delivery', 'مدينة نصر', t.clock.now - 30 * 60000, t.clock.now, t.clock.now - 60 * 60000);
    db.prepare('INSERT INTO site_dispatch_actors(site_id,actor,at) VALUES (?,?,?)').run(32344, 'extension', t.clock.now);
    const route = '/api/reports/complaint-performance?from=2026-11-14&to=2026-11-15';
    assert.equal((await t.call('GET', route)).status, 401);
    const result = await admin('GET', route);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const d = result.body, nasr = d.branches.find(b => b.name === 'مدينة نصر'), tagamoa = d.branches.find(b => b.name === 'التجمع');
    assert.deepEqual([d.totals.complaints, d.totals.rate, nasr.orders, nasr.rate, tagamoa.rate], [3, null, 200, 0.5, null]);
    assert.equal(nasr.departments[0].labels[0], 'المطبخ');
    assert.equal(nasr.types[0].pct, 100);
    assert.equal(tagamoa.departments[0].labels[0], 'غير محدد');
    assert.deepEqual(tagamoa.types.map(r => [r.labels[0], r.pct]).sort(), [['تأخير التوصيل', 50], ['تغليف أو انسكاب', 50]].sort());
    assert.deepEqual(d.daily.map(r => r.rate), [1, null]);
    assert.deepEqual(d.website.map(r => [r.extensionDispatch, r.unknownDispatch, r.deliveryMinutes]), [[1, 0, 30]]);
    assert.ok(!JSON.stringify(d).includes(first.phone));
  } finally { await t.close(); }
});

test('performance page filters complaint breakdowns and exports separate Excel sheets', async () => {
  const root = path.join(__dirname, '../../sites/public/admin');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { runScripts: 'outside-only' });
  const w = dom.window, $ = id => w.document.getElementById(id);
  try {
    w.eval(fs.readFileSync(path.join(root, 'performance.js'), 'utf8'));
    const elem = (tag, attrs = {}, ...children) => { const e = w.document.createElement(tag); Object.assign(e, attrs); e.append(...children); return e; };
    const no = { name: 'التجمع', complaints: 1, types: [{ labels: ['جودة الأكل'], count: 1, pct: 100 }] };
    const yes = { name: 'مدينة نصر', complaints: 1, types: [{ labels: ['تأخير التوصيل'], count: 1, pct: 100 }] };
    const sample = { branches: [no, yes], totals: { complaints: 2, apexDays: 1 }, days: 1, types: [...no.types, ...yes.types] };
    let exported;
    const page = w.MarsadPerformance({
      api: async url => { if (url.includes('complaint-performance')) return sample; if (url.includes('/api/kpi')) return { team: { calls: 10 }, branches: [], employees: [], supervisors: [] }; return {}; },
      h: elem, $, table: (id, cols, records) => { $(id).textContent = records.map(r => cols.map(c => c.get(r)).join(' ')).join(' '); },
      kpi: (label, value) => elem('p', { textContent: label + ' ' + value }),
      exportSheets: (name, sheets) => { exported = [name, sheets]; }, showError: e => { throw e; },
      state: { day: '2026-11-14', to: '2026-11-14' },
    });
    await page.render();
    assert.match($('performanceTypes').textContent, /جودة الأكل/);
    $('performanceBranch').value = 'مدينة نصر';
    $('performanceBranch').dispatchEvent(new w.Event('change'));
    assert.match($('performanceTypes').textContent, /تأخير التوصيل/);
    assert.doesNotMatch($('performanceTypes').textContent, /جودة الأكل/);
    $('performanceExport').click();
    assert.ok(exported[1].some(([sheet, , rows]) => sheet === 'أنواع الشكاوى' && rows.length === 1));
    assert.ok(exported[1].some(([sheet, , rows]) => sheet === 'مؤشرات الكول سنتر' && rows[0].calls === 10));
  } finally { w.close(); }
});
