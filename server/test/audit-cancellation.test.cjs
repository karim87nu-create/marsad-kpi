const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('./helpers.cjs');
test('detail queue never charges retries for more than the four orders the connector can consume per cycle',async()=>{
 const t=await start();try{const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token;
 const r=await t.call('POST','/api/talabat/push',{headers:{'x-talabat-token':token},body:{orders:Array.from({length:8},(_,i)=>({id:String(12345670+i),status:'CANCELLED',placedAt:new Date(t.clock.now-i*1000).toISOString()}))}});
 assert.equal(r.body.want.length,4);assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM order_ingest WHERE detail_attempts>0").get().n,4);
 }finally{await t.close();}
});
test('cancellation waits for owner AND reason, requests only incomplete details, then queues once to branch',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token;
  const push=orders=>t.call('POST','/api/talabat/push',{headers:{'x-talabat-token':token},body:{orders}});
  const id='4677382669',at=new Date(t.clock.now-60000).toISOString();
  const count=()=>t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE kind='talabatCancel'").get().n;
  await push([{id,store:'مدينتي',status:'CANCELLED',placedAt:at,detail:{cancelledAt:at,subtotal:637}}]);
  assert.equal(count(),0);
  const get=async()=> (await admin('GET','/api/talabat/day?day=2026-10-22')).body.orders[0];
  assert.equal((await get()).cancellationReadiness,'PENDING');
  t.advance(61000);
  assert.deepEqual((await push([])).body.want,[id]);
  await push([{id,status:'CANCELLED',detail:{cancelOwner:'Customer'}}]);assert.equal(count(),0);
  await push([{id,status:'CANCELLED',detail:{cancelReason:'Customer requested'}}]);
  await push([{id,status:'CANCELLED',detail:{cancelReason:'Customer requested'}}]);
  assert.equal(count(),1);assert.equal((await get()).cancellationReadiness,'READY');
  const row=t.app.db.raw.prepare("SELECT target,branch,text FROM telegram_log WHERE kind='talabatCancel'").get();
  assert.equal(row.target,'branches');assert.equal(row.branch,'مدينتي');assert.match(row.text,/Customer requested/);
 }finally{await t.close();}
});
test('older Talabat observation cannot replace status, customer profile or basket; legacy final status cannot regress',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token;
  const push=o=>t.call('POST','/api/talabat/push',{headers:{'x-talabat-token':token},body:{orders:[o]}});
  const id='12345678',at=new Date(t.clock.now).toISOString(),old=new Date(t.clock.now-1000).toISOString();
  await push({id,status:'CANCELLED',observedAt:at,detail:{items:[{name:'rice',qty:2,price:10}],customer:{name:'A'}}});
  await push({id,status:'ACCEPTED',observedAt:old,detail:{items:[],customer:{name:'B'}}});
  await push({id,status:'ACCEPTED'});
  const row=t.app.db.raw.prepare('SELECT status,items FROM talabat_orders WHERE id=?').get(id);
  assert.equal(row.status,'CANCELLED');assert.equal(JSON.parse(row.items)[0].qty,2);
  assert.equal(JSON.parse(t.app.db.raw.prepare('SELECT data FROM match_profiles WHERE ref=?').get(id).data).name,'A');
 }finally{await t.close();}
});
test('incomplete cancellation stops requesting after five attempts and remains visible as FAILED',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token;
  const push=orders=>t.call('POST','/api/talabat/push',{headers:{'x-talabat-token':token},body:{orders}});
  await push([{id:'12345678',status:'CANCELLED',store:'مدينتي',placedAt:new Date(t.clock.now).toISOString()}]);
  for(let i=0;i<5;i++){t.advance(61000);await push([]);}
  assert.deepEqual((await push([])).body.want,[]);
  assert.equal((await admin('GET','/api/talabat/day?day=2026-10-22')).body.orders[0].cancellationReadiness,'FAILED');
 }finally{await t.close();}
});
