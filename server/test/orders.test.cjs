'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

const payload = (extra = {}) => ({
  v: 1, day: '2026-10-22', generatedAt: '2026-10-22T10:00:00Z',
  totals: { orders: 3, open: 1, late: 0, cancels: 1 },
  branches: [{ no: 1, name: 'التجمع', orders: 3 }], open: [], employees: [], cancels: [], hours: [],
  ...extra,
});

test('orders: monitor key, push, live view and alerts into the Telegram log', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    // No key yet: pushes are refused.
    assert.equal((await t.call('POST', '/api/orders/push', { body: payload(), headers: { 'x-orders-token': 'x' } })).status, 401);
    assert.equal((await admin('GET', '/api/orders/token')).body.linked, false);
    const { token } = (await admin('POST', '/api/orders/token')).body;
    assert.match(token, /^ord_[a-f0-9]{48}$/);
    const push = body => t.call('POST', '/api/orders/push', { body, headers: { 'x-orders-token': token } });
    assert.equal((await push({ day: 'bad' })).status, 400);
    const r = await push(payload({ alerts: [
      { key: 'del:5', kind: 'ordersCancel', text: '❌ إلغاء أوردر 5' },
      { key: 'x', kind: 'notAKind', text: 'ignored' },
    ] }));
    assert.equal(r.status, 200);
    // Same alert again is stored once.
    await push(payload({ alerts: [{ key: 'del:5', kind: 'ordersCancel', text: '❌ إلغاء أوردر 5' }] }));
    const live = (await admin('GET', '/api/orders/live?day=2026-10-22')).body;
    assert.equal(live.data.totals.orders, 3);
    assert.equal(live.data.alerts, undefined);
    assert.equal(live.linked, true);
    assert.equal(live.alerts.length, 1);
    assert.equal(live.alerts[0].kind, 'ordersCancel');
    // day=latest follows the day the monitor pushed last, whatever the 9 ص day is.
    const latest = (await admin('GET', '/api/orders/live?day=latest')).body;
    assert.equal(latest.day, '2026-10-22');
    assert.equal(latest.data.totals.orders, 3);
    // A viewer can read; only the main admin can make a key.
    await admin('POST', '/api/admin-access', { name: 'V', role: 'viewer', password: 'viewer-pass', confirmation: 'viewer-pass' });
    const vt = await t.login('viewer-pass');
    assert.equal((await t.call('GET', '/api/orders/live', { headers: { 'x-admin-password': vt } })).status, 200);
    assert.equal((await t.call('POST', '/api/orders/token', { headers: { 'x-admin-password': vt } })).status, 403);
    // A new key replaces the old one.
    await admin('POST', '/api/orders/token');
    assert.equal((await push(payload())).status, 401);
  } finally { await t.close(); }
});

test('orders: a switched-off kind is logged but not sent; the monitor stopping is reported once and its return answered', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const push = body => t.call('POST', '/api/orders/push', { body, headers: { 'x-orders-token': token } });
    await t.app.db.prepare("INSERT INTO telegram_config (id, rules) VALUES (1, ?)").run(JSON.stringify({ ordersDiscount: false }));
    await push(payload({ alerts: [{ key: 'disc:9', kind: 'ordersDiscount', text: 'خصم' }, { key: 'late:9', kind: 'ordersLate', text: 'تأخير' }] }));
    const rows = await t.app.db.prepare("SELECT kind, sent_at, target FROM telegram_log WHERE kind LIKE 'orders%' ORDER BY kind").all();
    assert.deepEqual(rows.map(r => [r.kind, r.sent_at != null, r.target]), [['ordersDiscount', true, 'online'], ['ordersLate', false, 'branches']]);
    // 4 minutes of silence during operating hours (12:00 Cairo): one "stopped" alert.
    t.advance(4 * 60000);
    await t.call('GET', '/health');            // health is answered before routes, so use a routed request
    await admin('GET', '/api/orders/token');
    t.advance(61000);
    await admin('GET', '/api/orders/token');
    const stale = await t.app.db.prepare("SELECT key FROM telegram_log WHERE key LIKE 'orders:stale:%'").all();
    assert.equal(stale.length, 1);
    await push(payload());
    const back = await t.app.db.prepare("SELECT text, reply_to FROM telegram_log WHERE key = ?").get('resolved:' + stale[0].key);
    assert.match(back.text, /رجع يشتغل/);
    assert.equal(back.reply_to, stale[0].key);
  } finally { await t.close(); }
});

test('telegram: branch alerts go to the branch managers group, the rest to the main group', async () => {
  const sent = [];
  const http = require('node:http');
  const tg = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const m = req.url.split('/').pop(); const body = JSON.parse(b || '{}');
    if (m === 'sendMessage') sent.push(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: m === 'getMe' ? { username: 'bot' } : { message_id: sent.length } }));
  }); });
  await new Promise(r => tg.listen(0, r));
  const t = await start({ config: { telegramApi: 'http://127.0.0.1:' + tg.address().port } });
  try {
    const admin = await t.admin();
    await admin('POST', '/api/telegram', { action: 'token', token: '123456:' + 'a'.repeat(35) });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-100', title: 'CC' });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-300', title: 'Online', target: 'online' });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-200', title: 'Branches', target: 'branches' });
    const cfg = (await admin('GET', '/api/telegram')).body;
    assert.equal(cfg.branchChat.title, 'Branches');
    assert.equal(cfg.chat.title, 'CC');
    assert.ok(cfg.rules.some(r => r.key === 'ordersLate'));
    const { token } = (await admin('POST', '/api/orders/token')).body;
    await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: payload({ alerts: [
      { key: 'late:1', kind: 'ordersLate', text: 'late' }, { key: 'pay:2', kind: 'ordersEntry', text: 'entry' }] }) });
    sent.length = 0;
    await t.app.telegramTick(t.clock.now);
    const to = Object.fromEntries(sent.map(m => [m.text, m.chat_id]));
    assert.equal(to.late, '-200');
    assert.equal(to.entry, '-300');
  } finally { await t.close(); tg.close(); }
});

test('orders: state replies stay in their original department, missing groups never fall back', async () => {
  const sent = [], http = require('node:http');
  const tg = http.createServer((req,res) => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
    const body=JSON.parse(b||'{}'), method=req.url.split('/').pop();
    if(method==='sendMessage') sent.push(body);
    res.setHeader('content-type','application/json'); res.end(JSON.stringify({ok:true,result:method==='getMe'?{username:'bot'}:{message_id:sent.length}}));
  }); });
  await new Promise(r=>tg.listen(0,r));
  const t=await start({config:{telegramApi:'http://127.0.0.1:'+tg.address().port}});
  try {
    const admin=await t.admin();
    await admin('POST','/api/telegram',{action:'token',token:'123456:'+'a'.repeat(35)});
    await admin('POST','/api/telegram',{action:'chat',chatId:'-100',title:'Calls'});
    await admin('POST','/api/telegram',{action:'chat',chatId:'-200',title:'Branches',target:'branches'});
    const {token}=(await admin('POST','/api/orders/token')).body;
    const push=body=>t.call('POST','/api/orders/push',{body:payload(body),headers:{'x-orders-token':token}});
    sent.length=0;
    await push({alerts:[{key:'late:9',kind:'ordersLate',text:'late'},{key:'pay:8',kind:'ordersEntry',text:'entry'}],issues:[{no:8}],totals:{issues:1}});
    await t.app.telegramTick();
    assert.deepEqual(sent.map(x=>[x.text,x.chat_id]),[['late','-200']], 'online must wait, never use Calls');
    await admin('POST','/api/telegram',{action:'chat',chatId:'-300',title:'Online',target:'online'});
    await t.app.telegramTick();
    const warning=sent.find(x=>x.text==='entry');assert.equal(warning.chat_id,'-300');
    const branchId=(await t.app.db.prepare("SELECT message_id FROM telegram_log WHERE key='orders:2026-10-22:late:9'").get()).message_id;
    await admin('POST','/api/telegram',{action:'chat',chatId:'-400',title:'New Branches',target:'branches'});
    await push({lateOut:[{no:9,sn:484,out:'2026-10-22T10:10:00Z'}],issues:[]}); // incomplete snapshot cannot clear entry
    await t.app.telegramTick();
    assert.equal(sent.filter(x=>x.text.includes('مشكلة الضرب')).length,0);
    const reply=sent.find(x=>x.text.includes('خرج مع الطيار'));
    assert.match(reply.text,/أوردر 484 /,'the state change shows the small serial, not the internal number');
    assert.equal(reply.chat_id,'-200');assert.equal(reply.reply_parameters.message_id,branchId);
    await push({lateOut:[{no:9,out:'2026-10-22T10:10:00Z'}],issues:[],totals:{issues:0}});
    await t.app.telegramTick();
    assert.equal(sent.find(x=>x.text.includes('مشكلة الضرب')).chat_id,'-300');
    await push({lateOut:[{no:9,out:'2026-10-22T10:10:00Z'}],issues:[],totals:{issues:0}});
    await t.app.telegramTick();
    assert.equal(sent.filter(x=>x.text.includes('خرج مع الطيار')).length,1);
    assert.equal(sent.filter(x=>x.text.includes('مشكلة الضرب')).length,1);
    await push({alerts:[{key:'cancel:11',orderNo:11,kind:'ordersCancel',text:'cancel'}]});
    await t.app.telegramTick();assert.equal(sent.find(x=>x.text==='cancel').chat_id,'-400');
    await push({alerts:[{key:'cancel:11',orderNo:11,kind:'ordersCancel',status:'resolved',text:'cancel changed'}]});
    await t.app.telegramTick();assert.equal(sent.find(x=>x.text==='cancel changed').chat_id,'-400');
    assert.ok(sent.find(x=>x.text==='cancel changed').reply_parameters.message_id);
  } finally {await t.close();tg.close();}
});
