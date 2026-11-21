'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('the queue translates names, addresses and notes in their own context and keeps the original', async () => {
  const t = await start({ at: Date.now() });
  const real = global.fetch;
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'A', code: 'E9', pin: '123' });
    const s = (await t.call('POST', '/api/transfer/login', { body: { pin: '123' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{ id: '3977700001', store: 'الدهان، التجمع الخامس', status: 'ACCEPTED', placedAt: new Date().toISOString(), total: 200,
      customer: { name: 'Ismail Baraka', phone: '01000000001', address: 'infront of katameya dunes، التجمع الخامس — الدور: 2' }, detail: { receivedAt: new Date().toISOString(), bill: [{ k: 'ملاحظة العميل', text: 'ملاحظة العميل | please call me when you arrive' }] } }] } });
    const q = async () => (await t.call('GET', '/api/transfer/queue', { headers: { 'x-transfer-session': s } })).body.orders.find(o => o.ref === '3977700001');
    let o = await q();
    assert.match(o.customer.address, /^أمام قطامية ديونز/); assert.match(o.customer.original, /infront of katameya dunes/);
    // Known names and delivery instructions are translated locally even when a key is configured.
    t.app.config.openaiKey = 'test-key'; let asked = 0;
    global.fetch = async (url, opt) => {
      if (String(url).startsWith('https://api.openai.com/')) { asked++; const txt = JSON.parse(opt.body).messages[1].content;
        const ar = /Ismail/.test(txt) ? 'إسماعيل بركة' : /dunes/.test(txt) ? 'أمام قطامية ديونز، التجمع الخامس — الدور: 2' : 'كلمني لما توصل';
        return new Response(JSON.stringify({ choices: [{ message: { content: ar } }] }), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return real(url, opt);
    };
    await q(); await new Promise(r => setTimeout(r, 50));
    o = await q();
    assert.equal(asked, 0);
    assert.equal(o.customer.name, 'إسماعيل بركة');
    assert.equal(o.note, 'من فضلك كلمني لما توصل');
    assert.equal(o.noteOriginal, 'please call me when you arrive');
    const n = asked; await q(); await new Promise(r => setTimeout(r, 30)); assert.equal(asked, n, 'translated once');
  } finally { global.fetch = real; await t.close(); }
});


test('offline dictionary preserves negative instructions, numbers and explicit addon quantities', async () => {
  const t = await start();
  try {
    const d = t.app.arabicDictionary;
    assert.equal(d("don't ring the bell"), 'متضربش الجرس');
    assert.equal(d('no onions'), 'من غير بصل');
    assert.equal(d('no 12'), 'رقم 12');
    assert.equal(d('3× extra bread'), '3× عيش زيادة');
    assert.equal(d('please call me when you arrive'), 'من فضلك كلمني لما توصل');
    assert.equal(d('Ismail Baraka'), 'إسماعيل بركة');
  } finally { await t.close(); }
});

// 11-16 Talabat #1574: «Replace Tahini with Yogurt Salads» was printed spelled out in Arabic letters; «Omar Ibn El Khattab» half English.
test('translate: a dish choice in Arabic, nothing spelled out; a known street in Arabic', async () => {
  const { setup } = await import('../src/translate.js');
  const app = { db: {}, config: {} }; setup(app);
  const n = app.toArabicNote(['Replace Tahini with Yogurt Salads', 'Make it Halal style']);
  assert.equal(n.get('Replace Tahini with Yogurt Salads'), 'بدل طحينة حط سلطة زبادي');
  assert.equal(n.get('Make it Halal style'), 'Make it Halal style');
  assert.equal(app.toArabicAddress(['Building 116, Omar Ibn El Khattab']).get('Building 116, Omar Ibn El Khattab'), 'عمارة 116، عمر بن الخطاب');
});


test('translation preserves address labels, codes, negation and the direction of a substitution', async () => {
  const { setup } = await import('../src/translate.js');
  const app = { db: {}, config: {} }; setup(app);
  const addresses = [
    ['Madinaty B12, Group 124, Bldg. 59, 2nd floor, Apt. 41', 'مدينتي B12، مجموعة 124، عمارة 59، الدور 2، شقة 41'],
    ['12 Makram Ebeid St., behind City Stars, door code 08-29', '12، شارع مكرم عبيد، خلف سيتي ستارز، كود الباب 08-29'],
    ['Al Fashn, The Waterway, West-12, Gate B2', 'Al Fashn، ذا ووتر واي، West-12، بوابة B2'],
  ];
  assert.deepEqual([...app.toArabicAddress(addresses.map(([raw]) => raw)).values()], addresses.map(([, ar]) => ar));
  const notes = [
    ['Please do not ring the doorbell; call me when you arrive', 'من فضلك ماتضربش الجرس | كلمني لما توصل'],
    ['Swap rice for fries, sauce on the side', 'بدل أرز حط بطاطس، الصوص على جنب'],
    ['Do not replace the rice with fries', 'ماتبدّلش أرز بـ بطاطس'],
    ['I am allergic to peanuts and sesame', 'عندي حساسية من فول سوداني و سمسم'],
    ['Don’t add any garlic, 2x extra bread', 'ماتحطش ثوم، 2x عيش زيادة'],
    ['Call 01001234567 before arriving', 'اتصل 01001234567 قبل ما توصل'],
    ['kalemni lama twsal | bedon basal', 'كلمني لما توصل | من غير بصل'],
  ];
  assert.deepEqual([...app.toArabicNote(notes.map(([raw]) => raw)).values()], notes.map(([, ar]) => ar));
});
