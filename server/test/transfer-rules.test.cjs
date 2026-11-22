'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Karim 11-16: the areas and dishes he confirmed.
test('transfer rules: confirmed areas and dishes', async () => {
  const { areaRule, itemRule } = await import('../src/transfer-rules.js');
  const a = (w, s = 'talabat') => areaRule(w, s);
  assert.equal(a('التجمع الخامس - الياسمين 8').no, 354);
  assert.equal(a('2 التجمع الخامس - امتداد المستثمرين الشمالية').no, 354);
  assert.equal(a('التجمع الخامس غرب الجولف قطامية هايتس').no, 354);
  assert.equal(a('التجمع الأول - ميراج سيتي').no, 355);
  assert.equal(a('التجمع 3').no, 356);
  assert.equal(a('الشروق - الحي الثاني شرق').no, 371);
  assert.equal(a('الشروق - الحي السابع').no, 371, '11-20 #5972: the city first decides, not مدينة نصر\'s «الحي السابع»');
  assert.equal(a('مدينتي - الحي السابع').no, 370);
  assert.equal(a('الشروق - المنطقة الثامنة‎‎').no, 371);
  assert.equal(a('مدينتي - منطقة الفيلات (ف4)').no, 370);
  assert.equal(a('عباسية 3').no, 26);
  assert.equal(a('الزيتون - كوبري القبة').no, 46);
  assert.equal(a('الزيتون - الاميرية الشمالية').no, 151);
  assert.equal(a('مدينة نصر - ذاكر حسين').no, 49);
  assert.equal(a('مدينة نصر - الماسة').no, 241);
  assert.equal(a('مصر الجديدة - البارون').no, 159);
  assert.equal(a('مصر الجديدة - الحرية').no, 359);
  assert.equal(a('2 مساكن شيراتون - نادي الجلاء').no, 33);
  assert.deepEqual(a('مدينة نصر'), { general: true });
  assert.deepEqual(a('مصر الجديدة', 'site'), { general: true });
  assert.equal(a('مصر والسودان', 'site').no, 148);
  assert.equal(a('عين شمس والزيتون', 'site').no, 151);
  assert.deepEqual(a('المستقبل', 'site'), { no: 371, addAddress: 'المستقبل' });
  assert.equal(a('التجمع الاول', 'site').no, 332);
  assert.equal(a('التجمع الأول - ميراج سيتي', 'site'), null, 'Talabat rules are for Talabat');
  assert.equal(itemRule({ name: 'بطاطس محمرة' }), '0103005');
  assert.equal(itemRule({ name: 'سفن آب' }), '0202002');
  assert.equal(itemRule({ name: 'ميرندا برتقال علب' }), '0202003');
  assert.equal(itemRule({ name: 'سلطة خضراء' }), '0101002');
  assert.equal(itemRule({ name: 'Kebab Sandwich', freeOptions: ['ملفوف'] }), '0104011');
  assert.equal(itemRule({ name: 'Kebab Sandwich', freeOptions: ['بلدي'] }), '0104010');
  assert.equal(itemRule({ name: 'طبق كباب وكفتة ضانى', sizeOption: 'ربع كيلو' }), '0109011');
  for (const [name, no] of [
    ['عرض وجبة كفته', '0116001'], ['عرض وجبه كفتة طلبات', '0116001'], ['Kofta Meal Offer', '0116001'],
    ['عرض ربع كيلو كفته طلبات', '218'], ['1/4 Grilled Kofta Offer', '218'],
    ['عرض وجبة كفتة وملوخية طلبات', '315'], ['عرض تلت كفتة وملوخية', '315'], ['Kofta and Molokhia Meal Offer', '315'],
  ]) assert.equal(itemRule({ name }, 'talabat'), no, name);
  assert.equal(itemRule({ name: 'عرض وجبة كفتة' }, 'site'), null);
  assert.equal(itemRule({ name: 'بيتزا سلامي' }), null);
});

test('audited catalog dishes retain their Apex codes by source, offer, and weight', async () => {
  const { itemRule } = await import('../src/transfer-rules.js');
  const { knownNos } = await import('../src/items.js');
  const { siteApexItems } = await import('../src/site-items.js');
  const { APEX_NAMES } = await import('../src/menu-seed.js');
  for (const [name, no, size] of [
    ['عرض ربع كفتة مشوية', '218'], ['عرض الحواوشى', '111'],
    ['Kofta Meal', '0109004'], ['Grilled Kofta', '0108004', 'ربع كيلو'],
    ['Veal Ribs', '0108031', 'تلت كيلو'], ['Shish Tawook Meal', '0109009'],
    ['Shish Tawook Meal Offer', '0116004'], ['Large Mixed Grill Platter Offer', '0116010'],
    ['Large Mixed Grill Platter', '0109020'], ['Tarb Sandwich Combo', '0104024'],
    ['ساندويتش طرب ملفوف', '0104023'],
  ]) assert.equal(itemRule({ name, size }, 'talabat'), no, name);
  assert.deepEqual(knownNos('Kofta Sandwich Combo'), ['0104003']);
  assert.deepEqual(knownNos('Kofta Sandwich'), ['0104001']);
  assert.deepEqual(knownNos('Kofta Meal'), ['0109004']);
  assert.deepEqual(knownNos('Veal Ribs'), ['0108029', '0108030', '0108031', '0108032']);
  for (const [name, no] of [
    ['عرض كفتة مشوية وفر 91 جنيه', '0117069'], ['عروض الدهان ربع كفته و ارز بسمتي', '0115016'],
    ['عروض الدهان كفتة وملوخية', '0117065'],
  ]) {
    assert.equal(siteApexItems(name).pick, no);
    assert.equal(itemRule({ name }, 'site'), null);
  }
  const apexName = new Map(Object.entries(APEX_NAMES));
  assert.equal(siteApexItems('ريش بتلو - ربع كيلو', { size: [null, /1\/3/], apexName }).pick, '0108031');
  apexName.delete('0108031');
  assert.deepEqual(siteApexItems('ريش بتلو - ربع كيلو', { size: [null, /1\/3/], apexName }).nos, []);
});

test('auto transfer: a confirmed area goes, and «المستقبل» is written in the address', async () => {
  const { decide } = await import('../src/autotransfer.js');
  const now = Date.parse('2026-11-16T19:30:00+02:00');
  const o = { source: 'site', ref: '9', code: '9', at: new Date(now - 3 * 60000).toISOString(), apexBranch: 3, payment: 'cash', items: [{ name: 'بطاطس', qty: 1, price: 50, apex: [{ no: '0103005' }] }],
    customer: { name: 'أ', phone: '01000000000', address: 'عمارة 5', siteArea: 'المستقبل' }, areaGuess: { no: 371, seen: 0, how: 'rule', addAddress: 'المستقبل' },
    apexCustomerNote: { status: 'none', checkedAt: new Date(now - 60000).toISOString() } };
  const d = decide(o, { now, locations: [{ no: 371, name: 'الشروق', branch: 3, service: 40 }] });
  assert.deepEqual(d.why || [], []);
  assert.equal(d.body.locationNo, 371);
  assert.equal(d.body.customer.address, 'عمارة 5 - المستقبل');
});

test('auto transfer uses the assigned branch pickup even before the daily areas arrive', async () => {
  const { decide } = await import('../src/autotransfer.js');
  const now = Date.parse('2026-11-20T19:30:00+02:00');
  const base = { ref: '9', code: '9', at: new Date(now - 180000).toISOString(), apexBranch: 2,
    fulfillment: 'pickup', payment: 'cash', customer: { name: 'عميل', phone: '01000000000' },
    subtotal: 50, items: [{ name: 'بطاطس', qty: 1, price: 50, modifiersComplete: true, apex: [{ no: '0103005' }] }],
    apexCustomerNote: { status: 'none', checkedAt: new Date(now - 60000).toISOString() } };
  for (const source of ['site','talabat']) {
    const verdict = decide({ ...base, source }, { now, locations: [] });
    assert.deepEqual(verdict.why, []);
    assert.equal(verdict.body.locationNo, 268);
  }
  assert.deepEqual(decide({ ...base, source: 'site', apexBranch: null }, { now, locations: [] }).why, ['الفرع مش واضح']);
});


test('Gardenia City and Taj Sultan use the receiving branch area and preserve the compound in the address', async () => {
  const { decide } = await import('../src/autotransfer.js');
  const { compoundArea } = await import('../src/transfer-rules.js');
  const locations = [{ no: 332, name: 'التجمع الأول', branch: 1, service: 40 }, { no: 355, name: 'التجمع الأول طلبات', branch: 1, service: 40 },
    { no: 218, name: 'التجمع الخامس', branch: 1, service: 40 }, { no: 364, name: 'جاردينيا سيتي', branch: 1, service: 46.5 },
    { no: 410, name: 'كومبوند جاردينيا سيتي', branch: 2, service: 43 }, { no: 411, name: 'تاج سلطان', branch: 2, service: 44 },
    { no: 412, name: 'تاج سلطان طلبات', branch: 2, service: 44 }];
  assert.deepEqual(compoundArea('Building 5, Gardenia City', 'مصر الجديدة', 'talabat', 1, locations), { no: 355, addAddress: 'جاردينيا سيتي' });
  assert.deepEqual(compoundArea('عمارة 5', 'تاج سلطان', 'site', 1, locations), { no: 332, addAddress: 'تاج سلطان' });
  assert.deepEqual(compoundArea('Building 5, Gardenia City', '', 'site', 2, locations), { no: 410, addAddress: 'جاردينيا سيتي' });
  assert.deepEqual(compoundArea('عمارة 5', 'Tag-Sultan', 'talabat', 2, locations), { no: 412, addAddress: 'تاج سلطان' });
  assert.deepEqual(compoundArea('عمارة 5', 'تاج سلطان', 'site', 3, locations), { no: null, addAddress: 'تاج سلطان' });
  assert.equal(compoundArea('كمبوند تاج سيتي', '', 'site', 1, locations), null);
  const now = Date.parse('2026-11-21T20:00:00+02:00');
  const order = { source: 'site', ref: '9', code: '9', at: new Date(now - 1000).toISOString(),
    apexBranch: 1, payment: 'cash', items: [{ name: 'بطاطس', qty: 1, price: 50, apex: [{ no: '0103005' }] }],
    customer: { name: 'أحمد', phone: '01000000000', address: 'عمارة 5، شارع 7', siteArea: 'تاج سلطان' },
    areaGuess: { no: 218, seen: 7, share: 1 }, apexCustomerNote: { status: 'none', checkedAt: new Date(now - 1000).toISOString() }
  };
  const verdict = decide(order, { now, locations });
  assert.deepEqual(verdict.why, []);
  assert.equal(verdict.body.locationNo, 332);
  assert.match(verdict.body.customer.address, /^كمبوند تاج سلطان/);
  const nasr = decide({ ...order, apexBranch: 2 }, { now, locations });
  assert.deepEqual(nasr.why, []);
  assert.deepEqual([nasr.body.branchNo, nasr.body.locationNo], [2, 411]);
  assert.match(nasr.body.customer.address, /^كمبوند تاج سلطان/);
  const { formatDeliveryAddress } = await import('../src/delivery-fields.js');
  assert.match(formatDeliveryAddress(nasr.body.customer.address, { apexArea: 'تاج سلطان', sourceArea: 'تاج سلطان' }).main, /^كمبوند تاج سلطان/);
  assert.match(decide({ ...order, apexBranch: 3 }, { now, locations }).why.join(' '), /تاج سلطان.*محتاجة تحديد/);
  assert.ok(decide({ ...order, apexBranch: null }, { now, locations }).why.includes('الفرع مش واضح'));
});

test('website transfer queue and manual confirmation use the same receiving branch compound area', async () => {
  const { start } = require('./helpers.cjs');
  const now = Date.parse('2026-11-21T20:00:00+02:00'), day = '2026-11-21';
  const t = await start({ at: now });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const session = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const { token: siteKey } = (await admin('POST', '/api/talabat/token')).body;
    const { token: apexKey } = (await admin('POST', '/api/orders/token')).body;
    const locations = [{ no: 332, name: 'التجمع الأول', branch: 1, service: 40 }, { no: 411, name: 'تاج سلطان', branch: 2, service: 44 },
      { no: 15, name: 'منطقة أخرى', branch: 2, service: 44 }];
    assert.equal((await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': apexKey }, body: { day, online: [], locations } })).status, 200);
    const order = { id: 40101, status: 'app-preparing', stage: 1, createdAt: now / 1000 - 120, branchAssignedAt: now / 1000 - 90, fulfillment: 'delivery', branchId: 'nasr-city', branchName: 'مدينة نصر',
      paymentMethod: 'كاش', total: 344, customer: { name: 'عميل', phone: '01012345678', address: 'كمبوند تاج سلطان، عمارة 5' }, items: [{ name: 'ورق عنب', quantity: 1, total: 300 }] };
    assert.equal((await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': siteKey }, body: { board: 'central', orders: [order] } })).status, 200);
    t.advance(9000);
    const headers = { 'x-transfer-session': session };
    const q = (await t.call('GET', '/api/transfer/queue?day=' + day, { headers })).body.orders.find(o => o.ref === '40101');
    assert.ok(q, 'the order reaches the transfer queue');
    assert.equal(q.areaGuess.no, 411);
    assert.deepEqual(q.compound, { name: 'تاج سلطان', areas: { 1: 332, 2: 411, 3: null } });
    const confirm = locationNo => t.call('POST', '/api/transfer/job', { headers, body: { source: 'site', ref: '40101', action: 'entered', payment: 'cash', branchNo: 2, locationNo } });
    assert.match((await confirm(15)).body.error, /تاج سلطان/);
    assert.equal((await confirm(411)).status, 200);
  } finally { await t.close(); }
});
