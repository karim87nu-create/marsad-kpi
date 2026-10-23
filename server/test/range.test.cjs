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
test('period ratios use all source calls rather than daily percentage averages',async()=>{
 const {setup}=await import('../src/range.js');const {toRecord,mapHeader}=await import('../src/arabicss.js');
 const header=['Queue','Agent','Call Date','Start Time','End Time','Duration','Wait Time','Caller ID','Status','Trunk'],map=mapHeader(header);
 const days=['2026-10-20','2026-10-21'];let app={now:()=>Date.now(),fail:(status,message)=>{throw Error(message)}};
 const data=days.map((date,i)=>{const records=Array.from({length:i?3:1},(_,idx)=>toRecord(['2001','SIP/101',date,'10:00:00','10:02:00','00:02:00',i?'00:00:30':'00:00:04','0111','Success','T'],map,date,idx));return {date,raw:{records},employees:[],sessions:[],states:[],calls:[],slots:[],window:{start:date+'T06:00:00Z',end:date+'T23:59:59Z',operatingEnd:date+'T23:00:00Z'},history:{report:{importedAt:date+'T12:00:00Z',verifiedTotal:true,missingCalendarDates:[]},queues:[],missed:[],unattributed:[],attribution:{}}}});
 app.day=async date=>data.find(d=>d.date===date);setup(app);const r=await app.range(...days);
 assert.equal(r.history.report.calls,4);assert.equal(r.history.report.sla,25);assert.equal(r.history.report.asa,23.5);
});
