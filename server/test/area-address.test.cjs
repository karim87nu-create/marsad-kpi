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
