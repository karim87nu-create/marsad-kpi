const test=require('node:test'),assert=require('node:assert/strict');const {branchMessage}=require('../src/branch-message.js');
test('branch messages omit entry staff/time, retaining order number, elapsed wait, delivery and cancellation times',()=>{
 const original='الفرع: مدينتي\nرقم الأوردر: 843\nاتضرب الساعة 13:22، وبقاله 42 دقيقة\nاللي ضرب الأوردر: Test Employee\nرقمه على Apex: 777، ضربه Test Employee الساعة 13:22\nخرج الساعة 14:10\nاتلغى الساعة 14:12\nالسبب: العميل طلب الإلغاء';
 const out=branchMessage(original);assert.doesNotMatch(out,/Test Employee|13:22|اللي ضرب|ضربه/);assert.match(out,/843/);assert.match(out,/777/);assert.match(out,/42 دقيقة/);assert.match(out,/14:10/);assert.match(out,/14:12/);
 assert.equal(branchMessage('رقمه على Apex: 777 الساعة 13:22'),'رقمه على Apex: 777');
});

test('actual Telegram delivery sanitizes only branch destination, including queued messages from older monitors',async()=>{
 const http=require('node:http'),{start}=require('./helpers.cjs'),sent=[];
 const fake=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{const method=req.url.split('/').pop(),b=JSON.parse(body||'{}');if(method==='sendMessage')sent.push(b);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:method==='getMe'?{username:'test'}:{message_id:sent.length||1}}));});});
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));const t=await start({config:{telegramApi:'http://127.0.0.1:'+fake.address().port}});
 try{const admin=await t.admin();await admin('POST','/api/telegram',{action:'token',token:'123456:'+'a'.repeat(35)});await admin('POST','/api/telegram',{action:'chat',chatId:'-100',title:'Calls'});await admin('POST','/api/telegram',{action:'chat',chatId:'-300',title:'مدينتي',target:'branch',branch:'مدينتي'});
 const text='رقم الأوردر: 843\nاتضرب الساعة 13:22، وبقاله 42 دقيقة\nاللي ضرب الأوردر: Test Employee';
 t.app.db.raw.prepare("INSERT INTO telegram_log(key,kind,text,created_at,target,branch) VALUES('branch-old','ordersLate',?,?,'branches','مدينتي')").run(text,t.clock.now);
 t.app.db.raw.prepare("INSERT INTO telegram_log(key,kind,text,created_at) VALUES('calls-control','source',?,?)").run(text,t.clock.now);
 sent.length=0;await t.app.telegramTick();await t.app.telegramTick();
 const branch=sent.find(x=>String(x.chat_id)==='-300'),calls=sent.find(x=>String(x.chat_id)==='-100');assert.ok(branch);assert.doesNotMatch(branch.text,/13:22|Test Employee/);assert.equal(calls.text,text);
 }finally{await t.close();await new Promise(r=>fake.close(r));}
});
