'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { areaInAddress } = require('../src/apex-areas.js');

// Karim 11-14: website orders all went to «شارع الطاقة»; the address names the Apex area.
test('area from the address: the Apex area named in a website address', () => {
  const L = [[5, 'اول مكرم.'], [9, 'شارع الطاقه.'], [19, 'مكرم عبيد.'], [48, 'يوسف عباس.'], [51, 'الحي العاشر.'], [153, 'الحديقه الدوليه.'], [156, 'امتداد مكرم.'], [354, 'التجمع الخامس طلبات']]
    .map(([no, name]) => ({ no, name, branch: no === 354 ? 1 : 2 }));
  assert.equal(areaInAddress('عمارة 37، 37 مكرم عبيد', L, 2), 19);
  assert.equal(areaInAddress('الحي العاشر 1 ش ايهاب عزت بلوك 2 برج بانوراما، عمارة 1', L, 2), 51);
  assert.equal(areaInAddress('الدور الحديقة الدولية، شقة الحديقة الدولية', L, 2), 153);
  assert.equal(areaInAddress('10 شارع عثمان عبدالحفيظ متفرع من شارع يوسف عباس، عمارة 10', L, 2), 48);
  assert.equal(areaInAddress('سوبر ماركت بيم الحي العاشر', L, 2), 51);
  assert.equal(areaInAddress('عمارة 10، 10 حسن ابراهيم متفرع من حسنين هيكل', L, 2), null, 'no area named: left to the usual choice');
  assert.equal(areaInAddress('بجوار بنزين طاقه', L, 2), null);
  assert.equal(areaInAddress('التجمع الخامس فيلا 3', L, 2), null, 'another branch\'s area is not taken');
});

// Karim 11-15 «منت عارف مناطق ابيكس»: the Apex area named inside Talabat's / the website's area (real names, 11-01..15).
test('area from the platform area name: the Apex area inside it', () => {
  const L = [[52, 'عين شمس', 2, 42.5], [136, 'الخليفة المامون', 2, 34.5], [141, 'ميدان تريومف', 2, 34.5], [149, 'المطرية', 2, 42.5], [158, 'جسر السويس', 2, 34.5], [228, 'قباء', 2, 28.95],
    [218, 'التجمع  الخامس', 1, 54.15], [354, 'التجمع الخامس طلبات', 1, 54.15], [331, 'الرحاب', 1, 34.77], [357, 'الرحاب طلبات', 1, 34.77], [364, 'جاردينيا سيتي', 1, 46.5], [371, 'الشروق', 3, 52.63],
    [234, 'المقطم', 2, 49.5], [345, '.المقطم', 2, 43.86], [366, 'المقطم طلبات', 2, 49.5]].map(([no, name, branch, service]) => ({ no, name, branch, service }));
  const { areaGroups } = require('../src/apex-areas.js');
  const g = areaGroups(L), tal = l => /طلبات/.test(l.name), site = l => !/طلبات/.test(l.name);
  assert.equal(areaInAddress('مصر الجديدة - ميدان تريومف', L, null, g, tal), 141);
  assert.equal(areaInAddress('مصر الجديدة - الخليفة المأمون', L, null, g, tal), 136);
  assert.equal(areaInAddress('التجمع الخامس - الياسمين 4', L, null, g, tal), 354, 'Talabat: the «طلبات» spelling');
  assert.equal(areaInAddress('التجمع الخامس - الياسمين 4', L, null, g, site), 218, 'website: the plain one');
  assert.equal(areaInAddress('الرحاب وما حولها', L, null, g, tal), 357);
  assert.equal(areaInAddress('كومبوند جاردينيا سيتي', L, null, g, tal), 364);
  assert.equal(areaInAddress('جسر السويس وقباء', L, null, g, tal), 158, 'the longest name');
  assert.equal(areaInAddress('الشروق - المنطقة الثامنة‎‎', L, null, g, tal), 371);
  assert.equal(areaInAddress('المقطم', L, null, g, tal), null, 'two Apex «المقطم» with different fees: left to staff');
  assert.equal(areaInAddress('مدينة نصر', L, null, g, tal), null);
});
