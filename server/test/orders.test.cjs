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
    assert.match(back.text, /رجع يقرا/);
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
      { key: 'late:1', kind: 'ordersLate', text: 'late', branch: 'التجمع' }, { key: 'pay:2', kind: 'ordersEntry', text: 'entry' }] }) });
    await admin('POST', '/api/telegram', { action: 'chat', chatId: '-250', title: 'فرع التجمع', target: 'branch', branch: 'التجمع' });
    sent.length = 0;
    await t.app.telegramTick(t.clock.now);
    const to = Object.fromEntries(sent.map(m => [m.text, m.chat_id]));
    assert.equal(to.late, '-250', 'a branch message goes to its own branch group only');
    assert.equal(to.entry, '-300');
    assert.ok(!sent.some(m => m.chat_id === '-200'), 'never to the shared branches group');
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
    await push({});
    await admin('POST','/api/telegram',{action:'chat',chatId:'-250',title:'فرع التجمع',target:'branch',branch:'التجمع'});
    sent.length=0;
    await push({alerts:[{key:'late:9',kind:'ordersLate',text:'late',branch:'التجمع'},{key:'pay:8',kind:'ordersEntry',text:'entry'}],issues:[{no:8}],totals:{issues:1}});
    await t.app.telegramTick();
    assert.deepEqual(sent.map(x=>[x.text,x.chat_id]),[['late','-250']], 'online must wait, never use Calls');
    await admin('POST','/api/telegram',{action:'chat',chatId:'-300',title:'Online',target:'online'});
    await t.app.telegramTick();
    const warning=sent.find(x=>x.text==='entry');assert.equal(warning.chat_id,'-300');
    const branchId=(await t.app.db.prepare("SELECT message_id FROM telegram_log WHERE key='b:orders:2026-10-22:late:9'").get()).message_id;
    await admin('POST','/api/telegram',{action:'chat',chatId:'-400',title:'فرع التجمع الجديد',target:'branch',branch:'التجمع'});
    await push({lateOut:[{no:9,sn:484,out:'2026-10-22T10:10:00Z'}],issues:[]}); // incomplete snapshot cannot clear entry
    await t.app.telegramTick();
    assert.equal(sent.filter(x=>x.text.includes('غلطة الضرب اتصلّحت')).length,0);
    const reply=sent.find(x=>x.text.includes('خرج مع الطيار'));
    assert.match(reply.text,/أوردر 484 /,'the state change shows the small serial, not the internal number');
    assert.equal(reply.chat_id,'-250','a reply stays where its warning went');assert.equal(reply.reply_parameters.message_id,branchId);
    await push({lateOut:[{no:9,out:'2026-10-22T10:10:00Z'}],issues:[],totals:{issues:0}});
    await t.app.telegramTick();
    assert.equal(sent.find(x=>x.text.includes('غلطة الضرب اتصلّحت')).chat_id,'-300');
    await push({lateOut:[{no:9,out:'2026-10-22T10:10:00Z'}],issues:[],totals:{issues:0}});
    await t.app.telegramTick();
    assert.equal(sent.filter(x=>x.text.includes('خرج مع الطيار')).length,1);
    assert.equal(sent.filter(x=>x.text.includes('غلطة الضرب اتصلّحت')).length,1);
    await push({alerts:[{key:'cancel:11',orderNo:11,kind:'ordersCancel',text:'cancel',branch:'التجمع'}]});
    await t.app.telegramTick();assert.equal(sent.find(x=>x.text==='cancel').chat_id,'-400');
    await push({alerts:[{key:'cancel:11',orderNo:11,kind:'ordersCancel',status:'resolved',text:'cancel changed',branch:'التجمع'}]});
    await t.app.telegramTick();assert.equal(sent.find(x=>x.text==='cancel changed').chat_id,'-400');
    assert.ok(sent.find(x=>x.text==='cancel changed').reply_parameters.message_id);
  } finally {await t.close();tg.close();}
});

test('orders: every change answers its warning (very late, discount changed; an Apex cancellation closes it quietly), with the small serial', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const push = body => t.call('POST', '/api/orders/push', { body: payload(body), headers: { 'x-orders-token': token } });
    const log = () => t.app.db.raw.prepare("SELECT key, text, reply_to FROM telegram_log WHERE kind LIKE 'orders%' ORDER BY id").all();
    const open = [{ no: 3526805, sn: 421, branch: 'التجمع', kind: 'Hotline', at: '2026-10-22T09:00:00Z', wait: 31 }];
    await push({ open, alerts: [{ key: 'late:3526805', kind: 'ordersLate', text: 'late 421', sn: 421 }, { key: 'disc:3526806', kind: 'ordersDiscount', text: 'disc 422', sn: 422, status: 'd100' }] });
    await push({ open, alerts: [{ key: 'vlate:3526805', kind: 'ordersLate', text: 'very late 421', sn: 421 }] });
    let l = log();
    const vl = l.find(x => x.text === 'very late 421');
    assert.equal(vl.reply_to, 'orders:2026-10-22:late:3526805', 'very late answers the late warning');
    // The monitor's follow-ups: unchanged ones are quiet, a change is a reply; one never warned about is ignored.
    const follow = [{ key: 'disc:3526806', kind: 'ordersDiscount', text: 'disc now 50', status: 'd100', follow: true },
      { key: 'late:3526805', kind: 'ordersLate', text: 'x', status: 'active', follow: true }, { key: 'disc:999', kind: 'ordersDiscount', text: 'never', status: 'd1', follow: true }];
    await push({ open, alerts: follow });
    assert.equal(log().length, l.length, 'nothing changed');
    follow[0].status = 'd50';
    await push({ open, alerts: [...follow, { key: 'late:3526805', kind: 'ordersLate', text: '🔄 أوردر 421 اتلغى', status: 'deleted', follow: true }] });
    l = log();
    assert.equal(l.find(x => x.text === 'disc now 50').reply_to, 'orders:2026-10-22:disc:3526806');
    assert.ok(!l.some(x => x.text === '🔄 أوردر 421 اتلغى'), 'an Apex cancellation sends nothing');
    assert.ok(!l.some(x => x.text === 'never'));
    // A cancelled order is not answered a second time by the server's own «cancelled after the late warning».
    await push({ open: [], cancels: [{ no: 3526805, sn: 421, branch: 'التجمع', kind: 'Hotline' }] });
    assert.equal(log().length, l.length);
    assert.ok(!log().some(x => /3526805/.test(x.text)), 'the internal number is never written');
    // A discount warned before amounts were tracked: the first follow-up is taken quietly, the next change answers.
    await push({ alerts: [{ key: 'disc:3526807', kind: 'ordersDiscount', text: 'old disc' }] });
    const n0 = log().length;
    await push({ alerts: [{ key: 'disc:3526807', kind: 'ordersDiscount', text: 'same', status: 'd80', follow: true }] });
    assert.equal(log().length, n0);
    await push({ alerts: [{ key: 'disc:3526807', kind: 'ordersDiscount', text: 'changed', status: 'd0', follow: true }] });
    assert.equal(log().at(-1).text, 'changed');
  } finally { await t.close(); }
});

test('orders: an order for a set time — reminders every 15 minutes under the warning, and the time in the «left» reply', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const push = body => t.call('POST', '/api/orders/push', { body: payload(body), headers: { 'x-orders-token': token } });
    const log = () => t.app.db.raw.prepare("SELECT key, text, reply_to FROM telegram_log WHERE kind LIKE 'orders%' ORDER BY id").all();
    const open = [{ no: 3526900, sn: 600, branch: 'التجمع', kind: 'Hotline', at: '2026-10-22T15:00:00Z', sched: '2026-10-22T18:00:00Z', wait: 150 }];
    await push({ open, alerts: [{ key: 'late:3526900', kind: 'ordersLate', text: 'late 600', sn: 600 }] });
    await push({ open, alerts: [{ key: 'late:3526900', kind: 'ordersLate', text: '⏰ 600 بقاله 210', status: 'r1', follow: true }] });
    await push({ open, alerts: [{ key: 'late:3526900', kind: 'ordersLate', text: '⏰ 600 بقاله 210', status: 'r1', follow: true }] });
    await push({ open, alerts: [{ key: 'late:3526900', kind: 'ordersLate', text: '⏰ 600 بقاله 225', status: 'r2', follow: true }] });
    let l = log().filter(x => x.reply_to === 'orders:2026-10-22:late:3526900');
    assert.deepEqual(l.map(x => x.text), ['⏰ 600 بقاله 210', '⏰ 600 بقاله 225'], 'one reminder per 15 minutes');
    await push({ open: [], lateOut: [{ no: 3526900, sn: 600, branch: 'التجمع', kind: 'Hotline', out: '2026-10-22T17:45:00Z', sched: '2026-10-22T18:00:00Z', wait: 165 }] });
    const out = log().find(x => /خرج مع الطيار/.test(x.text));
    assert.match(out.text, /أوردر 600 /); assert.match(out.text, /الميعاد المطلوب كان 09:00 م/);
  } finally { await t.close(); }
});

test('orders: a comment alone never sends anything, and is never pasted under other messages (the monitor puts comments inside its alerts)', async()=>{
 const t=await start();try{
 const admin=await t.admin(),{token}=(await admin('POST','/api/orders/token')).body;
 const push=body=>t.call('POST','/api/orders/push',{headers:{'x-orders-token':token},body:payload(body)});
 await push({alerts:[{key:'note:55',orderNo:55,kind:'ordersComment',text:'💬 أوردر عليه كومنت — قديم'}]});
 assert.equal((await t.app.db.prepare('SELECT COUNT(*) n FROM telegram_log').get()).n,0);
 await push({open:[{no:55,sn:7,branch:'التجمع'}],alerts:[{key:'late:55',orderNo:55,sn:7,kind:'ordersLate',text:'تأخير أوردر 7\n💬 ملاحظة الأوردر: بدون بصل'}]});
 const warning=await t.app.db.prepare("SELECT * FROM telegram_log WHERE kind='ordersLate'").get();assert.match(warning.text,/بدون بصل/);assert.doesNotMatch(warning.text,/قديم/);
 await push({lateOut:[{no:55,sn:7,branch:'التجمع',out:'2026-10-22T10:10:00Z',pilot:'P'}]});
 const reply=await t.app.db.prepare('SELECT * FROM telegram_log WHERE reply_to=?').get(warning.key);assert.ok(reply);assert.match(reply.text,/أوردر 7/);assert.doesNotMatch(reply.text,/قديم|كومنت/);
 }finally{await t.close();}
});
