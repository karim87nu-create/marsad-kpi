'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('whatsapp: welcome on a new Talabat order, survey after the delay, numbers erased; nothing until it is on', async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers.authorization });
    if (opts.method === 'GET') return Response.json({ display_phone_number: '+20 10 0000 0000' });
    return Response.json({ messages: [{ id: 'wamid.x' }] });
  };
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0, config: { whatsappFetch: fetch } });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const push = orders => t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: orders.map(o => o.phone ? { ...o, detail: { ...(o.detail || {}), customer: { phone: o.phone } } } : o) } });
    // Off: the screen is not asked for numbers, and a number sent anyway is not kept.
    let r = await push([{ id: '4676900001', status: 'ACCEPTED', placedAt: at(0), phone: '01001234567' }]);
    assert.equal(r.body.phones, false);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM wa_messages').get().n, 0);
    // Link and turn on.
    assert.equal((await admin('POST', '/api/whatsapp', { action: 'enable', on: true })).status, 400, 'nothing linked yet');
    r = await admin('POST', '/api/whatsapp', { action: 'config', phoneId: '123456789012', token: 'EAAG-secret', welcome: 'Welcome_Talabat', survey: 'survey_75', lang: 'ar', delay: 75 });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.number, '+20 10 0000 0000');
    assert.ok(!t.app.db.raw.prepare("SELECT value FROM settings WHERE key = 'whatsapp_config'").get().value.includes('EAAG'), 'token stored encrypted');
    assert.equal((await admin('POST', '/api/whatsapp', { action: 'enable', on: true })).status, 200);
    r = await push([{ id: '4676900002', status: 'ACCEPTED', placedAt: at(1), phone: '+20 100 123 4568' }, { id: '4676900003', status: 'ACCEPTED', phone: '0223456789' }]);
    assert.equal(r.body.phones, true);
    calls.length = 0;
    await t.app.whatsappTick(t0 + 2 * 60000);
    const sends = calls.filter(c => c.body);
    assert.deepEqual(sends.map(c => [c.body.to, c.body.template.name, c.body.template.language.code]), [['201001234568', 'welcome_talabat', 'ar']]);
    assert.equal(sends[0].auth, 'Bearer EAAG-secret');
    // Not before 75 minutes; then the survey, and the number is erased.
    await t.app.whatsappTick(t0 + 60 * 60000);
    assert.equal(calls.filter(c => c.body?.template?.name === 'survey_75').length, 0);
    await t.app.whatsappTick(t0 + 77 * 60000);
    assert.equal(calls.filter(c => c.body?.template?.name === 'survey_75').length, 1);
    const row = t.app.db.raw.prepare("SELECT phone, survey_at FROM wa_messages WHERE talabat_id = '4676900002'").get();
    assert.equal(row.phone, null); assert.ok(row.survey_at);
    const s = (await admin('GET', '/api/whatsapp')).body;
    assert.deepEqual([s.today.welcome, s.today.survey], [1, 1]);
    assert.ok(s.errors.some(e => /مش موبايل/.test(e.error)), 'a landline is not messaged');
    assert.ok(!JSON.stringify(s).includes('2010012'), 'numbers never shown');
    // A cancelled order gets no survey.
    t.advance(78 * 60000);
    await push([{ id: '4676900004', status: 'ACCEPTED', phone: '01112223334' }]);
    await t.app.whatsappTick(t0 + 78 * 60000);
    await push([{ id: '4676900004', status: 'CANCELLED' }]);
    await t.app.whatsappTick(t0 + 200 * 60000);
    assert.equal(calls.filter(c => c.body?.to === '201112223334').length, 1, 'welcome only');
    assert.equal(t.app.db.raw.prepare("SELECT phone FROM wa_messages WHERE talabat_id = '4676900004'").get().phone, null);
    // Off: every kept number is erased.
    await push([{ id: '4676900005', status: 'ACCEPTED', phone: '01200000000' }]);
    await admin('POST', '/api/whatsapp', { action: 'enable', on: false });
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM wa_messages WHERE phone IS NOT NULL').get().n, 0);
  } finally { await t.close(); }
});

test('apexDetails: area, comments and the branch status the monitor sent, for the website and Talabat messages', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-10-22',
      details: { '2648500': { loc: 'الحي السابع', note: 'رن قبل ما توصل', items: ['• 2× كفتة: بدون بصل'], msgs: [] } },
      branchStatus: { 'مدينة نصر': '📊 حالة الفرع دلوقتي: 4 أوردر لسه ماخرجش' } } });
    const d = await t.app.apexDetails('2026-10-22');
    assert.equal(d.extra(2648500), '\n📍 المنطقة: الحي السابع\n💬 ملاحظة الأوردر: رن قبل ما توصل\n🍽️ تعليقات على الأصناف:\n• 2× كفتة: بدون بصل');
    assert.equal(d.extra(1), '');
    assert.equal(d.status('فرع مدينة نصر'), '\n\n📊 حالة الفرع دلوقتي: 4 أوردر لسه ماخرجش');
    assert.equal(d.status('مدينتي'), '');
  } finally { await t.close(); }
});

test('whatsapp web: the monitor PC takes the messages one at a time (welcome, then the survey after the delay) and reports back', async () => {
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    const H = { 'x-talabat-token': token };
    const push = orders => t.call('POST', '/api/talabat/push', { headers: H, body: { orders: orders.map(o => o.phone ? { ...o, detail: { ...(o.detail || {}), customer: { phone: o.phone } } } : o) } });
    const next = async () => (await t.call('POST', '/api/whatsapp/next', { headers: H, body: {} })).body;
    const result = body => t.call('POST', '/api/whatsapp/result', { headers: H, body });
    assert.equal((await t.call('POST', '/api/whatsapp/next', { headers: { 'x-talabat-token': 'x' }, body: {} })).status, 401);
    assert.equal((await next()).on, false);
    assert.equal((await admin('POST', '/api/whatsapp', { action: 'web', welcomeText: 'أهلاً بيك في الدهان، طلبك {code} بيتجهز', surveyText: 'قيّم تجربتك من 1 لـ 5', delay: 75 })).status, 200);
    assert.equal((await admin('POST', '/api/whatsapp', { action: 'enable', on: true })).status, 200);
    let r = await push([{ id: '4676900201', status: 'ACCEPTED', placedAt: at(0), phone: '01001234567' }]);
    assert.equal(r.body.phones, true);
    await push([{ id: '4676900202', status: 'ACCEPTED', placedAt: at(0), phone: '01001234568' }]);
    await t.call('POST', '/api/talabat/push', { headers: H, body: { codes: [{ id: '4676900201', code: '8403' }] } });
    let n = await next();
    assert.equal(n.message.kind, 'welcome'); assert.equal(n.message.phone, '201001234567'); assert.match(n.message.text, /طلبك 8403 بيتجهز/);
    assert.equal((await next()).message, null, 'never faster than the gap');
    assert.equal((await result({ id: n.message.id, kind: 'welcome', ok: true })).status, 200);
    t.advance(41000);
    n = await next(); assert.equal(n.message.phone, '201001234568');
    await result({ id: n.message.id, kind: 'welcome', ok: false, invalid: true, error: 'الرقم مش على واتساب' });
    t.advance(30 * 60000);
    assert.equal((await next()).message, null, 'survey not before 75 minutes');
    t.advance(46 * 60000);
    n = await next(); assert.equal(n.message.kind, 'survey'); assert.equal(n.message.text, 'قيّم تجربتك من 1 لـ 5');
    await result({ id: n.message.id, kind: 'survey', ok: true });
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM wa_messages WHERE phone IS NOT NULL').get().n, 0, 'every number erased');
    t.advance(60000);
    assert.equal((await next()).message, null);
    const s = (await admin('GET', '/api/whatsapp')).body;
    assert.equal(s.mode, 'web'); assert.deepEqual([s.today.welcome, s.today.survey], [1, 1]);
    assert.ok(s.errors.some(e => /مش على واتساب/.test(e.error)));
  } finally { await t.close(); }
});
