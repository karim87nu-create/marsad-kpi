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
  const o = { source: 'site', ref: '1', at: new Date(now - 120000).toISOString(), apexBranch: 3, payment: 'cash', customer: { siteArea: 'مدينتي' },
    areaGuess: { no: 361, seen: 0, how: 'name' }, items: [{ name: 'ورق عنب', qty: 1, price: 100, apex: [{ no: '0103002' }], pick: '0103002' }],
    apexCustomerNote: { status: 'none', checkedAt: new Date(now - 1000).toISOString() } };
  const d = decide(o, { now, locations: LOCS, groups: areaGroups(LOCS) });
  assert.ok(!d.why.some(w => /فرع تاني/.test(w)), d.why.join(' | '));
  assert.ok(d.ok, d.why.join(' | ')); assert.equal(d.body.locationNo, 370);
});
