const test=require('node:test'),assert=require('node:assert/strict');const {start}=require('./helpers.cjs');
test('reviewing a genuinely sent welcome releases only its survey, restores only its verified number, and is idempotent',async()=>{
 const t=await start();try{
 const admin=await t.admin(),token=(await admin('POST','/api/talabat/token')).body.token,H={'x-talabat-token':token};
 await admin('POST','/api/whatsapp',{action:'web',welcomeText:'hello',surveyText:'rating',delay:80});await admin('POST','/api/whatsapp',{action:'enable',on:true});
 const phone='01001234567',id='500123456';
 await t.call('POST','/api/talabat/push',{headers:H,body:{orders:[{id,status:'ACCEPTED',phone,detail:{customer:{phone}}}]}});
 const next=()=>t.call('POST','/api/whatsapp/next',{headers:H,body:{protocol:2}});
 const j=(await next()).body.message;
 await t.call('POST','/api/whatsapp/result',{headers:H,body:{...j,ok:false,error:'delivery_unconfirmed'}});
 t.app.db.raw.prepare('UPDATE wa_messages SET phone=NULL WHERE id=?').run(j.id);
 const action={action:'confirm_sent',id:j.id,kind:'welcome'};
 assert.equal((await t.call('POST','/api/whatsapp',{body:action})).status,401);
 const state=(await admin('GET','/api/whatsapp')).body;assert.equal(state.errors[0].canConfirm,true);assert.equal(state.errors[0].id,j.id);
 const r=await admin('POST','/api/whatsapp',action);assert.equal(r.status,200);assert.equal(r.body.surveyAvailable,true);
 assert.equal((await admin('POST','/api/whatsapp',action)).body.duplicate,true);
 t.advance(41000);assert.equal((await next()).body.message,null,'survey waits for its due time; welcome is never reissued');
 t.advance(81*60000);const survey=(await next()).body.message;assert.equal(survey.kind,'survey');assert.equal(survey.phone,'201001234567');
 assert.equal((await t.call('POST','/api/whatsapp/result',{headers:H,body:{...survey,ok:true}})).status,200);
 assert.equal(t.app.db.raw.prepare('SELECT phone FROM wa_messages WHERE id=?').get(j.id).phone,null);
 assert.equal((await admin('POST','/api/whatsapp',action)).status,404,'old welcome review cannot modify the newer survey claim');
 }finally{await t.close();}
});
