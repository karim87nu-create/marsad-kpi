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

test('Talabat Pro note: «[tPro free delivery].» and its Arabic never reach the comment (Karim 11-11, Apex notes)', async () => {
  const { stripPlatformNotes, deliveryComment } = await import('../src/delivery-fields.js');
  const assert = require('node:assert/strict');
  assert.equal(deliveryComment({ note: '[tPro free delivery].', items: [] }), '');
  assert.equal(deliveryComment({ note: '[تبرو فري دليفري]. | طحينة', items: [] }), 'طحينة');
  assert.equal(stripPlatformNotes('زود طحينة | [tPro free delivery].'), 'زود طحينة');
  assert.equal(stripPlatformNotes('برونزي من غير بصل'), 'برونزي من غير بصل');
});

test('website comment (Karim 11-11): no «مصدر الطلب: موقع الدهان», free choices by the dish\'s name', async () => {
  const { deliveryComment } = await import('../src/delivery-fields.js');
  const assert = require('node:assert/strict');
  assert.equal(deliveryComment({ source: 'site', note: 'مصدر الطلب: موقع الدهان', items: [{ name: 'كفتة مشوية', freeOptions: ['خبز بلدي'] }] }), 'كفتة مشوية: خبز بلدي');
  assert.equal(deliveryComment({ source: 'site', note: 'مصدر الطلب: موقع الدهان | من غير بصل', items: [] }), 'من غير بصل');
});

// Karim 11-14, from orders as Apex showed them that night.
test('address on Apex: the building first, no empty floor/flat labels, no repeats, Apex-safe letters', async () => {
  const { deliveryAddress } = await import('../src/delivery-fields.js');
  const assert = require('node:assert/strict');
  assert.deepEqual(deliveryAddress('طريق بدون اسم، مبنى: ڤيلا 205، الدور: الارضي، الشقة: البيزمنت'), { floor: 'الارضي', flat: 'البيزمنت', street: 'طريق بدون اسم، فيلا 205' });
  assert.deepEqual(deliveryAddress('المحلية السادسة، مبنى: عمارة 19، الدور:، الشقة:'), { floor: '', flat: '', street: 'المحلية السادسة، عمارة 19' });
  assert.equal(deliveryAddress('هاى تاون 1 ب، مبنى: هاى تاون 1 ب، الدور: الارضى').street, 'هاى تاون 1 ب');
  assert.equal(deliveryAddress('165، - البنفسج 1، 2، 3، 4، مبنى: 165 البنفسج 4', 'البنفسج 1').street, 'عمارة 165 البنفسج 4');
  const w = deliveryAddress('التسعين الجنوبي ، كمباوند سوديك ايست تاون، عمارة 32C، الدور 2، شقة 21، التجمع الخامس.', 'التجمع الخامس');
  // Karim 11-14: the compound / place in the area or the main street first, then the building, landmarks last.
  assert.deepEqual(w, { floor: '2', flat: '21', street: 'كمباوند سوديك ايست تاون، التسعين الجنوبي، عمارة 32C' });
  assert.equal(deliveryAddress('عبد الرحمن صدقي، مبنى: 31').street, 'عبد الرحمن صدقي، عمارة 31');
  assert.equal(deliveryAddress('سكن مصر مسلسل 8، بجانب نادى المهندسين، مبنى: عماره 20').street, 'سكن مصر مسلسل 8، عماره 20، بجانب نادى المهندسين');

});
test('comment on Apex: no choice-group headings or «(ضمن الوجبة)», website meta lines dropped, dish names', async () => {
  const { deliveryComment, deliveryLabel } = await import('../src/delivery-fields.js');
  const assert = require('node:assert/strict');
  assert.equal(deliveryComment({ source: 'site', note: 'فرع الاستلام: مدينة نصر', items: [{ name: 'حواوشي كومبو', freeOptions: ['اختيارات السلطة المجانية: طحينة × 2 (ضمن الوجبة)'] }] }), 'حواوشي كومبو: طحينة ×2');
  assert.equal(deliveryComment({ source: 'talabat', note: '', items: [{ name: 'Kofta', freeOptions: ['رول'] }, { name: 'Rice', freeOptions: [] }] }), 'رول');
  assert.equal(deliveryComment({ source: 'talabat', note: '', items: [{ name: 'Kofta', freeOptions: ['سلطة طحينة'] }, { name: 'Rice', freeOptions: ['رول'] }] }), 'الصنف 1: سلطة طحينة | الصنف 2: رول');
  assert.equal(deliveryLabel('// ', 'talabat', 'paid', '5223'), 'عميل/طلبات/مدفوع/#5223');
  assert.equal(deliveryLabel('محمد /', 'talabat', 'cash', '1207'), 'محمد/طلبات/كاش/#1207');
});

// Karim 11-14 (Apex 702803 / 702805 printed «نص فرخة مشوية: اختيارات السلطة…»): whatever the page sends, Apex gets the choice only.
test('the website\'s free-choice wording never reaches Apex', async () => {
  const { compactDeliveryComment } = await import('../src/delivery-fields.js');
  assert.equal(compactDeliveryComment('نص فرخة مشوية: اختيارات السلطة المجانية: طحينة (ضمن الوجبة)', 200), 'نص فرخة مشوية: طحينة');
  assert.equal(compactDeliveryComment('صدور مشوية: اختيارات السلطة المجانية: طحينة × 4 (ضمن الوجبة)', 200), 'صدور مشوية: طحينة ×4');
  assert.equal(compactDeliveryComment('بدون بصل | كفتة: اختيارات السلطة: بابا غنوج', 200), 'بدون بصل | كفتة: بابا غنوج');
});
