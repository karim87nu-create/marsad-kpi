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
