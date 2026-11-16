'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 11-16: «خدمه العملاء ليهم اكتر من شخص ف يفضل كل يوزر يسجل شغله» / «صفحة خدمة العملاء بس» /
// «الشكوى تتربط بالأوردر» / «التعليقات الايجابيه ... تلقائي».
test('customer service: own accounts see only their page, each line under its writer, complaints tied to the order', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 16, 14, 0, 0) });
  try {
    const admin = await t.admin();
    for (const [name, password] of [['منى', 'mona-pass'], ['هبة', 'heba-pass']])
      assert.equal((await admin('POST', '/api/admin-access', { name, role: 'cs', password, confirmation: password })).status, 200);
    const list = (await admin('GET', '/api/admin-access')).body.accounts;
    assert.deepEqual(list.map(a => a.role), ['cs', 'cs']);
    const as = async p => { const token = await t.login(p); return (m, path, body) => t.call(m, path, { body, headers: { 'x-admin-password': token } }); };
    const mona = await as('mona-pass'), heba = await as('heba-pass');
    assert.equal((await mona('GET', '/api/admin-access')).body.identity.role, 'cs');
    // Nothing outside the customer-service page.
    for (const p of ['/api/employees', '/api/break-requests', '/api/qa', '/api/orders/live', '/api/telegram'])
      assert.equal((await mona('GET', p)).status, 403, p);

    // The day's Apex orders and a Talabat order with its #code (as the cashier and the extension send them).
    const day = '2026-11-16';
    t.app.db.raw.prepare('INSERT INTO orders_days (day, data, received_at) VALUES (?,?,?)').run(day, JSON.stringify({
      online: [{ no: 3230057, sn: 659, branch: 'التجمع', kind: 'طلبات', at: '2026-11-16T13:20:00+02:00', out: '2026-11-16T13:41:00+02:00', user: 'MARSAD', pilot: 'محمود', amount: 300, tag: '5471' }],
      lateOut: [], open: [], cancels: [] }), t.clock.now);
    t.app.db.raw.prepare("INSERT INTO talabat_orders (id, day, store, status, placed_at, received_at, total, code, first_seen, updated_at) VALUES ('900111222', ?, 'الدهان، التجمع الخامس - البنفسج 9,10,11,12', 'DELIVERED', ?, ?, 300, '5471', ?, ?)")
      .run(day, Date.parse('2026-11-16T13:18:00+02:00'), Date.parse('2026-11-16T13:18:00+02:00'), t.clock.now, t.clock.now);
    const look = (await mona('GET', '/api/cs/order?no=659&day=' + day)).body.order;
    assert.equal(look.apexNo, '3230057'); assert.equal(look.branch, 'التجمع'); assert.equal(look.pilot, 'محمود');
    // Talabat's #code finds the same Apex order (through the Talabat ↔ Apex match).
    const byCode = (await mona('GET', '/api/cs/order?no=5471&day=' + day)).body.order;
    assert.equal(byCode.platform, 'طلبات'); assert.equal(byCode.apexNo, '3230057'); assert.equal(byCode.employee, 'MARSAD');

    // A complaint with only the Apex serial: the branch comes from the order.
    const c = await mona('POST', '/api/cs', { day, platform: 'طلبات', orderNo: '659', complaint: 'الأكل وصل بارد', reached: 'تم التواصل', phone: '01001234567' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.link.employee, 'MARSAD');
    await heba('POST', '/api/cs', { day, platform: 'الكول سنتر', branch: 'مدينة نصر', comment: 'شكر للطيار' });
    const g = (await mona('GET', '/api/cs?from=' + day + '&to=' + day)).body;
    const mine = g.entries.find(e => e.complaint);
    assert.equal(mine.by, 'منى'); assert.equal(mine.branch, 'التجمع'); assert.equal(mine.link.sn, '659');
    assert.equal(g.entries.find(e => !e.complaint).by, 'هبة');
    // Each changes only their own line; the admin any, and the line keeps its writer.
    assert.equal((await heba('PUT', '/api/cs', { ...mine, id: mine.id, complaint: 'x' })).status, 403);
    assert.equal((await heba('DELETE', '/api/cs', { id: mine.id })).status, 403);
    assert.equal((await admin('PUT', '/api/cs', { ...mine, id: mine.id, action: 'اعتذار' })).status, 200);
    assert.equal((await mona('GET', '/api/cs?from=' + day + '&to=' + day)).body.entries.find(e => e.id === mine.id).by, 'منى');

    // Positive comments by themselves: 5 stars with words on Talabat.
    t.app.db.raw.prepare("INSERT INTO talabat_reviews (order_id, vendor, branch, day, at, rating, text, seen_at) VALUES ('900111333','HF_EG;760858','التجمع',?,?,5,'أحلى كشري',?), ('900111444','HF_EG;760858','التجمع',?,?,5,NULL,?), ('900111555','HF_EG;760858','التجمع',?,?,2,'بارد',?)")
      .run(day, t.clock.now, t.clock.now, day, t.clock.now, t.clock.now, day, t.clock.now, t.clock.now);
    const pos = (await mona('GET', '/api/cs?from=' + day + '&to=' + day)).body.positive;
    assert.deepEqual(pos.map(p => p.comment), ['أحلى كشري']);
    // A viewer reads the page but writes nothing.
    await admin('POST', '/api/admin-access', { name: 'Sara', role: 'viewer', password: 'viewer-pass', confirmation: 'viewer-pass' });
    const sara = await as('viewer-pass');
    assert.equal((await sara('GET', '/api/cs?from=' + day + '&to=' + day)).status, 200);
    assert.equal((await sara('POST', '/api/cs', { day, platform: 'طلبات', branch: 'التجمع', comment: 'x' })).status, 403);
    // A cs account can be turned back into a supervisor.
    const id = list.find(a => a.name === 'هبة').id;
    await admin('PATCH', '/api/admin-access', { id, role: 'supervisor' });
    assert.equal((await admin('GET', '/api/admin-access')).body.accounts.find(a => a.id === id).role, 'supervisor');
  } finally { await t.close(); }
});

// Karim 11-16 «الجودة مع الشكاوى»: the call of a customer who complained, and the call that took a complained order, first.
test('quality review: calls tied to a customer-service complaint are suggested first', async () => {
  const { phKey } = require('../src/perf.js');
  const day = '2026-11-11', T = (h, m = 0) => cairoToUtc(2026, 11, 11, h, m);
  const t = await start({ at: T(23, 30) });
  try {
    const admin = await t.admin();
    const sara = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const calls = Array.from({ length: 8 }, (_, i) => ({ key: day + '|' + sara.id + '|' + T(20, i), employeeId: sara.id, at: T(20, i), durationSeconds: 60, queue: '601', phoneEnd: '00' + i,
      phk: i === 7 ? phKey('01001234567') : phKey('0100000000' + i), flags: i < 6 ? ['repeat', 'long'] : [] }));
    t.app.perfDay = async d => ({ calls: d === day ? calls : [] });
    await admin('POST', '/api/cs', { day, platform: 'الكول سنتر', branch: 'التجمع', complaint: 'الأوردر ناقص', phone: '+20 100 123 4567' });
    const q = (await admin('GET', '/api/qa?week=' + day)).body;
    assert.equal(q.calls[0].key, calls[7].key);
    assert.equal(q.calls[0].flagLabels[0], 'العميل اشتكى لخدمة العملاء');
    assert.ok(!('phk' in q.calls[0]), 'the number key stays on the server');
  } finally { await t.close(); }
});
