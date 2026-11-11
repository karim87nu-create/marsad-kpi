const test = require('node:test');
const assert = require('node:assert/strict');
const { deliveryPhone, deliveryLabel, deliveryAddress, deliveryComment } = require('../src/delivery-fields.js');
const { customerOf, phoneKey } = require('../src/order-match.js');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('international phone survives presentation without becoming a matching key', () => {
  assert.equal(deliveryPhone('٠٠٩٦٦ ٥٠١٢٣٤٥٦٧'), '+966501234567');
  assert.equal(deliveryPhone('+123456789012345'), '+123456789012345');
  assert.equal(deliveryPhone('+96650***4567'), '');
  const c = customerOf({ phone: '+966501234567' });
  assert.equal(c.phoneDisplay, '+966501234567');
  assert.equal(c.phone, '');
  assert.equal(phoneKey('+201012345678'), '1012345678');
});
test('name first, current hashtag last, within Apex field', () => {
  const label = deliveryLabel('محمد '.repeat(20) + '#1', 'talabat', 'cash', '12345');
  assert.ok(label.startsWith('محمد'));
  assert.ok(label.endsWith('#12345'));
  assert.ok(label.length <= 50);
});
test('compact address preserves street and separate floor/flat', () => {
  assert.deepEqual(deliveryAddress('عمارة 12 شارع القاهرة، التجمع الخامس، محافظة القاهرة، مصر — الدور: 3 — الشقة: 14', 'التجمع الخامس'),
    { street: 'عمارة 12 شارع القاهرة', floor: '3', flat: '14' });
  assert.deepEqual(deliveryAddress('12 Main Street, floor: 3, flat: 14, Cairo, Egypt'),
    { street: '12 Main Street', floor: '3', flat: '14' });
});
test('comment includes customer instructions and free choices, not product marketing or paid additions', () => {
  const note = deliveryComment({ note: 'اتصل عند الوصول | Talabat Pro customer', items: [
    { name: 'اسم صنف طويل جدا', freeOptions: ['بدون بصل'], addons: [{ name: 'جبنة', qty: 2 }] },
    { name: 'اسم آخر', freeOptions: ['عيش زيادة'] }
  ] });
  assert.equal(note, 'اتصل عند الوصول | الصنف 1: بدون بصل | الصنف 2: عيش زيادة');
});
test('international customer reaches transfer queue from actual Talabat ingestion', async () => {
  const now = cairoToUtc(2026, 10, 22, 20, 10, 0), t = await start({ at: now });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const token = (await admin('POST', '/api/talabat/token')).body.token;
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{
      id: '3977500099', store: 'الدهان، التجمع الخامس - البنفسج', status: 'ACCEPTED', placedAt: new Date(now - 60000).toISOString(), total: 100,
      detail: { customer: { name: 'محمد', phone: '+966501234567', address: 'شارع 9' }, items: [{ name: 'Kofta', qty: 1, price: 100, modifierRead: true, modifierComplete: true }], bill: [] }
    }] } });
    const session = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const q = await t.call('GET', '/api/transfer/queue?day=2026-10-22', { headers: { 'x-transfer-session': session } });
    assert.equal(q.status, 200);
    assert.equal(q.body.orders[0].customer.phone, '+966501234567');
  } finally { await t.close(); }
});

test('Talabat Pro / free delivery lines never reach the order comment (Karim 11-11)', async () => {
  const { stripPlatformNotes } = await import('../src/delivery-fields.js');
  for (const [inp, out] of [
    ['طلبات برو توصيل مجاني', ''], ['طلبات برو - توصيل مجاني', ''], ['Talabat Pro customer', ''], ['Free delivery for Talabat Pro customers', ''],
    ['اتصل قبل ما توصل - طلبات برو توصيل مجاني', 'اتصل قبل ما توصل'], ['توصيل مجاني، من غير بصل', 'من غير بصل'], ['عميل طلبات برو: الشقة 4', 'الشقة 4'],
    ['من غير بصل', 'من غير بصل']]) assert.equal(stripPlatformNotes(inp), out, inp);
  assert.equal(deliveryComment({ note: 'طلبات برو توصيل مجاني', items: [{ name: 'x', freeOptions: ['سلطة بلدي'] }] }), 'سلطة بلدي');
});

test('a note under a Talabat dish reaches the transfer page and the order comment (Karim 11-11, #753)', async () => {
  const now = cairoToUtc(2026, 11, 11, 11, 10, 0), t = await start({ at: now });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const token = (await admin('POST', '/api/talabat/token')).body.token;
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{
      id: '4712756256', store: 'الدهان سيتي ستار مول، مكرم عبيد', status: 'ACCEPTED', placedAt: new Date(now - 60000).toISOString(), total: 256.63,
      detail: { customer: { name: 'M & K', phone: '01204749876', address: 'صلاح سالم 10' }, items: [{ name: 'عرض وجبة نص دجاجة مشوية', qty: 1, price: 299, note: '** عايز سلطه زبادي بدل البطاطس ومخلل بدل طحينه', modifierRead: true, modifierComplete: true }], bill: [] }
    }] } });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const o = (await t.call('GET', '/api/transfer/queue?day=2026-11-11', { headers: { 'x-transfer-session': sara } })).body.orders.find(x => x.ref === '4712756256');
    assert.equal(o.items[0].note, 'عايز سلطه زبادي بدل البطاطس ومخلل بدل طحينه');
    assert.equal(deliveryComment(o), 'عايز سلطه زبادي بدل البطاطس ومخلل بدل طحينه');
  } finally { await t.close(); }
});
