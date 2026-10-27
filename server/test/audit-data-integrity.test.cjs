const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('Apex durable replay acknowledges only persisted batch, preserves snapshot/freshness and deduplicates restart', async () => {
  const t = await start();
  try {
    const admin = await t.admin(), token = (await admin('POST','/api/orders/token')).body.token;
    const push = body => t.call('POST','/api/orders/push',{headers:{'x-orders-token':token},body:{day:'2026-10-22',...body}});
    assert.equal((await push({replayAlerts:true,alerts:[]})).status,409);
    await push({generatedAt:new Date(t.clock.now).toISOString(),online:[{no:1,items:[]} ]});
    const snapshot = t.app.db.raw.prepare('SELECT * FROM orders_days').get();
    const freshness = t.app.db.raw.prepare("SELECT value FROM settings WHERE key='orders_last_push'").get().value;
    t.advance(60000);
    const alerts=Array.from({length:401},(_,i)=>({key:'pay:'+(i+1),kind:'ordersEntry',text:'fixture '+i,branch:'Test'}));
    const result = await push({replayAlerts:true,alerts});
    assert.equal(result.status,200);
    assert.equal(result.body.acknowledgedAlerts.length,400);
    await push({replayAlerts:true,alerts});
    assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE kind='ordersEntry'").get().n,400);
    assert.deepEqual(t.app.db.raw.prepare('SELECT * FROM orders_days').get(),snapshot);
    assert.equal(t.app.db.raw.prepare("SELECT value FROM settings WHERE key='orders_last_push'").get().value,freshness);
    await push({replayAlerts:true,alerts:alerts.slice(400)});
    assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE kind='ordersEntry'").get().n,401);
  } finally { await t.close(); }
});

test('Apex rejects old snapshots, preserves omitted baskets, accepts explicit empty baskets', async () => {
  const t = await start();
  try {
    const admin = await t.admin(), token = (await admin('POST','/api/orders/token')).body.token;
    const push = body => t.call('POST','/api/orders/push',{headers:{'x-orders-token':token},body:{day:'2026-10-22',...body}});
    const at = n => new Date(t.clock.now+n).toISOString();
    await push({generatedAt:at(0), online:[{no:1,items:[{name:'rice',qty:2,price:10}]}]});
    assert.equal((await push({generatedAt:at(-1000),online:[]})).body.ignored,'older_snapshot');
    await push({generatedAt:at(1000),online:[{no:1}]});
    const read = () => JSON.parse(t.app.db.raw.prepare('SELECT data FROM orders_days').get().data);
    assert.equal(read().online[0].items.length,1);
    await push({generatedAt:at(2000),online:[{no:1,items:[]}]});
    assert.deepEqual(read().online[0].items,[]);
    assert.equal((await push({online:[]})).body.ignored,'older_snapshot');
  } finally { await t.close(); }
});

test('Woo bounded sync resumes page 7 without advancing the completed cursor past 300 rows', async () => {
  const pages=[];
  const created='2026-10-22T08:00:00', modified='2026-10-22T08:30:00';
  const rows=Array.from({length:301},(_,i)=>({id:i+1,status:'cancelled',date_created_gmt:created,date_modified_gmt:modified,total:'10'}));
  const fake=async url=>{const u=new URL(url);if(u.pathname.endsWith('/notes'))return Response.json([]);const p=Number(u.searchParams.get('page')||1);if(u.searchParams.get('per_page')==='1')return Response.json(rows.slice(0,1));pages.push(p);return Response.json(rows.slice((p-1)*50,p*50));};
  const t=await start({config:{siteFetch:fake}});
  try {
    const admin=await t.admin();
    await admin('POST','/api/site',{action:'key',key:'ck_'+'a'.repeat(40),secret:'cs_'+'b'.repeat(40)});
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM site_orders').get().n,300);
    assert.equal(JSON.parse(t.app.db.raw.prepare("SELECT value FROM settings WHERE key='site_sync_cursor'").get().value).page,7);
    await t.app.siteSync(t.clock.now+60000);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM site_orders').get().n,301);
    assert.deepEqual(pages,[1,2,3,4,5,6,7]);
    assert.equal(t.app.db.raw.prepare("SELECT value FROM settings WHERE key='site_sync_cursor'").get().value,'null');
  } finally { await t.close(); }
});
