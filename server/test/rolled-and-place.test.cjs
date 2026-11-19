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

// Karim 11-19 «لسه فيه فرق في طريقه الكومنتات بين الموقع وطلبات»: the same comment for both sources.
test('comments: Talabat and the website written the same way', async () => {
  const { deliveryComment, shortenChoiceParts } = await import('../src/delivery-fields.js');
  const talabat = deliveryComment({ source: 'talabat', items: [{ name: 'Mixed Grill', apex: [{ no: '1', name: 'ميكس جريل' }], apexPick: '1', freeOptions: ['سلطة طحينة'] }, { name: 'Half Chicken', apex: [{ no: '2', name: 'نص فرخة مشوية' }], apexPick: '2', freeOptions: ['سلطة بابا غنوج'] }] });
  const site = deliveryComment({ source: 'site', items: [{ name: 'ميكس جريل', apex: [{ no: '1', name: 'ميكس جريل' }], apexPick: '1', freeOptions: ['طحينة'] }, { name: 'نص فرخة', apex: [{ no: '2', name: 'نص فرخة مشوية' }], apexPick: '2', freeOptions: ['بابا غنوج'] }] });
  assert.equal(talabat, 'ميكس: طحينة | فرخة: بابا'); assert.equal(site, talabat);
  assert.equal(shortenChoiceParts('الصنف 1: سلطة بابا غنوج | الصنف 2: طحينة سلطة'), 'الصنف 1: بابا | الصنف 2: طحينة', 'translated late');
  const words = 'ارجو ان يكون التسويه زياده والكفته متحمره كويس وارسال السلطه طحينه وبابا غنوج';
  assert.equal(shortenChoiceParts(words), words, "the customer's own sentence is never changed");
});
