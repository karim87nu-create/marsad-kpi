'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('telegram: link the bot and the group, then each alert is sent once', async () => {
  const sent = [], fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const method = req.url.split('/').pop(), b = JSON.parse(body || '{}');
      const result = method === 'getMe' ? { username: 'marsad_bot' } : method === 'getUpdates' ? [{ message: { chat: { id: -100123, title: 'مشرفين الكول سنتر', type: 'supergroup' } } }] : (sent.push(b.text), { message_id: sent.length });
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
    assert.match(sent.at(-1), /في بريك بقاله 21 د/);
    await t.event(s.token, 'break_end', { state: 'ready', durationSeconds: 21 * 60 });
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    // Long call.
    await t.event(s.token, 'agentlinked', { callId: '9', phone: '0100', state: 'on_call' });
    await t.tick(s.token, 5 * 60000, 'on_call');
    await t.app.telegramTick();
    assert.match(sent.at(-1), /مكالمة طويلة: Ahmed/);
    assert.equal(sent.filter(x => x.includes('أنهى البريك')).length, 2, 'both break notifications get a recovery');
    await t.app.telegramTick();
    assert.equal(sent.filter(x => x.includes('أنهى البريك')).length, 2, 'recovery is not repeated');
    await t.event(s.token, 'agentunlinked', { callId: '9', durationSeconds: 300, state: 'ready' });
    // Logout with the day's summary.
    await t.device(s.token, 'POST', '/api/session/end', { reason: 'arabicss_logout' });
    await t.app.telegramTick();
    assert.match(sent.at(-1), /خرج/);
    assert.match(sent.at(-1), /مكالماته النهارده: 1/);
    assert.equal(sent.filter(x => x.includes('أنهى المكالمة الطويلة')).length, 1);
    const returned = await t.session(); await t.event(returned.token, 'heartbeat', { state: 'ready' }); await t.app.telegramTick();
    assert.match(sent.at(-1), /رجع للعمل/);
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
    t.app.latestLive = async () => ({ observed_at: t.clock.now, rows: '[]' }); await t.app.telegramTick(); assert.match(sent.at(-1), /انتهى انتظار/);
    t.app.live = live; t.app.latestLive = snap;
    // Switching a rule off stops it.
    await admin('POST', '/api/telegram', { action: 'settings', enabled: true, rules: { breakStart: false } });
    const log = (await admin('GET', '/api/telegram?log=1&date=2026-10-22')).body.log;
    assert.equal(log.length, sent.length);
    assert.ok(log.every(x => x.sentAt));
    void e;
  } finally { await t.close(); fake.close(); }
});
