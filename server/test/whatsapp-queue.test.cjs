const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('./helpers.cjs');
test('blocked first five WhatsApp jobs do not starve sixteen later orders or new arrivals',async()=>{
 const t=await start();try{
 const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token,H={'x-talabat-token':token};
 await admin('POST','/api/whatsapp',{action:'web',welcomeText:'hello {code}',surveyText:'rating',delay:80});
 await admin('POST','/api/whatsapp',{action:'enable',on:true});
 const push=async i=>{const phone='0100123'+String(4000+i);return t.call('POST','/api/talabat/push',{headers:H,body:{orders:[{id:String(50000000+i),status:'ACCEPTED',phone,detail:{customer:{phone}}}]}});};
 const next=()=>t.call('POST','/api/whatsapp/next',{headers:H,body:{protocol:2}});
 const settle=(j,ok)=>t.call('POST','/api/whatsapp/result',{headers:H,body:{...j,ok}});
 for(let i=0;i<21;i++)assert.equal((await push(i)).status,200);
 for(let i=0;i<5;i++){const j=(await next()).body.message;assert.ok(j);await settle(j,false);t.advance(181000);}
 assert.equal((await admin('GET','/api/whatsapp')).body.today.ready,16);
 const sent=new Set();for(let i=0;i<16;i++){
 const j=(await next()).body.message;assert.ok(j,'later order '+i+' is reachable');assert.ok(!sent.has(j.id));sent.add(j.id);
 assert.equal((await next()).body.message,null,'gap keeps sending serial');
 assert.equal((await settle(j,true)).status,200);t.advance(41000);
 }
 assert.equal((await next()).body.message,null,'surveys still wait for their due time');
 await push(21);const j=(await next()).body.message;assert.ok(j,'new arrivals continue after backlog');await settle(j,true);
 const db=t.app.db.raw;assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_claims WHERE state='unknown'").get().n,5);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM wa_messages WHERE welcome_at IS NOT NULL').get().n,17);
 }finally{await t.close();}
});
