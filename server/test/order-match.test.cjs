const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOrders, phoneKey } = require('../src/order-match.js');
const { start } = require('./helpers.cjs');
const anchor = Date.UTC(2026, 9, 22, 12), at = m => new Date(anchor + m * 60000).toISOString();
const customer = { name: 'أحمد علي', phone: '٠١٠١٢٣٤٥٦٧٨', address: 'شارع النصر عمارة 20 شقة 3' };
const items = [{ name: 'White Rice', qty: 2, price: 113 }];
const aitems = [{ name: 'ارز سادة', no: '0103007', qty: 2, price: 50 }];
const row = (id = '10000001', extra = {}) => ({ id, anchor, amount: 113, branch: 'التجمع', customer, items, ...extra });
const apex = (no = 1, extra = {}) => ({ no, at: at(3), t: anchor + 180000, amount: 113, branch: 'التجمع', customer, items: aitems, ...extra });
const opts = { branchOk: (a, b) => a === b };

test('normalizes Egyptian numbers and rejects masked numbers', () => {
  assert.equal(phoneKey('+٢٠ ١٠١٢٣٤٥٦٧٨'), '1012345678');
  assert.equal(phoneKey('00201012345678'), phoneKey('01012345678'));
  for (const s of ['010***45678', '123', '', '010123456789']) assert.equal(phoneKey(s), '');
});
test('identity and basket beat a closer wrong customer; all evidence is included', () => {
  const d = resolveOrders([row()], [apex(1, { t: anchor, customer: { ...customer, phone: '01112345678' } }), apex(2)], opts);
  assert.equal(d.matches.get('10000001').no, 2);
  assert.deepEqual(Object.keys(d.states.get('10000001').evidence).sort(), ['address','branch','code','items','minutes','money','name','phone','quantities']);
});
test('time and value alone remain tentative and never confirmed', () => {
  const d = resolveOrders([row('10000001', { customer: {}, items: [] })], [apex()], opts);
  assert.equal(d.matches.size, 0); assert.equal(d.states.get('10000001').state, 'tentative');
});
test('ties in either direction are ambiguous and independent of row order', () => {
  for (const rows of [[row(), row('10000002')], [row('10000002'), row()]]) {
    const d = resolveOrders(rows, [apex()], opts); assert.equal(d.matches.size, 0);
    assert.equal(d.states.get('10000001').state, 'ambiguous');
  }
  assert.equal(resolveOrders([row()], [apex(1), apex(2)], opts).matches.size, 0);
});
test('manual proposals do not reserve or override independent evidence; conflicts remain ambiguous', () => {
  const rows = [row(), row('10000002')], A = [apex(1, { tag: '10000001' }), apex(2)];
  const d = resolveOrders(rows, A, { ...opts, manual: new Map([['10000002','1'], ['10000001', null]]) });
  assert.equal(d.matches.size, 0);
  assert.equal(d.states.get('10000001').confidence, 'AMBIGUOUS');
  assert.equal(d.states.get('10000001').manualConflict, true);
  assert.equal(d.states.get('10000002').manualProposal, '1');
});
test('duplicate codes and zero-stripped partial codes do not become sure links without evidence', () => {
  const bare = row('10000001', { code: '8403', customer: {}, items: [] });
  assert.equal(resolveOrders([bare], [apex(1, { tag: '843' })], opts).matches.size, 0);
  assert.equal(resolveOrders([bare], [apex(1, { tag: '8403' }), apex(2, { tag: '8403' })], opts).matches.size, 0);
});
test('branch, money, quantities and phone contradictions block automatic evidence links', () => {
  for (const extra of [{ branch: 'مدينتي' }, { amount: 900 }, { customer: { ...customer, phone: '01112345678' } }, { items: [{ ...aitems[0], qty: 1 }] }, { t: anchor + 4 * 3600000 }]) {
    assert.equal(resolveOrders([row()], [apex(1, extra)], opts).matches.size, 0, JSON.stringify(extra));
  }
});
test('split duplicate item lines aggregate before matching quantities', () => {
  const d = resolveOrders([row()], [apex(1, { items: [ { ...aitems[0], qty: 1 }, { ...aitems[0], qty: 1 } ] })], opts);
  assert.equal(d.matches.size, 1);
});
test('API persists customer evidence, excludes ambiguity from learning, and conflicting manual proposals do not teach', async () => {
  const t = await start({ at: anchor + 30 * 60000 });
  try {
    const admin = await t.admin(), token = (await admin('POST', '/api/talabat/token')).body.token;
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    const push = orders => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders } });
    const order = id => ({ id, store: 'التجمع', status: 'ACCEPTED', total: 113, placedAt: at(0), detail: { acceptedAt: at(0), customer, items, subtotal: 113 } });
    await push([order('10000001'), order('10000002')]);
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { day: '2026-10-22', online: [apex(1, { kind: 'طلبات', tag: '8403' }), apex(2, { kind: 'طلبات' })] } });
    await push([]);
    let d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    assert.ok(d.orders.every(x => !x.apex));
    assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM learned WHERE kind LIKE 'match-v2:%'").get().n, 0);
    assert.equal(JSON.stringify(d).includes('01012345678'), false, 'matching profile stays out of reports');
    assert.equal((await admin('POST', '/api/talabat/link', { talabatId: '10000002', apexNo: 1 })).status, 200);
    assert.equal((await admin('POST', '/api/talabat/link', { talabatId: '10000001', apexNo: 1 })).status, 409);
    assert.equal((await admin('POST', '/api/talabat/link', { talabatId: '10000001', apexNo: 'none' })).status, 200);
    // Exact code arriving later cannot override a manual-none or steal a manually reserved order.
    await t.call('POST', '/api/orders/tags', { headers: { 'x-orders-token': ot }, body: { day: '2026-10-22', tags: { 1: '10000001', 2: '10000002' } } });
    d = (await admin('GET', '/api/talabat/day?day=2026-10-22')).body;
    assert.equal(d.orders.find(x => x.id === '10000002').apex, null);
    assert.equal(d.orders.find(x => x.id === '10000002').matching.confidence, 'AMBIGUOUS');
    assert.equal(d.orders.find(x => x.id === '10000001').apex, null);
    const facts = t.app.db.raw.prepare("SELECT DISTINCT ref FROM learned WHERE kind LIKE 'match-v2:%'").all();
    assert.deepEqual(facts, []);
  } finally { await t.close(); }
});
