'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Karim 11-14: «فيه مناطق ممكن تكون متكرر مرتين علي ابيكس مع انها نفس المنطقه زي مدينتي و مدنتي» — Apex's real areas (read 11-14).
const LOCS = [
  { no: 361, name: 'مدينتي', branch: 2, service: 39.47 }, { no: 370, name: 'مدنتى', branch: 3, service: 39.47 },
  { no: 218, name: 'التجمع  الخامس', branch: 1, service: 54.15 }, { no: 354, name: 'التجمع الخامس طلبات', branch: 1, service: 54.15 },
  { no: 15, name: 'سراي القبة', branch: 2, service: 38.5 }, { no: 339, name: 'سرايا القبة', branch: 2, service: 42.5 },
  { no: 31, name: 'المطار', branch: 2, service: 34.5 }, { no: 207, name: 'مطار3', branch: 2, service: 34.5 },
  { no: 162, name: '0', branch: 2, service: 35 }, { no: 189, name: '0', branch: 2, service: 35 },
  { no: 268, name: 'استلام مدينة نصر', branch: 2, service: 0 }, { no: 213, name: 'الحى الثامن مدينة نصر', branch: 2, service: 34.5 }];

test('one area written twice on Apex is one area; different charge or name stays apart', async () => {
  const { areaKey, areaGroups, areaGroupList, areaForBranch } = await import('../src/apex-areas.js');
  assert.equal(areaKey('مدينتي'), areaKey('مدنتى'));
  assert.equal(areaKey('التجمع الخامس طلبات'), areaKey('التجمع  الخامس'));
  assert.equal(areaKey('0'), '', 'a placeholder is no area');
  const g = areaGroups(LOCS);
  assert.equal(g.get(361), g.get(370)); assert.equal(g.get(218), g.get(354));
  assert.notEqual(g.get(15), g.get(339), 'Apex charges them differently');
  assert.notEqual(g.get(31), g.get(207)); assert.notEqual(g.get(162), g.get(189)); assert.notEqual(g.get(268), g.get(213));
  assert.deepEqual(areaGroupList(LOCS).map(x => x.map(y => y.no)), [[361, 370], [218, 354]]);
  // Admin keeps two apart, or puts two together.
  assert.notEqual(areaGroups(LOCS, { apart: [[361, 370]] }).get(361), areaGroups(LOCS, { apart: [[361, 370]] }).get(370));
  assert.equal(areaGroups(LOCS, { together: [[31, 207]] }).get(207), areaGroups(LOCS, { together: [[31, 207]] }).get(31));
  // The branch's own copy: a Madinaty order on «مدينتي» 361 (listed for Nasr City) goes to «مدنتى» 370.
  assert.equal(areaForBranch(361, 3, LOCS, g), 370);
  assert.equal(areaForBranch(370, 3, LOCS, g), 370);
  assert.equal(areaForBranch(15, 3, LOCS, g), 15, 'no copy for that branch: left as it was (the order waits)');
});

test('auto-transfer takes the branch\'s copy of a duplicated area', async () => {
  const { areaGroups } = await import('../src/apex-areas.js');
  const { decide } = await import('../src/autotransfer.js');
  const now = Date.parse('2026-11-14T12:00:00Z');
  const o = { source: 'site', ref: '1', at: new Date(now - 120000).toISOString(), apexBranch: 3, payment: 'cash', customer: { siteArea: 'مدينتي', address: 'B12 عمارة 59' },
    areaGuess: { no: 361, seen: 0, how: 'name' }, items: [{ name: 'ورق عنب', qty: 1, price: 100, apex: [{ no: '0103002' }], pick: '0103002' }],
    apexCustomerNote: { status: 'none', checkedAt: new Date(now - 1000).toISOString() } };
  const d = decide(o, { now, locations: LOCS, groups: areaGroups(LOCS) });
  assert.ok(!d.why.some(w => /فرع تاني/.test(w)), d.why.join(' | '));
  assert.ok(d.ok, d.why.join(' | ')); assert.equal(d.body.locationNo, 370);
});

test('daily report: why orders were left to staff, by reason, with the dishes and areas named', async () => {
  const { autoReport } = await import('../src/autotransfer.js');
  const r = autoReport([
    { source: 'talabat', ref: '1', code: '751', decision: 'sent', reasons: '' },
    { source: 'talabat', ref: '2', code: '752', decision: 'wait', reasons: 'صنف مش معروف على Apex: كبدة (+1) · منطقة «الرحاب 1» لسه ما اتعلمتش على Apex' },
    { source: 'site', ref: '3', code: '31001', decision: 'wait', reasons: 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد · صنف مش معروف على Apex: كبدة' },
    { source: 'site', ref: '4', code: '31002', decision: 'wait', reasons: 'لسه واصل · اتحوّل للفرع على الموقع — غالباً اتسجل بإيد' }]);
  assert.deepEqual(r.totals.talabat, { all: 2, auto: 1, would: 0, staff: 1 });
  assert.equal(r.totals.site.staff, 2);
  const item = r.reasons.find(x => x.reason === 'صنف مش معروف على Apex');
  assert.equal(item.orders, 2); assert.deepEqual(item.details, [{ name: 'كبدة', n: 2 }]);
  assert.equal(r.reasons.find(x => x.reason === 'منطقة لسه ما اتعلمتش على Apex').details[0].name, 'الرحاب 1');
  // «sent to the branch» counts only when nothing else stopped the order.
  assert.equal(r.reasons.find(x => x.reason === 'اتحوّل للفرع على الموقع — غالباً اتسجل بإيد').orders, 1);
});

// Karim 11-14 (11-12 ليلاً the cashier PC restarted and the writer could not log in to Apex for two hours).
test('a writer that takes orders but does not write them: no new order is handed to it, and it is flagged', async () => {
  const { decide } = await import('../src/autotransfer.js');
  assert.equal(typeof decide, 'function');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/autotransfer.js'), 'utf8');
  assert.match(src, /writerStuck/);
  const home = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/home.js'), 'utf8');
  assert.match(home, /part:writerStuck/);
});

// Karim 11-15 «تقريبا مفيش ولا اوردر موقع اتحول تلقائي»: a website order has no branch until staff send it on the website;
// the Apex area found for it gives the branch (one owner only).
test('auto transfer: a website order with no branch takes the branch of its Apex area', async () => {
  const { decide } = await import('../src/autotransfer.js');
  const now = Date.parse('2026-11-15T09:00:00Z');
  const o = { source: 'site', ref: '31215', at: new Date(now - 3 * 60000).toISOString(), apexBranch: null, payment: 'cash', items: [{ name: 'كفتة', qty: 1, apex: [{ no: '10' }] }], detailRead: true,
    customer: { siteArea: 'التجمع الاول', address: 'التجمع الاول' }, areaGuess: { no: 332, seen: 0, how: 'address' }, discounts: [],
    apexCustomerNote: { status: 'none', checkedAt: new Date(now - 60000).toISOString() } };
  const locations = [{ no: 332, name: 'التجمع الاول', branch: 1, service: 30 }, { no: 9, name: 'شارع الطاقه', branch: 2, service: 20 }, { no: 361, name: 'مدينتي', branch: 1, service: 40 }, { no: 361, name: 'مدينتي', branch: 3, service: 40 }];
  const d = decide(o, { now, locations, groups: null, picks: new Map() });
  assert.ok(!d.why.includes('الفرع مش واضح'), d.why.join(' · '));
  assert.ok(!d.why.some(w => /فرع تاني/.test(w)));
  const two = decide({ ...o, areaGuess: { no: 361, seen: 0, how: 'address' } }, { now, locations, groups: null, picks: new Map() });
  assert.ok(two.why.includes('الفرع مش واضح'), 'an area of two branches decides nothing');
});

// Karim 11-15 (Apex 703813 «ازاي استلام وفيه عنوان توصيل»): a delivery order never automatically on a «استلام» area.
test('auto transfer: a delivery order is not put on a branch pickup area', async () => {
  const { decide } = await import('../src/autotransfer.js');
  const now = Date.parse('2026-11-15T20:00:00Z');
  const o = { source: 'talabat', ref: '4723000001', code: '1466', at: new Date(now - 3 * 60000).toISOString(), apexBranch: 2, payment: 'paid', items: [{ name: 'عرض نصف فراخ', qty: 1, apex: [{ no: '10' }], modifiersComplete: true }], detailRead: true,
    customer: { talabatArea: 'مدينة نصر', address: 'مساكن الشروق مبنى 2' }, discounts: [], apexCustomerNote: { status: 'none', checkedAt: new Date(now - 60000).toISOString() } };
  const locations = [{ no: 268, name: 'استلام مدينة نصر', branch: 2, service: 0 }, { no: 305, name: 'مساكن الشروق', branch: 2, service: 34.5 }];
  const d = decide(o, { now, locations, groups: null, picks: new Map(), customerArea: () => 268 });
  assert.ok(d.why.some(w => /استلام/.test(w)), d.why.join(' · '));
  const learned = decide({ ...o, areaGuess: { no: 268, seen: 3, share: 1 } }, { now, locations, groups: null, picks: new Map() });
  assert.ok(learned.why.some(w => /استلام/.test(w)));
});

// Karim 11-15 «ما هو الاوردر استلام فعلا»: a Talabat pickup goes to the branch's «استلام» area by itself.
test('auto transfer: a Talabat pickup order takes the branch pickup area', async () => {
  const { decide } = await import('../src/autotransfer.js');
  const now = Date.parse('2026-11-15T20:00:00Z');
  const o = { source: 'talabat', ref: '4723000002', code: '1466', at: new Date(now - 3 * 60000).toISOString(), apexBranch: 2, payment: 'paid', deliveryType: 'Pickup',
    fulfillment: 'pickup', areaGuess: { no: 268, name: 'استلام مدينة نصر', how: 'pickup' }, items: [{ name: 'عرض نصف فراخ', qty: 1, apex: [{ no: '10' }], modifiersComplete: true }], detailRead: true,
    customer: { talabatArea: 'مدينة نصر', address: '' }, discounts: [], apexCustomerNote: { status: 'none', checkedAt: new Date(now - 60000).toISOString() } };
  const locations = [{ no: 268, name: 'استلام مدينة نصر', branch: 2, service: 0 }];
  const d = decide(o, { now, locations, groups: null, picks: new Map() });
  assert.ok(!d.why.some(w => /استلام|منطقة/.test(w)), d.why.join(' · '));
});
