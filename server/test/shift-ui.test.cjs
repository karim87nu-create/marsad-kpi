const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {JSDOM}=require('jsdom');const {start}=require('./helpers.cjs');
test('one monitoring-gap group; ending a stale shift from admin removes that employee from it',async()=>{
 const t=await start({at:Date.now()});let dom;try{const admin=await t.admin(),e1=await t.employee(admin,{name:'First',code:'A',pin:'1234'}),e2=await t.employee(admin,{name:'Second',code:'B',pin:'5678'});
 const s1=await t.session('1234');await t.event(s1.token,'heartbeat',{state:'ready'});await t.tick(s1.token,60000,'ready');
 const s2=await t.session('5678','102');await t.event(s2.token,'heartbeat',{state:'ready',extension:'102'});t.advance(240000);
 t.app.db.raw.prepare("UPDATE employee_sessions SET revoked_at=?,revoke_reason='expired_or_disconnected' WHERE employee_id=?").run(t.clock.now,e2.id);
 const root=path.join(__dirname,'../../sites/public/admin');dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/admin/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 // Node fetch does not accept jsdom's AbortSignal; the real browser does.
 w.MARSAD_API=t.base;w.fetch=(u,o)=>fetch(u,{...o,signal:undefined});w.sessionStorage.setItem('marsadAdminToken',await t.login());w.prompt=()=> 'Shift finished';w.alert=x=>{throw Error(x)};w.crypto.randomUUID=()=>crypto.randomUUID();
 for(const f of ['charts.js','xlsx.js','orders.js','site.js','app.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
 const until=async f=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not finish: '+w.document.getElementById('error').textContent+' sync='+w.document.getElementById('sync').textContent+' staff='+w.document.getElementById('staffNow').textContent)};
 const gaps=()=>[...w.document.querySelectorAll('#staffNow h3')].filter(x=>x.textContent.startsWith('انقطاع رصد'));
 await until(()=>gaps().length===1);assert.match(gaps()[0].textContent,/2/);assert.equal(w.document.querySelectorAll('#staffNow .tile').length,2);
 w.document.querySelector('[data-view="shifts"]').click();await until(()=>[...w.document.querySelectorAll('#shiftTable tr')].some(r=>r.textContent.includes('First')&&r.querySelector('button')));
 const row=[...w.document.querySelectorAll('#shiftTable tbody tr')].find(r=>r.textContent.includes('First'));[...row.querySelectorAll('button')].find(b=>b.textContent==='الشيفت خلص').click();
 await until(()=>t.app.db.raw.prepare('SELECT revoked_at FROM employee_sessions WHERE employee_id=?').get(e1.id).revoked_at!=null);
 await until(()=>w.document.getElementById('shiftTable').textContent.includes('الشيفت خلص فعلًا'));
 w.document.querySelector('[data-view="now"]').click();await until(()=>w.document.getElementById('staffNow').textContent.includes('خلص الشيفت'));
 assert.equal(gaps().length,1);assert.match(gaps()[0].textContent,/1/);assert.equal(w.document.querySelectorAll('#staffNow .tile').length,1);
 }finally{await new Promise(r=>setTimeout(r,150));dom?.window.close();await t.close();}
});
