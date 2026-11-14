import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../lib/marsad/transfer.js',import.meta.url),'utf8');
const query=source.match(/const queued = await db\.prepare\(`([\s\S]*?)`\)/)[1];
function queue(state,owner,at,actor=7){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE transfer_jobs(source TEXT,ref TEXT,day TEXT,state TEXT,employee_id INTEGER,employee_name TEXT,payment TEXT,note TEXT,at INTEGER,payload TEXT,result TEXT,PRIMARY KEY(source,ref))');
  if(state)db.prepare('INSERT INTO transfer_jobs(source,ref,state,employee_id,at) VALUES(?,?,?,?,?)').run('site','123',state,owner,at);
  const r=db.prepare(query).run('site','123','2026-11-13',actor,'staff','cash',null,1000000,'{}',400000);
  const row=db.prepare('SELECT state,employee_id FROM transfer_jobs').get();
  db.close();return {changes:r.changes,row};
}
test('employee can transfer their own active claim',()=>assert.equal(queue('claimed',7,900000).changes,1));
test('another employee cannot take an active claim',()=>assert.equal(queue('claimed',8,900000).changes,0));
test('expired claims may be transferred',()=>assert.equal(queue('claimed',8,300000).changes,1));
for(const state of ['auto_pending','auto_sending','auto_retry_pending','auto_done','entered']){
 test('queue preserves protected state '+state,()=>assert.equal(queue(state,7,300000).changes,0));
}
for(const state of [null,'released','auto_failed']){
 test('new or retryable order queues '+state,()=>assert.equal(queue(state,8,900000).changes,1));
}
