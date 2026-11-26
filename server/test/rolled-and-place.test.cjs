'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rolled } = require('../src/transfer.js');
const { decide } = require('../src/autotransfer.js');
const { areaGroups } = require('../src/apex-areas.js');

// Karim 11-19: a rolled sandwich is the «ملفوف» item with no comment; a combo keeps the comment.
test('rolled sandwiches: the ملفوف item, no comment; a combo keeps the word', () => {
  const r = rolled({ name: 'ساندوتش شيش طاووق', apex: [{ no: '0104007' }], apexPick: '0104007', freeOptions: ['عيش سوري', 'طحينة'], modifiers: [] });
  assert.equal(r.apexPick, '0104008'); assert.deepEqual(r.freeOptions, ['طحينة']);
  const roll = rolled({ name: 'Kofta Sandwich Roll', apex: [{ no: '0104001' }], freeOptions: [], modifiers: [] });
  assert.equal(roll.apexPick, '0104002');
  const combo = rolled({ name: 'ساندوتش كفتة كومبو', apex: [{ no: '0104003' }], apexPick: '0104003', freeOptions: ['ملفوف'], modifiers: [] });
  assert.equal(combo.apexPick, '0104003'); assert.deepEqual(combo.freeOptions, ['ملفوف']);
  const plain = rolled({ name: 'ساندوتش كفتة', apex: [{ no: '0104001' }], apexPick: '0104001', freeOptions: ['طحينة'], modifiers: [] });
  assert.equal(plain.apexPick, '0104001');
});

// Karim 11-19 (Madinaty address sent to Nasr City): the customer's words naming a branch's place pick the branch.
test('website branch from the customer place, not from an area Apex lists for another branch', () => {
  const NOW = Date.parse('2026-11-19T17:00:00Z');
  const locations = [{ no: 361, name: 'مدينتي', branch: 2, service: 39.47 }, { no: 370, name: 'مدينتى', branch: 3, service: 39.47 }];
  const o = { source: 'site', ref: '1', code: '1', at: new Date(NOW - 5 * 60000).toISOString(), apexBranch: null, payment: 'cash', detailRead: true,
    customer: { name: 'حسين', phone: '01000000001', address: 'B12, عمارة 59، مجموعة 124', siteArea: 'مدينتي' }, areaGuess: { no: 361, seen: 3 }, discounts: [], bill: [],
    items: [{ qty: 1, name: 'كفتة', price: 100, modifiersComplete: true, apex: [{ no: '0108004' }], addons: [] }], apexCustomerNote: { status: 'none', checkedAt: new Date(NOW - 60000).toISOString() } };
  const d = decide(o, { now: NOW, locations, groups: areaGroups(locations) });
  assert.equal(d.ok, true, d.why.join()); assert.equal(d.body.branchNo, 3); assert.equal(d.body.locationNo, 370);
});

// Karim 11-19: the same comment for both sources; any rewording of the choices only from the admin page.
test('comments: Talabat and the website written the same way; choice words only from the admin list', async () => {
  const { deliveryComment, applyChoiceWords } = await import('../src/delivery-fields.js');
  const talabat = deliveryComment({ source: 'talabat', items: [{ name: 'Mixed Grill', apex: [{ no: '1', name: 'ميكس جريل' }], apexPick: '1', freeOptions: ['سلطة طحينة'] }, { name: 'Half Chicken', apex: [{ no: '2', name: 'نص فرخة مشوية' }], apexPick: '2', freeOptions: ['سلطة بابا غنوج'] }] });
  const site = deliveryComment({ source: 'site', items: [{ name: 'ميكس جريل', apex: [{ no: '1', name: 'ميكس جريل' }], apexPick: '1', freeOptions: ['سلطة طحينة'] }, { name: 'نص فرخة', apex: [{ no: '2', name: 'نص فرخة مشوية' }], apexPick: '2', freeOptions: ['سلطة بابا غنوج'] }] });
  assert.equal(talabat, 'ميكس: سلطة طحينة | فرخة: سلطة بابا غنوج', 'no built-in rewording'); assert.equal(site, talabat);
  const P = [{ from: 'سلطة طحينة', to: 'طحينة' }, { from: 'سلطة بابا غنوج', to: 'بابا' }, { from: 'ضمن الوجبة', to: '' }];
  assert.equal(applyChoiceWords(talabat, P), 'ميكس: طحينة | فرخة: بابا');
  assert.equal(applyChoiceWords('الصنف 1: سلطه طحينه ضمن الوجبه', P), 'الصنف 1: طحينة');
  const words = 'ارجو ان يكون التسويه زياده والكفته متحمره كويس وارسال السلطه طحينه وبابا غنوج';
  assert.equal(applyChoiceWords(words, P), words, "the customer's own sentence is never changed");
  assert.equal(applyChoiceWords(talabat, []), talabat);
});

// Karim 11-19 (#4251, Apex 706024): add-ons per dish on Talabat's live screen are made per line when the subtotal says so.
test('add-ons counted for all the dishes (3 pigeons, each with ممبار and ورق عنب)', () => {
  const { perDish } = require('../src/transfer.js');
  const it = [{ qty: 3, name: 'Stuffed Pigeon', price: 762, options: [{ qty: 1, name: 'ممبار', price: 106 }, { qty: 1, name: 'ورق عنب', price: 101 }], modifiers: ['1× ممبار', '1× ورق عنب'] }, { qty: 1, name: 'كفتة', price: 0, options: [{ qty: 1, name: 'ربع كيلو', price: 319 }] }];
  const r = perDish(it, 1702);
  assert.deepEqual(r[0].options.map(o => [o.qty, o.price]), [[3, 318], [3, 303]]);
  assert.deepEqual(perDish(it, 1288)[0].options.map(o => [o.qty, o.price, o.qtyBasis]), [[1, 106, 'line'], [1, 101, 'line']]);
  const mixed = [it[0], { qty: 2, name: 'كفتة', price: 200, options: [{ qty: 2, name: 'طحينة', price: 30 }] }];
  const read = perDish(mixed, 1613);
  assert.deepEqual(read.flatMap(i => i.options.map(o => [o.qty, o.price, o.qtyBasis])), [[3, 318, 'line'], [3, 303, 'line'], [2, 30, 'line']]);
  const tied = [{ ...mixed[1] }, { ...mixed[1] }];
  assert.deepEqual(perDish(tied, 490), tied, 'a subtotal that fits either dish does not prove either count');
  assert.equal(perDish(it, 0), it);
});

test('the items-gap guard is off unless set from the admin page (11-12: price differences do not stop)', () => {
  const { TUNE } = require('../src/tune.js');
  assert.equal(TUNE.itemsGapPct, 0);
});

// Karim 11-19 (#4251, Apex 706024: «ع 244 الاندلس 1، 244 الاندلس 1 - …» and the landmark lost).
test('address: the building once, the landmark to the special mark, not read as the flat', async () => {
  const { deliveryAddress, splitAddressLandmark } = await import('../src/delivery-fields.js');
  const a = deliveryAddress('244 الاندلس ١ - التجمع الثالث - امام ماونتن ديونز، القاهرة — مبنى: 244 الاندلس ١ — الدور: 3 — الشقة: 6 — علامة مميزة: امام شقة 6, ماونتن ديونز شارع جانبي خلفي مش الرئيسي', ['التجمع الخامس طلبات']);
  assert.equal(a.floor, '3'); assert.equal(a.flat, '6');
  assert.equal(a.street, '244 الاندلس ١ - التجمع الثالث - امام ماونتن ديونز');
  assert.match(a.mark, /^امام شقة 6.*مش الرئيسي$/);
  assert.deepEqual(splitAddressLandmark(a.street), { street: '244 الاندلس ١ - التجمع الثالث', landmark: 'امام ماونتن ديونز' });
});

// Karim 11-19 review of the day's Apex addresses and comments.
test('addresses and comments from the day on Apex', async () => {
  const { deliveryAddress, deliveryComment } = await import('../src/delivery-fields.js');
  const st = (a, z = ['التجمع الخامس طلبات']) => deliveryAddress(a, z).street;
  assert.equal(st('التجمع الاول البنفسج 3 فيلا 69، مبنى: 69'), 'التجمع الاول البنفسج 3 فيلا 69', 'the villa number once');
  assert.equal(st('طريق بدون اسم، مبنى: 229'), 'عمارة 229');
  assert.equal(st('مبنى: 0، امام الجامعة'), 'امام الجامعة', 'no «عمارة 0»');
  assert.equal(st('التجمع الخامس/حي الدبلوماسيين /شارع جمال عبد الناصر'), 'حي الدبلوماسيين، شارع جمال عبد الناصر', 'the website\'s «/» parts, the area once');
  assert.equal(deliveryComment({ items: [{ name: 'صينيه اللمه', freeOptions: ['طحينة | بابا غنوج', 'ثومية'] }], note: 'إضافة خبز | اضافة خبز' }), 'إضافة خبز | اللمه: طحينة/بابا غنوج/ثومية');
});
