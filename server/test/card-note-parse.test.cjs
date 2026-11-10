'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// The card notes staff really write on Apex (seen 05–08/11), typos included.
test('card notes as staff write them: one order, split over orders, a gift in the same line', async () => {
  const { parseApexCustomerNote: p } = await import('../src/apex-customer-notes.js');
  for (const n of ['....خصم 15% ع الاوردر االقادم و الكومنت يتمسح.', 'خصم 15 % ع الارورالقادم.', 'خصم 20% ع الاوردر.', 'خصم 15% والمره القادمه يتمسح.', '.خصم15 % ع الاوردر القادم والكومنت يتمسح.']) {
    const r = p(n);
    assert.equal(r.oneTime, true, n); assert.equal(r.unrecognized, false, n); assert.equal(r.directives[0].kind, 'percent', n);
  }
  assert.equal(p('خصم15% ع الاوردر القادم.').directives[0].value, 15);
  const split = p('.خصم 30 %يتقسمو ع اوردرين والكومنت يتمسح.');
  // Karim 09-11: split over two orders → half now, and the card is rewritten for the next order.
  assert.equal(split.unrecognized, false); assert.equal(split.directives[0].value, 15); assert.equal(split.next.sentence, 'خصم 15% ع الاوردر القادم والكومنت يتمسح.');
  const three = p('خصم 45% يتقسمو ع 3 اوردرات.');
  assert.equal(three.directives[0].value, 15); assert.equal(three.next.sentence, 'خصم 30% يتقسمو ع اوردرين والكومنت يتمسح.');
  assert.equal(p(three.next.sentence).directives[0].value, 15, 'the rewritten note reads the same way');
  assert.equal(p('خصم 30 % يتقسم.').unrecognized, true, 'over how many orders not written → «تواصلت مع العميل»');
  const gift = p('خصم 15 % ع الاوردر القادم واضافه شوربه لسان عصور فرى.');
  assert.deepEqual(gift.directives.map(d => d.kind), ['percent', 'item']); assert.match(gift.directives[1].text, /شوربه لسان عصور/);
  assert.deepEqual(p('.خصم 20% الاوردر القادم وكادو مع الاوردر.').directives.map(d => d.kind), ['percent', 'item']);
  // Karim 10-11: «العميل ليه صنف» however it is written — the dish is found on Apex's menu, with its count, once.
  for (const [n, name, qty] of [['العميل ليه شوربه لسان عصفور فري ع الاوردر القادم', 'شوربة لسان عصفور', 1], ['له 2 ساندوتش كفته هديه', 'ساندوتش كفتة', 2],
    ['يتضاف وجبه فراخ بانيه ع حساب المطعم', 'وجبة فراخ بانية', 1], ['ضيفو ليه اتنين بيبسي فري', 'بيبسى', 2], ['تعويض ليه كبده اسكندراني', 'كبده اسكندرانى', 1], ['ليه ممبار بلاش', 'ممبار', 1]]) {
    const d = p(n).directives.find(x => x.kind === 'item');
    assert.ok(d, n); assert.equal(d.suggest[0].name, name, n); assert.equal(d.qty, qty, n); assert.equal(p(n).oneTime, true, n);
  }
  assert.equal(p('كادو مع الاوردر').directives[0].suggest.length, 0, 'no dish named → the employee picks it');
});
