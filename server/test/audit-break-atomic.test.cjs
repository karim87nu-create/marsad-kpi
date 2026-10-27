const test=require('node:test'),assert=require('node:assert/strict');const {start}=require('./helpers.cjs');
test('failed break event insertion does not consume its permission',async()=>{
 const t=await start();try{const admin=await t.admin();await t.employee(admin);const s=await t.session();await t.event(s.token,'heartbeat',{state:'ready'});
 const p=(await t.device(s.token,'POST','/api/break-requests',{action:'regular_start'})).body.permissionId;
 t.app.db.raw.exec("CREATE TRIGGER fail_break BEFORE INSERT ON events WHEN NEW.event_type='break_start' BEGIN SELECT RAISE(ABORT,'injected'); END");
 assert.equal((await t.event(s.token,'break_start',{permissionId:p,state:'break'})).status,500);
 assert.equal(t.app.db.raw.prepare('SELECT used_at FROM break_permissions WHERE id=?').get(p).used_at,null);
 }finally{await t.close();}
});
