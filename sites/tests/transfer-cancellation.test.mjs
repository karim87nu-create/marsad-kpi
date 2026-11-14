import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_STATEMENTS } from '../lib/marsad/db.js';
import { setup } from '../lib/marsad/transfer.js';
import { sourceCanTransfer,handoffPending,isCancelled } from '../lib/marsad/transfer-cancellation.js';
import { sha256 } from '../lib/marsad/security.js';
function fixture(source='site',state='auto_pending') {
 const sql=new DatabaseSync(':memory:');for(const q of SCHEMA_STATEMENTS)sql.exec(q);
 sql.exec('ALTER TABLE transfer_jobs ADD COLUMN payload TEXT; ALTER TABLE transfer_jobs ADD COLUMN result TEXT');
 const now=Date.parse('2026-11-13T12:00:00Z'),day='2026-11-13',ref='30921';
 if(source==='site')sql.prepare('INSERT INTO site_orders(id,day,status,created_at,scheduled,scheduled_at) VALUES(?,?,?,?,1,?)').run(ref,'2026-11-12','processing',now-86400000,now);
 else sql.prepare('INSERT INTO talabat_orders(id,day,status,placed_at,first_seen,updated_at) VALUES(?,?,?,?,?,?)').run(ref,day,'ACCEPTED',now,now,now);
 sql.prepare('INSERT INTO transfer_jobs(source,ref,day,state,at,payload) VALUES(?,?,?,?,?,?)').run(source,ref,day,state,now-1000,JSON.stringify({source,ref,db:'live'}));
 sql.prepare('INSERT INTO settings VALUES(?,?)').run('apex_bridge_mode','live');
 sql.prepare('INSERT INTO settings VALUES(?,?)').run('apex_writer_token_hash',sha256('test-key'));
 const db={kind:'d1',prepare:q=>({get:async(...p)=>sql.prepare(q).get(...p),all:async(...p)=>sql.prepare(q).all(...p),run:async(...p)=>sql.prepare(q).run(...p)})};
 const routes=new Map(),app={db,now:()=>now,route:(m,p,h)=>routes.set(m+' '+p,h),afterRequest(){},fail:(status,m)=>{throw Object.assign(Error(m),{status})}};
 setup(app);
 return {sql,db,app,routes,now,day,ref,table:source==='site'?'site_orders':'talabat_orders'};
}
for(const source of ['site','talabat'])for(const state of ['auto_pending','auto_retry_pending']) {
 test(`${source} ${state}: cancellation blocks the real writer route`,async()=>{
  const f=fixture(source,state);f.sql.prepare(`UPDATE ${f.table} SET status=? WHERE id=?`).run('cancelled',f.ref);
  const out=await f.routes.get('POST /api/apex-writer/next')({now:f.now,header:()=> 'test-key'});
  assert.equal(out.job,null);assert.equal(f.sql.prepare('SELECT state FROM transfer_jobs').get().state,'auto_cancelled');f.sql.close();
 });
 test(`${source} ${state}: cancellation between validation and handoff wins atomically`,async()=>{
  const f=fixture(source,state);assert.equal(await sourceCanTransfer(f.db,source,f.ref),true);
  f.sql.prepare(`UPDATE ${f.table} SET status=? WHERE id=?`).run('CANCELED',f.ref);
  assert.equal((await handoffPending(f.db,source,f.ref,state,f.now)).changes,0);f.sql.close();
 });
}
test('cancelled scheduled order is removed even from a fresh saved queue; active order survives',async()=>{
 const f=fixture();f.sql.prepare('UPDATE site_orders SET status=? WHERE id=?').run('cancelled',f.ref);
 const list=[{source:'site',ref:f.ref,items:[]},{source:'site',ref:'30922',items:[]}];
 f.sql.prepare('INSERT INTO transfer_cache(day,at,data) VALUES(?,?,?)').run(f.day,f.now,JSON.stringify({at:f.now,list,locations:[]}));
 const out=await f.app.transferQueue(f.day,{now:f.now});assert.deepEqual(out.orders.map(o=>o.ref),['30922']);f.sql.close();
});
test('stale manual/automatic submission of a cancelled source is rejected before any transfer',async()=>{
 const f=fixture();f.sql.prepare('UPDATE site_orders SET status=? WHERE id=?').run('cancelled',f.ref);
 await assert.rejects(f.app.transferAutoJob({source:'site',ref:f.ref},f.now),e=>e.status===409);
 assert.equal(f.sql.prepare('SELECT state FROM transfer_jobs').get().state,'auto_pending');f.sql.close();
});
test('known cancellation variants normalize; scheduled and pending are not cancellation',()=>{
 for(const s of ['CANCELLED',' canceled ','wc-cancelled','refunded','REJECTED','failed','wallet-failed'])assert.equal(isCancelled(s),true);
 for(const s of ['pending','processing','scheduled','on-hold'])assert.equal(isCancelled(s),false);
});
test('already dispatched work is preserved for reconciliation rather than pretending it never wrote',async()=>{
 const f=fixture('site','auto_sending');f.sql.prepare('UPDATE site_orders SET status=?').run('cancelled');
 const out=await f.routes.get('POST /api/apex-writer/next')({now:f.now,header:()=> 'test-key'});
 assert.equal(out.job.resume,true);assert.equal(f.sql.prepare('SELECT state FROM transfer_jobs').get().state,'auto_sending');f.sql.close();
});
