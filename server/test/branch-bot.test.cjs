'use strict';
// Karim 11-11: the branches ask and report in their Telegram groups; the bot answers from the Marsad; calls go to the
// call center; a cancellation waits for a supervisor's approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('branch bot: menu, order status from the Marsad, a call for the call center, a cancellation a supervisor approves', async () => {
  const sent = [], queue = [], answered = [];
  let nextUpdate = 1, offsetSeen = null;
  const fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const method = req.url.split('/').pop(), b = JSON.parse(body || '{}');
      let result;
      if (method === 'getMe') result = { username: 'marsad_bot' };
      else if (method === 'getUpdates') { offsetSeen = b.offset; result = b.offset === -1 ? [] : queue.filter(u => u.update_id >= (b.offset || 0)); }
      else if (method === 'answerCallbackQuery') { answered.push(b.callback_query_id); result = true; }
      else { sent.push({ chat: String(b.chat_id), text: b.text, reply: b.reply_parameters?.message_id ?? null, markup: b.reply_markup || null }); result = { message_id: 1000 + sent.length }; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise(r => fake.listen(0, r));
  const t0 = cairoToUtc(2026, 11, 11, 20, 0, 0), s = m => Math.floor((t0 + m * 60000) / 1000);
  const t = await start({ at: t0 + 10 * 60000, config: { telegramApi: 'http://127.0.0.1:' + fake.address().port } });
  const chat = { id: -300, type: 'supergroup', title: 'فرع مدينة نصر' }, from = { id: 7, first_name: 'أحمد' };
  const msg = (text, replyTo) => queue.push({ update_id: nextUpdate++, message: { message_id: nextUpdate * 10, chat, from, text, ...(replyTo ? { reply_to_message: { message_id: replyTo, text: '' } } : {}) } });
  const tap = (data, messageId = 5) => queue.push({ update_id: nextUpdate++, callback_query: { id: 'q' + nextUpdate, from, data, message: { message_id: messageId, chat } } });
  const tick = async () => { t.advance(6000); await t.app.telegramTick(t.app.now()); };
  const last = () => sent[sent.length - 1];
  try {
    const admin = await t.admin();
    await admin('POST', '/api/telegram', { action: 'token', token: '123456:' + 'a'.repeat(35) });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-100', title: 'Calls' });
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-11-11', branches: [{ name: 'مدينة نصر' }] } });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-300', title: 'فرع مدينة نصر', target: 'branch', branch: 'مدينة نصر' });
    const { token } = (await admin('POST', '/api/talabat/token')).body;
    await t.call('POST', '/api/site/panel', { headers: { 'x-talabat-token': token }, body: { board: 'central', orders: [{ id: 30831, number: '30831', status: 'app-preparing', stage: 0, fulfillment: 'delivery',
      createdAt: s(0), branchId: 'nasr-city', branchName: 'مدينة نصر', paymentMethod: 'كاش عند الاستلام', total: 344, customer: { name: 'نوره', phone: '01097159082', address: 'شارع مكرم عبيد' },
      financial: { due: 344, dueLabel: 'المطلوب تحصيله', onlinePaid: 0, rows: [{ amount: 404, label: 'الأصناف' }, { amount: 40, label: 'رسوم التوصيل' }, { amount: -100, label: 'تسويات' }] },
      items: [{ name: 'ورق عنب', quantity: 1, total: '105.00 EGP', details: [] }] }] } });

    // Off until a supervisor turns it on for the branch: nothing is read.
    msg('/menu'); await tick();
    assert.equal(offsetSeen, null);
    assert.equal((await admin('POST', '/api/bot', { action: 'branches', branches: ['مدينة نصر'] })).status, 200);
    queue.length = 0;
    msg('/menu'); await tick();
    assert.equal(last().chat, '-300'); assert.match(last().text, /بوت مرصد الدهان/);
    assert.ok(last().markup.inline_keyboard.length >= 5, 'the menu buttons');

    // «حالة أوردر» → the bot asks for the number → answers from the Marsad.
    tap('bot:status'); await tick();
    assert.ok(last().markup.force_reply); const ask = 1000 + sent.length;
    msg('30831', ask); await tick();
    assert.match(last().text, /أوردر الموقع #30831 — مدينة نصر/);
    assert.match(last().text, /كاش — يتحصّل 344 ج/);
    assert.match(last().text, /ورق عنب/);
    assert.match(last().text, /لسه ما اتسجلش/);
    msg('99999', ask); await tick();
    assert.match(last().text, /مالقيتش أوردر رقم 99999/);

    // «صنف خلصان» → a call for the call center; the branch is told.
    tap('bot:item_out'); await tick();
    msg('30831 ورق العنب خلصان، البديل ممبار', 1000 + sent.length); await tick();
    assert.match(last().text, /الكول سنتر هيكلم العميل \(أوردر #30831\)/);
    await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1111' });
    const sara = (await t.call('POST', '/api/transfer/login', { body: { pin: '1111' } })).body.token;
    const cc = (method, path, body) => t.call(method, path, { body, headers: { 'x-transfer-session': sara } });
    const calls = (await cc('GET', '/api/bot/calls')).body.calls;
    assert.equal(calls.length, 1); assert.equal(calls[0].order.customer.name, 'نوره'); assert.match(calls[0].text, /البديل ممبار/);
    assert.equal((await cc('POST', '/api/bot/calls', { id: calls[0].id, action: 'claim' })).status, 200);
    assert.equal((await cc('POST', '/api/bot/calls', { id: calls[0].id, action: 'outcome', outcome: 'substitute' })).status, 400, 'what the customer said is required');
    assert.equal((await cc('POST', '/api/bot/calls', { id: calls[0].id, action: 'outcome', outcome: 'cancel', note: 'مش عايز بديل' })).status, 200);
    assert.match(last().text, /العميل عايز يلغي الأوردر #30831 — مش عايز بديل\. مستنيين موافقة المشرف/);
    assert.equal((await cc('GET', '/api/bot/calls')).body.calls.length, 0);

    // The supervisor approves in the Marsad; the branch is told.
    const open = (await admin('GET', '/api/bot')).body.open;
    assert.equal(open.length, 1); assert.equal(open[0].needs, 'approval'); assert.equal(open[0].code, '30831');
    assert.equal((await admin('POST', '/api/bot', { id: open[0].id, action: 'reject' })).status, 400, 'a rejection says why');
    assert.equal((await admin('POST', '/api/bot', { id: open[0].id, action: 'approve' })).status, 200);
    assert.match(last().text, /وافق على إلغاء الأوردر #30831/);
    assert.match(t.app.db.raw.prepare("SELECT text FROM telegram_log WHERE kind = 'botNew'").get().text, /موافقة مطلوبة: إلغاء أوردر #30831/, 'the supervisors were told at once');

    // «حاجة تانية» → the supervisors answer from the Marsad; the branch's reply is added to it.
    tap('bot:other'); await tick();
    msg('الطيار اتأخر نص ساعة', 1000 + sent.length); await tick();
    const caseMsg = 1000 + sent.length;
    const rev = (await admin('GET', '/api/bot')).body.open.find(k => k.needs === 'review');
    assert.ok(rev);
    msg('ولسه ماجاش', caseMsg); await tick();
    assert.match(last().text, /وصل/);
    assert.match((await admin('GET', '/api/bot')).body.open.find(k => k.id === rev.id).text, /ولسه ماجاش/);
    assert.equal((await admin('POST', '/api/bot', { id: rev.id, action: 'reply', note: 'كلمنا مسؤول الطيارين', close: true })).status, 200);
    assert.match(last().text, /كلمنا مسؤول الطيارين/);

    // A call nobody made in 10 minutes → the supervisors' group.
    tap('bot:call'); await tick();
    msg('30831 العميل عايز يغير العنوان', 1000 + sent.length); await tick();
    t.advance(11 * 60000); await tick();
    const late = t.app.db.raw.prepare("SELECT * FROM telegram_log WHERE kind = 'botLate'").all();
    assert.equal(late.length, 1); assert.match(late[0].text, /مكالمة للعميل ما اتعملتش/);
    const review = (await admin('GET', '/api/bot')).body;
    assert.ok(review.answers.some(a => a.kind === 'status'), 'every answer kept for review');
  } finally { await t.close(); fake.close(); }
});
