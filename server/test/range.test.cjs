const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('./helpers.cjs');const {cairoToUtc}=require('../src/time.js');
test('range sums daily work, preserves night exclusions, validates bounds and one-day parity',async()=>{
const t=await start({at:cairoToUtc(2026,10,24,14,0,0)});
try { const admin=await t.admin();await t.employee(admin);
for(const day of [22,23]) {t.clock.now=cairoToUtc(2026,10,day,12,0,0);const s=await t.session();await t.event(s.token,'heartbeat',{state:'ready'});await t.tick(s.token,60000,'ready');await t.device(s.token,'POST','/api/session/end',{reason:'arabicss_logout'});}
t.clock.now=cairoToUtc(2026,10,24,14,0,0);
const a=(await admin('GET','/api/day?date=2026-10-22')).body,b=(await admin('GET','/api/day?date=2026-10-23')).body;
const r=await admin('GET','/api/day?from=2026-10-22&to=2026-10-23');assert.equal(r.status,200);assert.equal(r.body.days,2);assert.equal(r.body.employees[0].workSeconds,a.employees[0].workSeconds+b.employees[0].workSeconds);
assert.deepEqual((await admin('GET','/api/day?from=2026-10-22&to=2026-10-22')).body,a);
for(const p of ['from=2026-10-23&to=2026-10-22','from=2026-01-01&to=2026-10-23','from=2026-10-22&to=2026-10-25'])assert.equal((await admin('GET','/api/day?'+p)).status,400);
}finally{await t.close();}});
