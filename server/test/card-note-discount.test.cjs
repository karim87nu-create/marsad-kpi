'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 09-11: a discount written on the customer's Apex card never stops the transfer, and never passes unhandled.
test('card note discount: cash takes it on Apex; paid needs a gift item worth about it or «تواصلت مع العميل»; unclear needs «تواصلت»', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const store = 'الدهان، التجمع الخامس - البنفسج';
    const orders = ['3977900001', '3977900002', '3977900003', '3977900004'];
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: orders.map((id, i) => ({ id, store, status: 'ACCEPTED', placedAt: at(i), total: 300,
      detail: { customer: { name: 'عميل', phone: '0100000000' + (i + 1) }, items: [], bill: [] } })) } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 20 }] } });
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'test' })).status, 200);
    t.advance(9000); await as('GET', '/api/transfer/queue?day=2026-10-22');
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const notes = { [orders[0]]: 'خصم 10%', [orders[1]]: 'خصم 10%', [orders[2]]: 'خصم 10%', [orders[3]]: 'خصم 10% ; خصم 20 جنيه' };
    const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending;
    assert.equal(pend.length, 4);
    assert.equal((await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => ({ ...x, status: 'found', custNo: '9' + x.ref.slice(-1), note: notes[x.ref] })) })).body.updated, 4);
    const card = ref => ({ note: notes[ref], custNo: '9' + ref.slice(-1) });
    // 2 × «1/4كيلو كفتة» before tax → the 10% is worth a tenth of that.
    const job = (ref, payment, apexNote) => ({ source: 'talabat', ref, action: 'auto', payment, branchNo: 1, locationNo: 218, items: [{ itemNo: '0108004', qty: 2 }], expectedTotal: 300, code: ref.slice(-2), label: 'x', apexNote });
    const payload = async ref => JSON.parse(t.app.db.raw.prepare('SELECT payload FROM transfer_jobs WHERE ref = ?').get(ref).payload);

    // Cash: confirmed → the writer takes 10% on Apex and clears nothing it was not told is one-off.
    assert.equal((await as('POST', '/api/transfer/job', job(orders[0], 'cash', { ...card(orders[0]) }))).status, 409, 'must be confirmed');
    let r = await as('POST', '/api/transfer/job', job(orders[0], 'cash', { ...card(orders[0]), approved: true }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let p = (await payload(orders[0])).apexCustomerBenefit;
    assert.equal(p.percent, 10); assert.equal(p.items.length, 0);

    // Paid: no discount on Apex. Nothing chosen → it says what to do (not «register by hand»).
    r = await as('POST', '/api/transfer/job', job(orders[1], 'paid', { ...card(orders[1]), approved: true }));
    assert.equal(r.status, 409); assert.match(r.body.error, /صنف هدية بدل الخصم|تواصلت مع العميل/);
    const worth = Math.round(2 * 0.1 * 100 * Number(require('fs').readFileSync(require.resolve('../src/menu-seed.js'), 'utf8').match(/"0108004": ([\d.]+)/g).pop().split(': ')[1])) / 100;
    r = await as('POST', '/api/transfer/job', job(orders[1], 'paid', { ...card(orders[1]), approved: true, resolution: 'gift', gift: { itemNo: '0108001' } }));
    assert.equal(r.status, 409, 'a kilo of kofta is far more than the discount'); assert.match(r.body.error, /أكبر من قيمة الخصم/);
    // Several gifts (Karim 10-11): their total may not go past the discount; within it, all are added free.
    r = await as('POST', '/api/transfer/job', job(orders[1], 'paid', { ...card(orders[1]), approved: true, resolution: 'gift', gifts: [{ itemNo: '0202001', qty: 9 }, { itemNo: '0202004', qty: 9 }] }));
    assert.equal(r.status, 409); assert.match(r.body.error, /مجموع الهدايا/);
    r = await as('POST', '/api/transfer/job', job(orders[1], 'paid', { ...card(orders[1]), approved: true, resolution: 'gift', gifts: [{ itemNo: '0202001', qty: 1 }, { itemNo: '0202004', qty: 1 }] }));
    assert.equal(r.status, 200, JSON.stringify(r.body) + ' worth ' + worth);
    p = (await payload(orders[1])).apexCustomerBenefit;
    assert.equal(p.percent, 0); assert.equal(p.amount, 0); assert.equal(p.resolution, 'gift');

    assert.deepEqual(p.items.map(x => [x.itemNo, x.qty, x.free]), [['0202001', 1, true], ['0202004', 1, true]]);

    // Paid, «تواصلت مع العميل»: sent without the discount, the note stays on the card.
    r = await as('POST', '/api/transfer/job', job(orders[2], 'paid', { ...card(orders[2]), resolution: 'contacted' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    p = (await payload(orders[2])).apexCustomerBenefit;
    assert.equal(p.percent, 0); assert.equal(p.oneTime, false); assert.equal(p.resolution, 'contacted');

    // Two discounts on one card: not guessed — sent after «تواصلت مع العميل», with no discount taken.
    r = await as('POST', '/api/transfer/job', job(orders[3], 'cash', { ...card(orders[3]), approved: true }));
    assert.equal(r.status, 409); assert.match(r.body.error, /تواصلت مع العميل/);
    r = await as('POST', '/api/transfer/job', job(orders[3], 'cash', { ...card(orders[3]), resolution: 'contacted' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    p = (await payload(orders[3])).apexCustomerBenefit;
    assert.equal(p.percent, 0); assert.equal(p.amount, 0);
  } finally { await t.close(); }
});

test('card note split over orders: this order gets its share, the card then says what is left for the next one', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 10 * 60000 });
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const as = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const ref = '3977900011', store = 'الدهان، التجمع الخامس - البنفسج';
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{ id: ref, store, status: 'ACCEPTED', placedAt: at(0), total: 300,
      detail: { customer: { name: 'عميل', phone: '01000000011' }, items: [], bill: [] } }] } });
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': okey }, body: { v: 1, day: '2026-10-22', online: [], locations: [{ no: 218, name: 'التجمع الخامس', branch: 1, service: 20 }] } });
    assert.equal((await admin('POST', '/api/apex-writer', { action: 'mode', mode: 'live', confirm: 'LIVE' })).status, 200);
    t.advance(9000); await as('GET', '/api/transfer/queue?day=2026-10-22');
    const wt = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = (path, body) => t.call('POST', path, { body: body || {}, headers: { 'x-apex-writer': wt } });
    const note = 'رأي العميل: كويس | .خصم 30 %يتقسمو ع اوردرين والكومنت يتمسح.';
    const pend = (await w('/api/apex-writer/customer-notes/pending')).body.pending;
    await w('/api/apex-writer/customer-notes/result', { results: pend.map(x => ({ ...x, status: 'found', custNo: '77', note })) });
    const r = await as('POST', '/api/transfer/job', { source: 'talabat', ref, action: 'auto', payment: 'cash', branchNo: 1, locationNo: 218, items: [{ itemNo: '0108004', qty: 2 }],
      expectedTotal: 300, code: '11', label: 'x', apexNote: { note: note.trim(), custNo: '77', approved: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const job = (await w('/api/apex-writer/next')).body.job;
    assert.equal(job.apexCustomerBenefit.percent, 15, 'half of the 30% now');
    assert.equal(job.apexCustomerBenefit.oneTime, true);
    assert.equal(job.apexCustomerBenefit.next, 'رأي العميل: كويس | خصم 15% ع الاوردر القادم والكومنت يتمسح.', 'the rest of the note is kept');
    assert.equal((await w('/api/apex-writer/result', { source: 'talabat', ref, ok: true, db: 'live', orderNo: 1, cardDiscount: 30, cardNoteCleared: true })).status, 200);
    const card = t.app.db.raw.prepare('SELECT note, status FROM apex_customer_notes WHERE ref = ?').get(ref);
    assert.equal(card.status, 'found'); assert.match(card.note, /خصم 15% ع الاوردر القادم/);
  } finally { await t.close(); }
});
