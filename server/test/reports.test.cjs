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
    const token = await t.login(), root = path.join(__dirname, '../../sites/public/admin');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    dom = new JSDOM(html, { url: 'http://localhost/admin/#exports', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; w.sessionStorage.setItem('marsadAdminToken', token); w.MARSAD_API = t.base; w.fetch = (u, o) => fetch(u, o);
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
      ['تحليل الأسباب', 'تفاصيل الإلغاءات', 'نسبه الالغاءات', 'وقت غلق طلبات والتقييم', 'الكومنتات والشكاوي', 'اجمالي'], ['طلبات', 'الموقع'], ['تقييم QA', 'المعايير', 'النسبه', 'Dashboard']]), 'each file with the team\'s own sheets');
    const cc = files[0].sheets[0].rows;
    assert.equal(cc[3][1].v, DAYS['2026-11-14'].full.totals.kinds.Hotline + DAYS['2026-11-15'].full.totals.kinds.Hotline, 'the Hotline orders of the two days');
    const q = files.find(f => /^QA1/.test(f.name)).sheets;
    assert.equal(JSON.stringify(q[0].rows.slice(3).map(r => [r[1], r[17].v])), JSON.stringify([['اماني احمد', 1], ['اماني احمد', 0.917]]));
    const cs = files.find(f => /خدمة العملاء/.test(f.name)).sheets[0].rows;
    assert.equal(JSON.stringify(cs[1].slice(1, 6).map(c => c.v)), JSON.stringify([0, 0, 0, 0, 1]), 'Nasr City: one 1-star rating on Talabat');
    assert.match(cs[1][1].f, /^COUNTIFS\(/, 'counted by a formula from the list');
    if (process.env.REPORT_OUT) for (const f of files) fs.writeFileSync(path.join(process.env.REPORT_OUT, f.name + '.xlsx'), Buffer.from(await f.blob.arrayBuffer()));
  } finally { dom?.window.close(); await t.close(); }
});
