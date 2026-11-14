'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('English addresses, names and comments shown and sent in Arabic (dictionary now, the model when a key is set); the original kept', async () => {
  const t = await start({ at: Date.now() });
  const real = global.fetch;
  try {
    const admin = await t.admin();
    await t.employee(admin, { name: 'A', code: 'E9', pin: '123' });
    const s = (await t.call('POST', '/api/transfer/login', { body: { pin: '123' } })).body.token;
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': token }, body: { orders: [{ id: '3977700001', store: 'الدهان، التجمع الخامس', status: 'ACCEPTED', placedAt: new Date().toISOString(), total: 200,
      customer: { name: 'Ismail Baraka', phone: '01000000001', address: 'infront of katameya dunes، التجمع الخامس — الدور: 2' }, detail: { receivedAt: new Date().toISOString(), comment: 'please call me when you arrive' } }] } });
    const q = async () => (await t.call('GET', '/api/transfer/queue', { headers: { 'x-transfer-session': s } })).body.orders.find(o => o.ref === '3977700001');
    let o = await q();
    assert.match(o.customer.address, /^أمام قطامية ديونز/); assert.match(o.customer.original, /infront of katameya dunes/);
    // With a key: the model's answer replaces the dictionary's (fetched in the background, shown next time).
    t.app.config.openaiKey = 'test-key'; let asked = 0;
    global.fetch = async (url, opt) => {
      if (String(url).startsWith('https://api.openai.com/')) { asked++; const txt = JSON.parse(opt.body).messages[1].content;
        const ar = /Ismail/.test(txt) ? 'إسماعيل بركة' : /dunes/.test(txt) ? 'أمام قطامية ديونز، التجمع الخامس — الدور: 2' : 'كلمني لما توصل';
        return new Response(JSON.stringify({ choices: [{ message: { content: ar } }] }), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return real(url, opt);
    };
    await q(); await new Promise(r => setTimeout(r, 50));
    o = await q();
    assert.ok(asked >= 1);   // 11-13 (ChatGPT): addresses are never guessed by the model, only the name/comment
    assert.equal(o.customer.name, 'إسماعيل بركة');
    if (o.note) assert.equal(o.note, 'كلمني لما توصل');
    const n = asked; await q(); await new Promise(r => setTimeout(r, 30)); assert.equal(asked, n, 'translated once');
  } finally { global.fetch = real; await t.close(); }
});


test('offline dictionary preserves negative instructions, numbers and explicit addon quantities', async () => {
  const t = await start();
  try {
    const d = t.app.arabicDictionary;
    assert.equal(d("don't ring the bell"), 'متضربش الجرس');
    assert.equal(d('no onions'), 'من غير بصل');
    assert.equal(d('no 12'), 'رقم 12');
    assert.equal(d('3× extra bread'), '3× عيش زيادة');
    assert.equal(d('please call me when you arrive'), 'من فضلك كلمني لما توصل');
    assert.equal(d('Ismail Baraka'), 'إسماعيل بركة');
  } finally { await t.close(); }
});
