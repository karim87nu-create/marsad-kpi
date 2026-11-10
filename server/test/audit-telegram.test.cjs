const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');const {start}=require('./helpers.cjs');
test('Telegram does not resend after provider accepted a message but disconnected before its response',async()=>{
 let disconnect=false,sends=0;const fake=http.createServer((req,res)=>{req.resume();req.on('end',()=>{const method=req.url.split('/').pop();if(method==='sendMessage'){sends++;if(disconnect){req.socket.destroy();return;}}res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:method==='getMe'?{username:'test'}:{message_id:sends||1}}));});});
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));const t=await start({config:{telegramApi:'http://127.0.0.1:'+fake.address().port}});
 try{const admin=await t.admin();await admin('POST','/api/telegram',{action:'token',token:'123456:'+'a'.repeat(35)});await admin('POST','/api/telegram',{action:'chat',chatId:'-100123',title:'test'});disconnect=true;sends=0;
 t.app.db.raw.prepare("INSERT INTO telegram_log(key,kind,text,created_at) VALUES('test-lost','source','synthetic',?)").run(t.clock.now);
 await t.app.telegramTick();await t.app.telegramTick();assert.equal(sends,1);
 assert.equal(t.app.db.raw.prepare("SELECT error FROM telegram_log WHERE key='test-lost'").get().error,'delivery_unconfirmed');
 }finally{await t.close();await new Promise(r=>fake.close(r));}
});
test('a reply still goes when its parent was sent but Telegram\'s answer to it was lost (Karim 10-11: «✅ اتضرب» never sent)',async()=>{
 let disconnect=false,sends=0;const bodies=[];const fake=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{const method=req.url.split('/').pop();if(method==='sendMessage'){sends++;bodies.push(JSON.parse(b||'{}'));if(disconnect){req.socket.destroy();return;}}res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:method==='getMe'?{username:'test'}:{message_id:sends||1}}));});});
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));const t=await start({config:{telegramApi:'http://127.0.0.1:'+fake.address().port}});
 try{const admin=await t.admin();await admin('POST','/api/telegram',{action:'token',token:'123456:'+'a'.repeat(35)});await admin('POST','/api/telegram',{action:'chat',chatId:'-100123',title:'test'});
 disconnect=true;sends=0;bodies.length=0;
 t.app.db.raw.prepare("INSERT INTO telegram_log(key,kind,text,created_at) VALUES('p1','source','parent',?)").run(t.clock.now);
 await t.app.telegramTick();assert.equal(sends,1);
 disconnect=false;t.app.db.raw.prepare("INSERT INTO telegram_log(key,kind,text,created_at,reply_to) VALUES('resolved:p1','source:resolved','reply',?,'p1')").run(t.clock.now);
 t.advance(20000);await t.app.telegramTick();
 assert.equal(sends,2,'the reply is sent');assert.equal(bodies[1].reply_parameters,undefined,'on its own: no message to answer');
 }finally{await t.close();await new Promise(r=>fake.close(r));}
});
