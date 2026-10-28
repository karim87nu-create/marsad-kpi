'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('talabat: monitor key, orders with details, Apex match (auto and manual), alerts', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 30 * 60000 });
  try {
    const admin = await t.admin();
    const emp = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    await admin('PUT', '/api/apex-names', { apexName: 'sara.m', employeeId: emp.id });
    assert.equal((await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': 'x' }, body: {} })).status, 401);
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    assert.match(token, /^tal_[a-f0-9]{48}$/);
    t.app.apexDetails = async () => ({ extra: () => '\n💬 ملاحظة الأوردر: بدون بصل', status: () => { throw new Error('Talabat must not append Apex status'); } });
    const push = orders => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders } });
    // List only first: the server asks for the details.
    let r = await push([{ id: '3977400001', store: 'الدهان، التجمع الخامس - البنفسج', status: 'ACCEPTED', placedAt: at(0), total: 300 },
      { id: '3977400002', store: 'الدهان, مدينتي - ساوث بارك', status: 'ACCEPTED', placedAt: at(2), total: 120 },
      { id: '3977400003', store: 'الدهان, مدينتي - ساوث بارك', status: 'CANCELLED', placedAt: at(5), total: 323 }]);
    assert.deepEqual(r.body.want.sort(), ['3977400001', '3977400002', '3977400003']);
    r = await push([
      { id: '3977400001', status: 'ACCEPTED', detail: { receivedAt: at(0), acceptSeconds: 31, acceptedAt: at(0.5), items: [{ qty: 2, name: 'Kofta', price: 280 }], subtotal: 280, deliveryType: 'Vendor delivery', billable: 'PAYABLE' } },
      { id: '3977400002', status: 'ACCEPTED', detail: { receivedAt: at(2), acceptSeconds: 9, acceptedAt: at(2.2), items: [{ qty: 1, name: 'Rice', price: 120 }], subtotal: 120 } },
      { id: '3977400003', status: 'CANCELLED', detail: { receivedAt: at(5), acceptSeconds: 9, acceptedAt: at(5.2), pickedUpAt: at(7), cancelledAt: at(25), cancelOwner: 'Owner: Customer', cancelReason: 'Unable to find or reach customer', items: [], subtotal: 323 } }]);
    assert.deepEqual(r.body.want, [], 'just read');
    t.advance(61000);
    assert.deepEqual((await push([])).body.want.sort(), ['3977400001', '3977400002'], 'open orders read again a minute later; the cancelled one is final');
    // Apex: one Talabat order entered at Tagamoa 3 minutes after acceptance; nothing for Madinaty.
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online: [
      { no: 7001, kind: 'طلبات', branch: 'التجمع', at: at(3.5), user: 'sara.m', amount: 280 },
      { no: 7002, kind: 'طلبات', branch: 'مدينتي', at: at(-5), user: 'ahmed', amount: 999 }] } });
    let d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    let o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977400001'].apex, null, 'time and money alone are not confirmation');
    assert.equal(o['3977400001'].matching.state, 'tentative');
    await admin('POST', '/api/talabat/link', { talabatId: '3977400001', apexNo: 7001 });
    assert.equal(o['3977400002'].apex, null, '7002 was entered before the order existed');
    assert.equal(o['3977400003'].cancelReason, 'Unable to find or reach customer');
    assert.deepEqual(o['3977400001'].items, [{ qty: 2, name: 'Kofta', price: 280 }]);
    // Manual link.
    assert.equal((await admin('POST', '/api/talabat/link', { talabatId: '3977400002', apexNo: 7002 })).status, 200);
    d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body; o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['3977400002'].apex, null, 'manual proposal cannot override missing evidence or time conflict');
    assert.equal(d.unmatchedApex.length, 2);
    // Alerts: the cancellation to the branches group; 3977400002 was unmatched > 10 min at the earlier push.
    const kinds = t.app.db.raw.prepare("SELECT kind, target FROM telegram_log WHERE kind LIKE 'talabat%' ORDER BY kind").all();
    assert.deepEqual(kinds.map(k => k.kind + ':' + k.target), ['talabatCancel:branches']);
  } finally { await t.close(); }
});

test('talabat: a #code cannot bypass complete evidence; sure links teach the branch name; unknown values are kept', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 90 * 60000 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = body => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body });
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    const online = [];
    for (let i = 0; i < 3; i++) online.push({ no: 8000 + i, kind: 'طلبات', branch: 'التجمع', at: at(i * 10 + 3), user: 'u', amount: 113, tag: '#' + (2700 + i), customer: { name: 'Customer ' + i, phone: '01012345678', address: 'Tagamoa 5' }, items: [{ name: 'Rice', no: 42, qty: 1, price: 100 }] });
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online } });
    await push({ codes: [0, 1, 2].map(i => ({ id: '39770000' + i + '0', code: String(2700 + i), store: 'الدهان، التجمع الخامس' })) });
    await push({ orders: [0, 1, 2].map(i => ({ id: '39770000' + i + '0', store: 'الدهان، التجمع الخامس', status: 'MYSTERY', placedAt: at(i * 10), customer: { name: 'Customer ' + i, phone: '01012345678', address: 'Tagamoa 5' }, detail: { receivedAt: at(i * 10), acceptedAt: at(i * 10 + 0.5), items: [{ name: 'Rice', qty: 1, price: 113 }], subtotal: 113, milestones: { DISPLAYED_AT_VENDOR: at(i * 10), RIDER_NEAR: at(i * 10 + 3) } } })) });
    t.advance(31000); await push({ orders: [] });
    const d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    for (const o of d.orders) assert.equal(o.apex?.how, 'code', o.id);
    const l = (await admin('GET', '/api/learned')).body;
    assert.ok(l.facts.some(f => f.kind === 'match-v2:branch:talabat' && f.a === 'الدهان، التجمع الخامس' && f.b === 'التجمع' && f.evidence === 3), 'learned the branch name');
    assert.ok(l.facts.some(f => f.kind === 'unknown' && f.b === 'حالة: MYSTERY'));
    assert.ok(l.facts.some(f => f.kind === 'unknown' && f.b === 'خطوة: RIDER_NEAR'));
    // Now a Talabat order with no #code: «Tagamoa Branch» is accepted as the same branch (names share no word).
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online: [...online, { no: 8100, kind: 'طلبات', branch: 'Tagamoa Branch', at: at(52), user: 'u', amount: 100 }] } });
    await push({ orders: [{ id: '3977009990', store: 'الدهان، التجمع الخامس', status: 'ACCEPTED', placedAt: at(50), detail: { receivedAt: at(50), acceptedAt: at(50.3) } }] });
    const d2 = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    assert.equal(d2.orders.find(o => o.id === '3977009990').apex, null, 'learned branch alone cannot confirm identity');
  } finally { await t.close(); }
});

test('talabat: «accepted and not on Apex» is answered when it is entered on Apex', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 60000 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    const push = orders => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders } });
    const apex = online => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online } });
    await apex([]);
    await push([{ id: '3977400009', store: 'الدهان، التجمع الخامس - البنفسج', status: 'ACCEPTED', placedAt: at(0), total: 113,
      detail: { customer: { name: 'Customer One', phone: '01012345678', address: 'Tagamoa 5' }, receivedAt: at(0), acceptSeconds: 30, acceptedAt: at(0.5), items: [{ name: 'White Rice', qty: 1, price: 113 }], subtotal: 113 } }]);
    t.advance(11 * 60000); await apex([]); await push([]);
    assert.ok(t.app.db.raw.prepare("SELECT 1 FROM telegram_log WHERE key = 'talabat:notEntered:3977400009'").get());
    t.advance(2 * 60000);
    await apex([{ no: 3526900, sn: 512, kind: 'طلبات', branch: 'التجمع', at: at(12), user: 'sara.m', amount: 113, sourceRefs: { talabat: { orderId: '3977400009' } }, customer: { name: 'Customer One', phone: '01012345678', address: 'Tagamoa 5' }, items: [{ name: 'ارز سادة', no: '0103007', qty: 1, price: 100 }] }]);
    await push([]);
    const rep = t.app.db.raw.prepare("SELECT text, reply_to FROM telegram_log WHERE key = 'resolved:talabat:notEntered:3977400009'").get();
    assert.equal(rep.reply_to, 'talabat:notEntered:3977400009');
    assert.match(rep.text, /اتأكدت مطابقته على Apex/); assert.ok(!rep.text.includes('512')); assert.match(rep.text, /بعد 12 دقيقة من القبول/);
    assert.ok(!rep.text.includes('3526900'), 'never the internal number');
  } finally { await t.close(); }
});

test('talabat: a list row counts with the time shown on it (yesterday stays yesterday); the exact time from the details wins', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 21, 0, 0), at = (h, m) => new Date(cairoToUtc(2026, 10, 22, h, m, 0)).toISOString();
  const t = await start({ at: t0 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = orders => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders } });
    await push([{ id: '4676900101', status: 'PICKED UP', listAt: at(20, 31) }, { id: '4676900102', status: 'COMPLETED', listAt: new Date(cairoToUtc(2026, 10, 21, 23, 10, 0)).toISOString() }]);
    const row = id => t.app.db.raw.prepare('SELECT day, placed_at FROM talabat_orders WHERE id = ?').get(id);
    assert.equal(row('4676900101').day, '2026-10-22'); assert.equal(row('4676900102').day, '2026-10-21');
    const d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    assert.deepEqual(d.orders.map(o => o.id), ['4676900101'], 'shown before its details were read');
    const exact = cairoToUtc(2026, 10, 22, 20, 31, 17);
    await push([{ id: '4676900101', status: 'PICKED UP', placedAt: new Date(exact).toISOString(), detail: { items: [] } }]);
    assert.equal(row('4676900101').placed_at, exact);
    await push([{ id: '4676900101', status: 'PICKED UP', listAt: at(20, 31) }]);
    assert.equal(row('4676900101').placed_at, exact, 'the list minute never replaces the exact second');
  } finally { await t.close(); }
});

test('talabat: bare and partial codes need full evidence; past days get codes later; one name per branch', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 21, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 60 * 60000 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    const push = body => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body });
    // Two Nasr City orders a minute apart: by time alone they would be swapped; the codes decide.
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', online: [
      { no: 3526864, sn: 651, kind: 'طلبات', branch: 'مدينة نصر', at: at(1), user: 'a', amount: 700 },
      { no: 3526865, sn: 653, kind: 'طلبات', branch: 'مدينة نصر', at: at(2), user: 'b', amount: 113, customer: { name: 'Customer One', phone: '01012345678', address: 'Nasr City' }, items: [{ name: 'Rice', no: 42, qty: 1, price: 100 }] }] } });
    await push({ codes: [{ id: '4676900301', code: '8698' }, { id: '4676900302', code: '8403' }] });
    await push({ orders: [{ id: '4676900301', store: 'الدهان سيتي ستار مول، مكرم عبيد', status: 'ACCEPTED', placedAt: at(0), customer: { name: 'Customer One', phone: '01012345678', address: 'Nasr City' }, detail: { acceptedAt: at(0.2), subtotal: 113, items: [{ name: 'Rice', qty: 1, price: 113 }] } },
      { id: '4676900302', store: 'El Dahan, Makram Ebeid', status: 'ACCEPTED', placedAt: at(0.5), detail: { acceptedAt: at(0.7), subtotal: 700, items: [] } }] });
    // The codes come later (the monitor's archive pass): «8698» and «843».
    const r = await t.call('POST', '/api/orders/tags', { headers: { 'x-orders-token': ot }, body: { day: '2026-10-22', tags: { 3526864: '843', 3526865: '8698' } } });
    assert.equal(r.body.updated, 2);
    const d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body, o = Object.fromEntries(d.orders.map(x => [x.id, x]));
    assert.equal(o['4676900301'].apex.no, 3526865); assert.equal(o['4676900301'].apex.how, 'code');
    assert.equal(o['4676900302'].apex, null, 'zero-stripped code alone is tentative');
    assert.ok(['tentative','ambiguous'].includes(o['4676900302'].matching.state));
    assert.deepEqual([...new Set(d.orders.map(x => x.store))], ['مدينة نصر'], 'Arabic and English store names are one branch');
  } finally { await t.close(); }
});
