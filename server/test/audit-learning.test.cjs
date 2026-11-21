const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('./helpers.cjs');
test('corrected evidence retains history but only current confirmed facts affect learning; no match retracts only its scope',async()=>{
 const t=await start();try{
  const kind='match-v2:branch:talabat';
  await t.app.learn.record(kind,'store','wrong','one');
  await t.app.learn.record(kind,'other','safe','two');
  await t.app.learn.replace('talabat','one',[{kind,a:'store',b:'right',value:null}]);
  let p=await t.app.learn.pairs(kind);
  assert.equal(p.get('store').has('wrong'),false);assert.equal(p.get('store').get('right'),1);assert.equal(p.get('other').get('safe'),1);
  assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM learned WHERE ref=?').get('one').n,2,'historical evidence retained');
  await t.app.learn.replace('talabat','one',[]);p=await t.app.learn.pairs(kind);
  assert.equal(p.has('store'),false);assert.equal(p.get('other').get('safe'),1);
 }finally{await t.close();}
});
test('GET site/day does not write learning even when a code match is found',async()=>{
 const t=await start();try{
  const admin=await t.admin(),now=t.clock.now;
  t.app.db.raw.prepare("INSERT INTO site_orders(id,day,created_at,branch) VALUES(101,'2026-10-22',?,'التجمع')").run(now);
  t.app.db.raw.prepare("INSERT INTO orders_days(day,data,received_at) VALUES('2026-10-22',?,?)").run(JSON.stringify({online:[{no:1,kind:'الموقع',tag:'101',at:new Date(now).toISOString(),branch:'التجمع'}]}),now);
  const writes=()=> t.app.db.raw.prepare('SELECT COUNT(*) n FROM learning_evidence').get().n;
  await admin('GET','/api/site/day?day=2026-10-22');await admin('GET','/api/site/day?day=2026-10-22');assert.equal(writes(),0);
 }finally{await t.close();}
});
test('11-21: old learned facts without evidence are copied once, read the same, and the full scan is skipped afterwards',async()=>{
 const t=await start();try{
  const kind='match-v2:branch:talabat',raw=t.app.db.raw;
  raw.prepare('INSERT INTO learned (kind,a,b,ref,value,at) VALUES (?,?,?,?,NULL,1)').run(kind,'old','branchA','r1');
  raw.prepare('INSERT INTO learned (kind,a,b,ref,value,at) VALUES (?,?,?,?,2,5)').run('match-v2:delay:talabat','old','-','r1');
  t.app.learn.forget();
  const p=await t.app.learn.pairs(kind);
  assert.equal(p.get('old').get('branchA'),1);
  assert.equal(raw.prepare("SELECT value FROM settings WHERE key='learn_legacy_migrated'").get().value,'1');
  const ev=raw.prepare("SELECT facts FROM learning_evidence WHERE source='talabat' AND ref='r1'").get();
  assert.equal(JSON.parse(ev.facts).length,2);
  assert.deepEqual(await t.app.learn.values('match-v2:delay:talabat','old'),[2]);
  await t.app.learn.record(kind,'new','branchB','r2');t.app.learn.forget();
  assert.equal((await t.app.learn.pairs(kind)).get('new').get('branchB'),1);
 }finally{await t.close();}
});
