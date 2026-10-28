const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('./helpers.cjs');

test('a full 400-order push persists every row with grouped reads and writes; D1 alerts do not delay the acknowledgement',{timeout:10000},async()=>{
 const t=await start();let release;const gate=new Promise(r=>release=r),background=[];
 try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token;
  const prepare=t.app.db.prepare,batch=t.app.db.batch;let prefetch=0,individualReads=0,ingestBatches=0;
  t.app.db.prepare=sql=>{if(sql.includes('p.data AS profile'))prefetch++;if(sql==='SELECT status FROM talabat_orders WHERE id = ?')individualReads++;return prepare(sql);};
  t.app.db.batch=async list=>{if(list.some(x=>x.sql.includes('INSERT INTO talabat_orders')))ingestBatches++;return batch(list);};
  t.app.db.kind='d1';const pairs=t.app.learn.pairs;
  t.app.learn.pairs=async(...args)=>{await gate;return pairs(...args);};
  const orders=Array.from({length:400},(_,i)=>({id:String(4677000000+i),store:'التجمع',status:'ACCEPTED',placedAt:new Date(t.clock.now-i*1000).toISOString(),observedAt:new Date(t.clock.now).toISOString()}));
  const response=await t.app.fetch(new Request('https://local/api/talabat/push',{method:'POST',headers:{'content-type':'application/json','x-talabat-token':token},body:JSON.stringify({orders})}),{waitUntil:p=>background.push(p)});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.ok,true);assert.equal(result.want.length,4);
  assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM talabat_orders').get().n,400);
  assert.equal(prefetch,8);assert.equal(individualReads,0);assert.equal(ingestBatches,16);
  assert.ok(background.length>0,'background alert work is registered while response has completed');
 }finally{release();await Promise.allSettled(background);await t.close();}
});

test('duplicate IDs within a push retain newer observation and customer profile ordering',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token;
  const now=t.clock.now,id='4677999999';
  const response=await t.call('POST','/api/talabat/push',{headers:{'x-talabat-token':token},body:{orders:[
   {id,status:'DELIVERED',observedAt:new Date(now).toISOString(),detail:{customer:{name:'current'}}},
   {id,status:'ACCEPTED',observedAt:new Date(now-1000).toISOString(),detail:{customer:{name:'stale'}}}
  ]}});
  assert.equal(response.status,200);
  assert.equal(t.app.db.raw.prepare('SELECT status FROM talabat_orders WHERE id=?').get(id).status,'DELIVERED');
  assert.equal(JSON.parse(t.app.db.raw.prepare("SELECT data FROM match_profiles WHERE source='talabat' AND ref=?").get(id).data).name,'current');
 }finally{await t.close();}
});
