'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {start}=require('./helpers.cjs');
test('gap: one outage, one recovery, no repeats from moving timestamps or old queued duplicates',async()=>{
 const sent=[],fake=http.createServer((req,res)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{const m=req.url.split('/').pop(),b=JSON.parse(s||'{}');if(m==='sendMessage')sent.push(b);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:m==='getMe'?{username:'bot'}:{message_id:sent.length}}));});});
 await new Promise(r=>fake.listen(0,r));const t=await start({config:{telegramApi:'http://127.0.0.1:'+fake.address().port}});
 try{
 const admin=await t.admin(),e=await t.employee(admin);
 await admin('POST','/api/telegram',{action:'token',token:'123456:'+'a'.repeat(35)});
 await admin('POST','/api/telegram',{action:'chat',chatId:'-100',title:'Calls'});
 await admin('POST','/api/telegram',{action:'settings',enabled:true,rules:{gap:true}});
 sent.length=0;const p={employeeId:e.id,name:'Ahmed',extension:'4346',state:'unknown',since:new Date(t.clock.now-14400000).toISOString(),lastEvidence:new Date(t.clock.now-14400000).toISOString()};t.app.live=async()=>[p];
 await t.app.telegramTick();assert.equal(sent.length,1);
 for(let i=0;i<10;i++){t.advance(15000);p.since=new Date(t.clock.now-14400000).toISOString();await t.app.telegramTick();}assert.equal(sent.length,1);
 for(let i=0;i<3;i++)await t.app.db.prepare('INSERT INTO telegram_log (key,kind,employee_id,text,created_at,sent_at,message_id) VALUES (?,?,?,?,?,?,?)').run('gap:'+e.id+':'+new Date(t.clock.now-10000000-i*1000).toISOString(),'gap',e.id,'old duplicate',t.clock.now,i===0?t.clock.now:null,i===0?999:null);
 await t.app.telegramTick();assert.equal(sent.length,1);
 p.state='ready';await t.app.telegramTick();assert.equal(sent.length,1,'stale ready is not recovery');
 t.advance(1000);p.lastEvidence=p.since=new Date(t.clock.now).toISOString();await t.app.telegramTick();assert.equal(sent.length,2);assert.match(sent[1].text,/رجع الرصد/);assert.equal(sent[1].reply_parameters.message_id,1);
 await t.app.telegramTick();assert.equal(sent.length,2);
 t.advance(200000);p.state='unknown';await t.app.telegramTick();assert.equal(sent.length,3,'new outage after recovery');
 }finally{await t.close();fake.close();}
});
