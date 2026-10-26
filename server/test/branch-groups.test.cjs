'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

test('telegram: each branch has its own group; its alerts and their replies go there too', async () => {
  const sent = [], fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const method = req.url.split('/').pop(), b = JSON.parse(body || '{}');
      const result = method === 'getMe' ? { username: 'marsad_bot' } : method === 'getUpdates' ? [] : (sent.push({ chat: String(b.chat_id), text: b.text, reply: b.reply_parameters?.message_id ?? null }), { message_id: sent.length });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise(r => fake.listen(0, r));
  const t0 = cairoToUtc(2026, 10, 22, 20, 0, 0), at = m => new Date(t0 + m * 60000).toISOString();
  const t = await start({ at: t0 + 60 * 60000, config: { telegramApi: 'http://127.0.0.1:' + fake.address().port } });
  try {
    const admin = await t.admin();
    await admin('POST', '/api/telegram', { action: 'token', token: '123456:' + 'a'.repeat(35) });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-100', title: 'Calls' });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-200', title: 'Branches', target: 'branches' });
    const ot = (await admin('POST', '/api/orders/token')).body.token;
    const push = body => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': ot }, body: { v: 1, day: '2026-10-22', branches: [{ name: 'التجمع' }, { name: 'مدينتي' }], ...body } });
    await push({});
    const cfg = (await admin('GET', '/api/telegram')).body;
    assert.deepEqual(cfg.branchNames, ['التجمع', 'مدينتي']);
    assert.equal((await admin('POST', '/api/telegram', { action: 'chat', chatId: '-300', title: 'فرع التجمع', target: 'branch', branch: 'التجمع' })).status, 200);
    assert.match(sent.pop().text, /كجروب فرع التجمع/);
    assert.deepEqual((await admin('GET', '/api/telegram')).body.branchGroups, { 'التجمع': { id: '-300', title: 'فرع التجمع' } });
    // A late order at Tagamoa (to the managers' group and Tagamoa's), one at Madinaty (managers only).
    await push({ open: [{ no: 51, branch: 'التجمع', kind: 'Hotline', at: at(0), wait: 31 }, { no: 52, branch: 'مدينتي', kind: 'Hotline', at: at(0), wait: 31 }],
      alerts: [{ key: 'late:51', kind: 'ordersLate', text: 'late 51' }, { key: 'late:52', kind: 'ordersLate', text: 'late 52' }] });
    await t.app.telegramTick(); await t.app.telegramTick();
    assert.deepEqual(sent.filter(s => s.text.startsWith('late')).map(s => s.chat + ' ' + s.text).sort(), ['-200 late 51', '-200 late 52', '-300 late 51']);
    // It left: the reply goes to both, each under its own message.
    await push({ open: [], lateOut: [{ no: 51, branch: 'التجمع', kind: 'Hotline', out: at(35), wait: 35, pilot: 'p' }, { no: 52, branch: 'مدينتي', kind: 'Hotline', out: at(36), wait: 36 }] });
    await t.app.telegramTick(); await t.app.telegramTick();
    const r51 = sent.filter(s => /أوردر 51/.test(s.text));
    assert.deepEqual(r51.map(s => s.chat).sort(), ['-200', '-300']);
    for (const r of r51) assert.equal(sent[r.reply - 1].chat, r.chat, 'replied in the same chat');
    const log = (await admin('GET', '/api/telegram?log=1&date=2026-10-22')).body.log;
    assert.ok(log.some(l => l.group === 'فرع التجمع'));
    assert.equal((await admin('POST', '/api/telegram', { action: 'unlinkBranch', branch: 'التجمع' })).status, 200);
    assert.deepEqual((await admin('GET', '/api/telegram')).body.branchGroups, {});
  } finally { await t.close(); fake.close(); }
});
