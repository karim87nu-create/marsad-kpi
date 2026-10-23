#!/usr/bin/env node
// Parity check for "who was available" on every missed call: old logic on the old SQLite vs this server.
// Usage: node scripts/compare-old-missed.js <old.sqlite> <new.db>
const D=require('better-sqlite3');const [oldP,newP]=process.argv.slice(2);const o=new D(oldP,{readonly:true});
const {prepareMissedContext}=require('../src/legacy-logic/missed-context');const {loadShiftData}=require('../src/legacy-logic/shift-responsibility');
const {open}=require('../src/db');const {createApp}=require('../src/app');const {dayWindow}=require('../src/time');
const app=createApp({db:open(newP),config:{secret:'x',deviceTokens:[],allowedOrigins:[]}});for(const m of require('../src/index').MODULES.map(x=>x.slice(2)))require('../src/'+m).setup(app);
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const {businessTime}=(()=>{ // old historyBusinessTime via old cairoClockWindow
  const {cairoClockWindow}=require('../src/legacy-logic/missed-context');
  const parts=ms=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,+p.value]));
  const bd=ms=>{const p=parts(ms),d=p.year+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0');return p.hour<9?shift(d,-1):d};
  return {businessTime:c=>{const k=cairoClockWindow(c.date,c.start)||cairoClockWindow(c.date,c.end);return k?bd(k.start):c.date}}})();
const keys=['state','queueEntryState','becameReadyDuringWait','readyDuringWaitAt','ringResult','extension','elapsedSeconds','elapsedMaxSeconds','durationBasis','reason','stateStartedAt','evidenceAt','eligibleAtQueueEntry'];
let calls=0,rows=0,bad=0;const diffs={};
(async()=>{
for(const date of o.prepare('select distinct report_date d from history_reports order by 1').all().map(r=>r.d)){
 const w=dayWindow(date);
 const src=[date,shift(date,1)].map(d=>o.prepare('SELECT records FROM history_reports WHERE report_date=? ORDER BY imported_at DESC,id DESC LIMIT 1').get(d));
 const oc=src.flatMap(s=>s?JSON.parse(s.records):[]).filter(c=>businessTime(c)===date);
 const staff=o.prepare('SELECT id,name,employee_code AS employeeCode,created_at AS createdAt FROM employees').all();
 const from=new Date(w.start-12*3600000).toISOString(),to=new Date(w.end).toISOString();
 const events=o.prepare('SELECT id,event_type AS eventType,extension,occurred_at AS occurredAt,payload FROM call_events WHERE occurred_at>=? AND occurred_at<=? ORDER BY occurred_at ASC,id ASC').all(from,to);
 const shifts=await loadShiftData({prepare:s=>({bind:(...a)=>({all:async()=>({results:o.prepare(s).all(...a)})})})},w.start-12*3600000,w.end);
 const oldResolve=prepareMissedContext(staff,events,shifts,oc);
 const h=app.dayHistory(date,Date.now());const resolveNew=app.missedResolver(date,h.records);
 const oldMissed=oc.map((c,i)=>({c,i})).filter(x=>x.c.status.toLowerCase()==='abandoned');
 const newMissed=h.records.filter(r=>r.status.toLowerCase()==='abandoned');
 if(oldMissed.length!==newMissed.length){console.log(date,'missed count',oldMissed.length,newMissed.length);bad++;continue}
 for(let k=0;k<oldMissed.length;k++){calls++;
  const a=oldResolve(oldMissed[k].c),b=resolveNew(newMissed[k]).context;
  for(const ea of a.employees){rows++;const eb=b.employees.find(x=>x.employeeId===ea.employeeId);
   for(const key of keys){const x=JSON.stringify(ea[key]),y=JSON.stringify(eb&&eb[key]);if(x!==y){bad++;const kk=key+': '+x+' → '+y;diffs[key]=(diffs[key]||0)+1;if(diffs[key]<=3)console.log(date,oldMissed[k].c.start,'emp',ea.employeeId,kk)}}}
  if(JSON.stringify(a.timeWindow)!==JSON.stringify(b.timeWindow)){bad++;diffs.timeWindow=(diffs.timeWindow||0)+1}
 }
}
console.log('missed calls',calls,'employee rows',rows,'differences',bad,diffs);})();
