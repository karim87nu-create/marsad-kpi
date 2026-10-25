const test=require('node:test'),assert=require('node:assert/strict');const {start}=require('./helpers.cjs');const {businessDay}=require('../src/time.js');
test('stale unclosed shift can be reviewed and ended without inventing time; a fresh shift stays protected',async()=>{
const t=await start();try{const admin=await t.admin(),e=await t.employee(admin),s=await t.session();await t.event(s.token,'heartbeat',{state:'ready'});await t.tick(s.token,60000,'ready');
const session=t.app.db.raw.prepare('SELECT * FROM employee_sessions WHERE employee_id=?').get(e.id);const action=(kind,requestId=crypto.randomUUID())=>admin('POST','/api/shifts',{employeeId:e.id,sessionId:session.id,action:kind,note:'Reviewed',requestId});
assert.equal((await action('exclude')).status,409);t.advance(240000);const date=businessDay(t.clock.now),before=(await admin('GET','/api/day?date='+date)).body;assert.equal(before.sessions[0].running,false);
assert.equal((await action('include')).status,200);assert.equal(t.app.db.raw.prepare('SELECT revoked_at FROM employee_sessions WHERE id=?').get(session.id).revoked_at,null);
const requestId=crypto.randomUUID();assert.equal((await action('exclude',requestId)).status,200);assert.equal((await action('exclude',requestId)).body.duplicate,true);
const closed=t.app.db.raw.prepare('SELECT * FROM employee_sessions WHERE id=?').get(session.id);assert.equal(closed.revoked_at,session.last_seen+90000);assert.equal(closed.revoke_reason,'manual');
assert.equal((await admin('GET','/api/live')).body.employees.find(x=>x.employeeId===e.id).state,'shift_ended');const after=(await admin('GET','/api/day?date='+date)).body;assert.equal(after.employees[0].workSeconds,before.employees[0].workSeconds);assert.equal(after.sessions[0].decision.action,'exclude');
const next=await t.session();await t.event(next.token,'heartbeat',{state:'ready'});assert.equal((await admin('GET','/api/live')).body.employees.find(x=>x.employeeId===e.id).state,'ready');
}finally{await t.close();}});
test('heartbeat racing with review wins and prevents closure',async()=>{
const t=await start();try{const admin=await t.admin(),e=await t.employee(admin),s=await t.session();await t.event(s.token,'heartbeat',{state:'ready'});await t.tick(s.token,60000,'ready');t.advance(240000);const session=t.app.db.raw.prepare('SELECT * FROM employee_sessions WHERE employee_id=?').get(e.id),batch=t.app.db.batch;let once=true;
t.app.db.batch=async writes=>{if(once&&writes.some(x=>x.sql.includes('INSERT OR IGNORE INTO shift_decisions'))){once=false;t.app.db.raw.prepare('UPDATE employee_sessions SET last_seen=? WHERE id=?').run(t.clock.now,session.id);}return batch(writes);};
const r=await admin('POST','/api/shifts',{employeeId:e.id,sessionId:session.id,action:'exclude',note:'Review',requestId:crypto.randomUUID()});assert.equal(r.status,409);assert.equal(t.app.db.raw.prepare('SELECT revoked_at FROM employee_sessions WHERE id=?').get(session.id).revoked_at,null);assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM shift_decisions').get().n,0);
}finally{await t.close();}});
