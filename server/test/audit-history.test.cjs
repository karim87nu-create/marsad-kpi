const test=require('node:test'),assert=require('node:assert/strict');const {start}=require('./helpers.cjs');
test('history report and calls commit atomically, previous report survives an injected call insert failure',async()=>{
 const t=await start();try{
  const admin=await t.admin(),token=(await admin('POST','/api/history',{action:'token'})).body.token;
  const header=['Queue','Agent','Call Date','Start Time','End Time','Duration','Wait Time','Caller ID','Status','Trunk'];
  const row=['2001','SIP/101','2026-10-22','12:00:00','12:01:00','00:01:00','00:00:01','01000000001','Success','T'];
  const push=rows=>t.call('POST','/api/history',{headers:{'x-history-token':token},body:{reportDate:'2026-10-22',expectedCount:rows.length,rows:[header,...rows]}});
  assert.equal((await push([row])).status,200);
  t.app.db.raw.exec("CREATE TRIGGER fail_history BEFORE INSERT ON history_calls BEGIN SELECT RAISE(ABORT,'injected'); END");
  assert.equal((await push([row,row])).status,500);
  assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM history_reports').get().n,1);
  assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM history_calls').get().n,1);
 }finally{await t.close();}
});
