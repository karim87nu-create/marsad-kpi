'use strict';
// The live-order data (Talabat's page store) → bill lines: who funds each discount, never Talabat by default (Karim 10-11, #655).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../extension-3/talabat-monitor.js'), 'utf8');
const fromState = new Function(src.slice(src.indexOf('const money2 ='), src.indexOf('const statePushed')) + '; return fromState;')();
const lines = o => fromState({ externalId: 1, payment: { itemsTotalPrice: 300.9, total: 250.06 }, ...o }).detail.bill.filter(x => /خصم|discount|voucher/i.test(x.k)).map(x => x.text);

test('live order discounts: the sponsor decides; unknown or missing sponsors are asked, never taken as Talabat\'s', () => {
  assert.deepEqual(lines({ items: [{ name: 'X', discounts: [{ amount: 90.27, sponsorships: [{ sponsor: 'VENDOR', amount: 45.14 }, { sponsor: 'PLATFORM', amount: 45.13 }] }] }], discounts: [{ name: 'Item discounts', value: -90.27 }] }),
    ['خصم ممول من قبلك | -45.14', 'خصم ممول من قبل Talabat | -45.13']);
  assert.deepEqual(lines({ items: [{ name: 'X', discounts: [{ amount: 90.27, sponsorships: [{ sponsor: 'RESTAURANT', amount: 45.14 }, { sponsor: 'SOMETHING_NEW', amount: 45.13 }] }] }], discounts: [{ name: 'خصم 30%', value: 90.27 }] }),
    ['خصم ممول من قبلك | -45.14', 'خصم على الأصناف | -45.13'], 'an unknown sponsor is asked; the order line with the same total is not counted twice');
  assert.deepEqual(lines({ items: [{ name: 'X', discounts: [{ value: 90.27 }] }], discounts: [{ name: 'Discount', value: 90.27 }] }), ['خصم على الأصناف | -90.27'], 'no sponsors → asked');
  assert.deepEqual(lines({ items: [{ name: 'X' }], discounts: [{ name: 'Voucher', value: 100 }] }), ['Voucher | -100']);
});
