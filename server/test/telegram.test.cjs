'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('telegram: link the bot and the group, then each alert is sent once', async () => {
  const sent = [], replies = [], fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const method = req.url.split('/').pop(), b = JSON.parse(body || '{}');
      const result = method === 'getMe' ? { username: 'marsad_bot' } : method === 'getUpdates' ? [{ message: { chat: { id: -100123, title: 'مشرفين الكول سنتر', type: 'supergroup' } } }] : (sent.push(b.text), replies.push(b.reply_parameters?.message_id ?? null), { message_id: sent.length });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise(r => fake.listen(0, r));
  const t = await start({ at: cairoToUtc(2026, 10, 22, 14, 0, 0), config: { telegramApi: 'http://127.0.0.1:' + fake.address().port } });
  try {
    const admin = await t.admin();
    assert.equal((await admin('POST', '/api/telegram', { action: 'token', token: 'bad' })).status, 400);
    assert.equal((await admin('POST', '/api/telegram', { action: 'token', token: '123456:' + 'a'.repeat(35) })).body.botName, 'marsad_bot');
    const { chats } = (await admin('POST', '/api/telegram', { action: 'discover' })).body;
    assert.equal(chats[0].title, 'مشرفين الكول سنتر');
    assert.equal((await admin('POST', '/api/telegram', { action: 'chat', chatId: chats[0].id, title: chats[0].title })).status, 200);
    assert.match(sent.pop(), /اتربط/);
    const cfg = (await admin('GET', '/api/telegram')).body;
    assert.equal(cfg.enabled, true);
    assert.ok(cfg.rules.every(r => r.on));
    // A token stored in the database is not readable.
    assert.ok(!t.app.db.raw.prepare('SELECT bot_token FROM telegram_config').get().bot_token.includes('aaaa'));

    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    const p = await t.device(s.token, 'POST', '/api/break-requests', { action: 'regular_start' });
    await t.event(s.token, 'break_start', { state: 'break', permissionId: p.body.permissionId });
    await t.app.telegramTick();
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Ahmed بدأ بريك/);
    await t.app.telegramTick();
    assert.equal(sent.length, 1, 'not sent twice');
    // Over the allowed 20 minutes.
    await t.tick(s.token, 21 * 60000, 'break');
    await t.app.telegramTick();
    assert.match(sent.at(-1), /Ahmed عدّى وقت البريك — بقاله 21 د والمسموح 20 د/);
    assert.equal(replies.at(-1), 1, 'the over-time alert answers the break-start alert');
    await t.event(s.token, 'break_end', { state: 'ready', durationSeconds: 21 * 60 });
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    // Long call.
    await t.event(s.token, 'agentlinked', { callId: '9', phone: '0100', state: 'on_call' });
    await t.tick(s.token, 5 * 60000, 'on_call');
    await t.app.telegramTick();
    assert.match(sent.at(-1), /مكالمة طويلة: Ahmed/);
    const backs = sent.filter(x => x.includes('رجع من البريك'));
    assert.equal(backs.length, 1, 'one follow-up closes both break alerts');
    assert.match(backs[0], /مدة البريك 21 د من 20 د مسموحة · زيادة 1 د/);
    assert.equal(replies[sent.indexOf(backs[0])], 1, 'sent as a reply to the break-start alert');
    await t.app.telegramTick();
    assert.equal(sent.filter(x => x.includes('رجع من البريك')).length, 1, 'follow-up is not repeated');
    await t.event(s.token, 'agentunlinked', { callId: '9', durationSeconds: 300, state: 'ready' });
    // Logout with the day's summary.
    await t.device(s.token, 'POST', '/api/session/end', { reason: 'arabicss_logout' });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /خرج/);
    assert.match(sent.at(-1), /مكالماته النهارده: 1/);
    assert.equal(sent.filter(x => x.includes('خلّص المكالمة')).length, 1);
    const returned = await t.session(); await t.event(returned.token, 'heartbeat', { state: 'ready' }); await t.app.telegramTick();
    assert.match(sent.at(-1), /رجع للشغل/);
    const live = t.app.live;
    t.app.live = async () => [{ employeeId: e.id, name: 'Ahmed', extension: '101', state: 'unknown', since: new Date(t.clock.now - 240000).toISOString() }];
    await t.app.telegramTick(); assert.match(sent.at(-1), /انقطاع رصد/);
    const before = sent.length; await t.app.telegramTick(); assert.equal(sent.length, before);
    t.app.live = live; await t.app.telegramTick(); assert.match(sent.at(-1), /رجع الرصد/);
    const snap = t.app.latestLive;
    t.app.live = async () => [];
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: JSON.stringify([Array.from({length:11}, (_,i) => i === 10 ? 'waiting' : '')]) });
    await t.app.telegramTick(); t.advance(21000); await t.app.telegramTick(); assert.match(sent.at(-1), /عميل منتظر/);
    t.app.latestLive = async () => null; const stale = sent.length; await t.app.telegramTick(); assert.equal(sent.length, stale, 'no recovery on missing snapshot');
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: '[]' }); await t.app.telegramTick(); assert.match(sent.at(-1), /مفيش عملاء منتظرين/);
    t.app.live = live; t.app.latestLive = snap;
    // Switching a rule off stops it.
    await admin('POST', '/api/telegram', { action: 'settings', enabled: true, rules: { breakStart: false } });
    const log = (await admin('GET', '/api/telegram?log=1&date=2026-10-22')).body.log;
    assert.equal(log.length, sent.length + 1, 'plus the over-time follow-up, logged without being sent');
    assert.ok(log.every(x => x.sentAt));
    void e;
  } finally { await t.close(); fake.close(); }
});

test('telegram: waiting customers, missed calls with who was available, and how the employee left', async () => {
  const sent = [], fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const method = req.url.split('/').pop(), b = JSON.parse(body || '{}');
      const result = method === 'getMe' ? { username: 'marsad_bot' } : (sent.push(b.text), { message_id: sent.length });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise(r => fake.listen(0, r));
  const t = await start({ at: cairoToUtc(2026, 10, 22, 14, 0, 0), config: { telegramApi: 'http://127.0.0.1:' + fake.address().port } });
  try {
    const admin = await t.admin();
    await admin('POST', '/api/telegram', { action: 'token', token: '123456:' + 'a'.repeat(35) });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-100123', title: 'g' });
    sent.length = 0;
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    // A caller waiting: no early warning, one alert once the wait passes 7 s.
    const row = wait => ['7671', '', '', '', '', '', '', '', '0:00:' + String(wait).padStart(2, '0'), '01001234567', 'On Wait'];
    const real = t.app.latestLive;
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: JSON.stringify([row(6)]) });
    const quiet = sent.length; await t.app.telegramTick(); assert.equal(sent.length, quiet, 'no alert before 7 s');
    t.advance(2000);
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: JSON.stringify([row(8)]) });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /عدّى 7 ثواني انتظار/);
    assert.match(sent.at(-1), /••••4567/);
    assert.match(sent.at(-1), /⏳ منتظرين: 1/);
    assert.match(sent.at(-1), /المتاحين: Ahmed/);
    const n = sent.length; t.advance(6000); await t.app.telegramTick(); assert.equal(sent.length, n, 'one alert per caller');
    // The caller leaves the queue with nobody picking up: no guess for 20 s, then one clear reply with the wait.
    t.advance(6000);
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: '[]' });
    const before = sent.length; await t.app.telegramTick(); assert.equal(sent.length, before, 'no verdict in the first seconds after leaving the queue');
    t.advance(21000); t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: '[]' });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /خرج من الانتظار من غير ما حد يرد عليه/);
    assert.match(sent.at(-1), /انتظر حوالي/);
    // A second caller is answered by a signed-in employee: the reply says after how long and who.
    const row2 = wait => ['7671', '', '', '', '', '', '', '', '0:00:' + String(wait).padStart(2, '0'), '01009998887', 'On Wait'];
    t.advance(60000);
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: JSON.stringify([row2(9)]) });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /••••8887/);
    t.advance(6000);
    await t.event(s.token, 'agentlinked', { callId: '901', phone: '01009998887', queue: '7671', callType: 'incoming', state: 'on_call' });
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: '[]' });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /••••8887 اترد عليه بعد 0 د 15 ث انتظار — رد عليه Ahmed \(تحويلة 101\)/);
    await t.event(s.token, 'agentunlinked', { callId: '901', state: 'ready', durationSeconds: 30 });
    // A third caller is answered in Arabicss by an extension nobody signed in on: the live report shows the call.
    const row3 = (wait, status, agent = '') => ['7671', '', agent, '', '', '', '', '', '0:00:' + String(wait).padStart(2, '0'), '01007776665', status];
    t.advance(60000);
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: JSON.stringify([row3(10, 'On Wait')]) });
    await t.app.telegramTick();
    t.advance(4000);
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: JSON.stringify([row3(3, 'Live Call', 'SIP/109')]) });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /••••6665 اترد عليه بعد حوالي .* رد عليه تحويلة 109 \(مش مسجلة في المرصد وقتها\)/);
    t.app.latestLive = real;
    // A missed call in the Arabicss log: who was available while the customer waited.
    const tok = (await admin('POST', '/api/history', { action: 'token' })).body;
    const header = ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status', 'Trunk'];
    const r = await t.call('POST', '/api/history', { headers: { 'x-history-token': tok.token }, body: { rows: [header, ['7671', '', '2026-10-22', '14:00:10', '14:00:40', '00:00:00', '00:00:30', '01001234567', 'Abandoned', 'T']], expectedCount: 1, reportDate: '2026-10-22' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await t.app.telegramTick();
    const missed = sent.find(x => x.startsWith('🔴 مكالمة فائتة'));
    assert.ok(missed, sent.join('\n---\n'));
    assert.match(missed, /كانوا متاحين أثناء انتظاره: Ahmed/);
    // It is threaded under the waiting alert of the same caller.
    assert.match(t.app.db.raw.prepare("SELECT reply_to FROM telegram_log WHERE kind = 'missed'").get().reply_to || '', /^waitSla:01001234567:/);
    // Logging out of the extension says so.
    await t.device(s.token, 'POST', '/api/session/end', { reason: 'extension_logout' });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /سجّل خروج من التحويلة/);
    void e;
  } finally { await t.close(); fake.close(); }
});
