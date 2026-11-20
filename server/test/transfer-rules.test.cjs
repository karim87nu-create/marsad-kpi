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
