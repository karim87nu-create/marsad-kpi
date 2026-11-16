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
  assert.equal(itemRule({ name: 'عرض وجبة كفته' }), '218');
  assert.equal(itemRule({ name: 'بيتزا سلامي' }), null);
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
