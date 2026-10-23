const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const {start}=require('./helpers.cjs');
test('admin from/to selection loads the selected period in summary and followup',async()=>{
 const t=await start({at:Date.now()}),requests=[];let dom;
 try {
  const token=await t.login();const root=path.join(__dirname,'../../sites/public/admin');
  dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/admin/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.sessionStorage.setItem('marsadAdminToken',token);w.MARSAD_API=t.base;w.fetch=(url,opts)=>{requests.push(String(url));return fetch(url,opts)};
  w.confirm=()=>false;w.alert=x=>{throw Error(x)};
  for(const f of ['charts.js','xlsx.js','app.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
  const until=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not finish: '+w.document.getElementById('error').textContent)};
  await until(()=>!w.document.getElementById('app').hidden && requests.some(x=>x.endsWith('/api/live'))); await new Promise(r=>setTimeout(r,150));
  w.document.querySelector('[data-view="day"]').click();
  w.document.getElementById('day').value='2026-10-20';w.document.getElementById('dayTo').value='2026-10-21';w.document.getElementById('applyRange').click();
  await until(()=>requests.some(x=>x.endsWith('/api/day?from=2026-10-20&to=2026-10-21')));
  await until(()=>w.document.getElementById('sync').textContent.includes('آخر تحديث'));
  assert.equal(w.document.getElementById('error').hidden,true,w.document.getElementById('error').textContent);
  w.document.querySelector('[data-view="followup"]').click();
  await until(()=>requests.some(x=>x.endsWith('/api/reviews?from=2026-10-20&to=2026-10-21')));
  w.document.getElementById('dayTo').value='2026-10-19';w.document.getElementById('applyRange').click();assert.equal(w.document.getElementById('error').hidden,false);
 }finally{await new Promise(r=>setTimeout(r,150));dom?.window.close();await t.close();}
});
