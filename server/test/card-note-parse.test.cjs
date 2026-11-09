'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// The card notes staff really write on Apex (seen 05–08/11), typos included.
test('card notes as staff write them: one order, split over two, a gift in the same line', async () => {
  const { parseApexCustomerNote: p } = await import('../src/apex-customer-notes.js');
  for (const n of ['....خصم 15% ع الاوردر االقادم و الكومنت يتمسح.', 'خصم 15 % ع الارورالقادم.', 'خصم 20% ع الاوردر.', 'خصم 15% والمره القادمه يتمسح.', '.خصم15 % ع الاوردر القادم والكومنت يتمسح.']) {
    const r = p(n);
    assert.equal(r.oneTime, true, n); assert.equal(r.unrecognized, false, n); assert.equal(r.directives[0].kind, 'percent', n);
  }
  assert.equal(p('خصم15% ع الاوردر القادم.').directives[0].value, 15);
  const split = p('.خصم 30 %يتقسمو ع اوردرين والكومنت يتمسح.');
  assert.equal(split.unrecognized, true, 'split over two orders is not guessed'); assert.equal(split.oneTime, false);
  const gift = p('خصم 15 % ع الاوردر القادم واضافه شوربه لسان عصور فرى.');
  assert.deepEqual(gift.directives.map(d => d.kind), ['percent', 'item']); assert.match(gift.directives[1].text, /شوربه لسان عصور/);
  assert.deepEqual(p('.خصم 20% الاوردر القادم وكادو مع الاوردر.').directives.map(d => d.kind), ['percent', 'item']);
});
