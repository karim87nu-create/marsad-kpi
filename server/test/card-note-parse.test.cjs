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

// Karim 10-11: «مش عايز اختلاف كتابه أو لهجه أو خطأ في السياق يبقي مش مفهوم».
test('card notes in any wording: numbers in words, «على N اوردرات», «الجاية», and a dish is put in only when sure', async () => {
  const { parseApexCustomerNote: p } = await import('../src/apex-customer-notes.js');
  const same = (n, value, orders, sentence) => {
    const r = p(n), d = r.directives[0];
    assert.equal(r.unrecognized, false, n); assert.equal(r.oneTime, true, n); assert.equal(d.value, value, n);
    if (orders) { assert.equal(d.split.orders, orders, n); assert.equal(r.next.sentence, sentence, n); }
  };
  same('خصم ستين في الميه على اوردرين', 30, 2, 'خصم 30% ع الاوردر القادم والكومنت يتمسح.');
  same('خصم ٦٠٪ يتقسم على اوردرين', 30, 2, 'خصم 30% ع الاوردر القادم والكومنت يتمسح.');
  same('خصم 60% علي طلبين', 30, 2, 'خصم 30% ع الاوردر القادم والكومنت يتمسح.');
  same('خصم 90% على 3 اوردرات', 30, 3, 'خصم 60% يتقسمو ع اوردرين والكومنت يتمسح.');
  same('خصم 90% يتقسم ع تلات اوردرات', 30, 3, 'خصم 60% يتقسمو ع اوردرين والكومنت يتمسح.');
  same('خصم 100 جنيه يتقسمو ع اوردرين', 50, 2, 'خصم 50 جنيه ع الاوردر القادم والكومنت يتمسح.');
  for (const n of ['الاوردر الجاي خصم 20%', 'خصم 20% المره الجايه', 'خصم 20% اول اوردر جاي', 'خصم 20 بالمية للاوردر الجاى', 'خصم عشرين في الميه ع الاوردر الجاي']) same(n, 20);
  // Each rewritten note is read again the same way until the last share.
  let note = 'خصم 90% على 3 اوردرات', shares = [];
  while (note) { const r = p(note); shares.push(r.directives[0].value); note = r.next?.sentence && r.directives[0].split ? r.next.sentence : ''; }
  assert.deepEqual(shares, [30, 30, 30]);
  // Karim 14-11 «فيه حاجات اتطبقت مره وحده مع انها علي مرتين» — real cards read 14-11.
  same('خصم 30% على مرتين', 15, 2, 'خصم 15% ع الاوردر القادم والكومنت يتمسح.');
  same('خصم 100 جنيه ع مرتين والكومنت يتمسح', 50, 2, 'خصم 50 جنيه ع الاوردر القادم والكومنت يتمسح.');
  same('..خصم 15 % يتقسمو ع اورد والكومنت يتمسح.', 7.5, 2, 'خصم 7.5% ع الاوردر القادم والكومنت يتمسح.');
  const each = p('خصم 45% كل اوردر 15%.');
  assert.equal(each.directives[0].value, 15, 'never 45% at once'); assert.equal(each.permanent, false); assert.equal(each.oneTime, true);
  assert.equal(each.next.note, 'خصم 30% كل اوردر 15%.');
  assert.equal(p(each.next.note).next.note, 'خصم 15% ع الاوردر القادم والكومنت يتمسح.');
  // The whole discount on each of N orders, the card counting down (before: kept on the card for ever).
  note = 'خصم 20% لمده 3 اوردارات .'; shares = [];
  while (note) { const r = p(note); shares.push(r.directives[0].value); assert.equal(r.oneTime, true, note); note = r.next ? r.next.note : ''; }
  assert.deepEqual(shares, [20, 20, 20]);
  assert.equal(p('خصم 20% لمده اوردرين').directives[0].value, 20);
  assert.equal(p('العميل زعلان. خصم 25% لمده 3 اوردرات').next.note, 'العميل زعلان. خصم 25% لمده 2 اوردرات.');
  for (const n of ['خصم 10% ثابت.', '..خصم 10 % ثابت لحد 12/31.', '.يكون بعلم استاذ محمود/خصم 15% ع طول هام جدا .']) {
    const r = p(n); assert.equal(r.permanent, true, n); assert.equal(r.oneTime, false, n); assert.equal(r.next, null, n);
  }

  const item = n => p(n).directives.filter(d => d.kind === 'item').map(d => (d.suggest[0]?.sure ? '✔' : '✋') + (d.suggest[0]?.name || ''));
  assert.deepEqual(item('العميل له ورق عنب وطحينة فري'), ['✔ورق عنب', '✔سلطة طحينة'], 'two dishes in one line');
  assert.deepEqual(item('العميل يستحق طبق رز معمر مجانا'), ['✔ارز معمر سادة']);
  assert.deepEqual(item('ليه حمام محشي هدية اعتذار'), ['✔فرد حمام محشى']);
  assert.deepEqual(item('هديه بيبسي ٢'), ['✔بيبسى']);
  // Which size / not on the menu → never put in by itself; the employee picks it from the suggestions.
  for (const n of ['يضاف للعميل كفته فري', 'تعويض العميل بساندوتش شاورما', 'العميل ليه وجبة فراخ مشوية', 'ليه حلو مجاناً']) assert.match(item(n)[0], /^✋/, n);
});

test('after the order only the used sentence leaves the card; the rest of what staff wrote stays', async () => {
  const { parseApexCustomerNote: p } = await import('../src/apex-customer-notes.js');
  assert.equal(p('خصم 30% ع الاوردر القادم والكومنت يتمسح.').next, null, 'nothing else → the card is cleared');
  assert.equal(p('خصم 15%. ع الاوردر القادم').next, null, '«ع الاوردر القادم» after a dot is still the same sentence');
  assert.equal(p('خصم 30% ع الاوردر القادم. العميل بيحب الشطة').next.note, 'العميل بيحب الشطة');
  assert.equal(p('العميل ليه بيبسي هديه. عنوانه جنب الجامع').next.note, 'عنوانه جنب الجامع');
  assert.equal(p('خصم 60% يتقسمو ع اوردرين. العميل بيحب الشطة').next.note, 'خصم 30% ع الاوردر القادم والكومنت يتمسح. العميل بيحب الشطة');
  assert.equal(p('العميل بيحب الشطة\nخصم 90% على 3 اوردرات والكومنت يتمسح').next.note, 'العميل بيحب الشطة\nخصم 60% يتقسمو ع اوردرين والكومنت يتمسح.');
  assert.equal(p('عميل دايم خصم 10%').next, null, 'a lasting discount is never touched');
});
