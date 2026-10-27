const test=require('node:test'),assert=require('node:assert/strict');const {start}=require('./helpers.cjs');
test('WhatsApp phone-only input is held; two requests get one claim; wrong claim and wrong kind cannot settle; timed-out delivery is not resent',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token,H={'x-talabat-token':token};
  await admin('POST','/api/whatsapp',{action:'web',welcomeText:'hello {code}',surveyText:'rating',delay:75});await admin('POST','/api/whatsapp',{action:'enable',on:true});
  const push=orders=>t.call('POST','/api/talabat/push',{headers:H,body:{orders}});
  const next=()=>t.call('POST','/api/whatsapp/next',{headers:H,body:{protocol:2}});
  const id='12345678',phone='01001234567';
  await push([{id,status:'ACCEPTED',phone}]);assert.equal((await next()).body.message,null);
  await push([{id,status:'ACCEPTED',phone,detail:{customer:{phone}}}]);
  const replies=await Promise.all([next(),next()]),jobs=replies.map(r=>r.body.message).filter(Boolean);assert.equal(jobs.length,1);
  const j=jobs[0];assert.ok(j.claimToken);
  assert.equal((await t.call('POST','/api/whatsapp/result',{headers:H,body:{id:j.id,kind:j.kind,claimToken:'wrong',ok:true}})).status,409);
  assert.equal((await t.call('POST','/api/whatsapp/result',{headers:H,body:{id:j.id,kind:'survey',claimToken:j.claimToken,ok:true}})).status,409);
  t.advance(181000);assert.equal((await next()).body.message,null,'unknown delivery stays held after lease expires');
  assert.equal((await admin('GET','/api/whatsapp')).body.unconfirmed,1);
  const result={id:j.id,kind:j.kind,claimToken:j.claimToken,ok:true};
  assert.equal((await t.call('POST','/api/whatsapp/result',{headers:H,body:result})).status,200);
  assert.equal((await t.call('POST','/api/whatsapp/result',{headers:H,body:result})).body.duplicate,true);
 }finally{await t.close();}
});
test('a changed customer phone after welcome cannot receive that orders survey',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token,H={'x-talabat-token':token};
  await admin('POST','/api/whatsapp',{action:'web',welcomeText:'hello',surveyText:'rating',delay:75});await admin('POST','/api/whatsapp',{action:'enable',on:true});
  const push=phone=>t.call('POST','/api/talabat/push',{headers:H,body:{orders:[{id:'12345678',status:'ACCEPTED',phone,detail:{customer:{phone}}}]}});
  await push('01001234567');
  const j=(await t.call('POST','/api/whatsapp/next',{headers:H,body:{protocol:2}})).body.message;
  await t.call('POST','/api/whatsapp/result',{headers:H,body:{...j,ok:true}});
  await push('01101234567');t.advance(76*60000);
  assert.equal((await t.call('POST','/api/whatsapp/next',{headers:H,body:{protocol:2}})).body.message,null);
 }finally{await t.close();}
});
