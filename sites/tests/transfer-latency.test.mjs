import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_STATEMENTS } from '../lib/marsad/db.js';
import { setup } from '../lib/marsad/transfer.js';
import { setup as setupTalabat } from '../lib/marsad/talabat.js';
import { takeTransferBuildLease, waitForTransferBuild } from '../lib/marsad/transfer-build-lease.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const sql = new DatabaseSync(':memory:'); for(const statement of SCHEMA_STATEMENTS) sql.exec(statement);
  const db = {kind:'d1',prepare:q=>({
    get:async(...p)=>sql.prepare(q).get(...p),all:async(...p)=>sql.prepare(q).all(...p),
    run:async(...p)=>sql.prepare(q).run(...p)
  })};
  return {sql,db};
}
test('explicit action waits for completed snapshot with bounded reads and no duplicate build',async()=>{
 const {sql,db}=fixture();let attempts=0;
 const out=await waitForTransferBuild(db,'2026-11-13',100,async()=>{
  if(++attempts===2)sql.prepare('INSERT INTO transfer_cache VALUES(?,?,?)').run('2026-11-13',101,JSON.stringify({at:101,list:[]}));
 });
 assert.equal(out.at,101);assert.equal(attempts,2);
 let waited=0;assert.equal(await waitForTransferBuild(db,'2026-11-13',101,async ms=>{waited+=ms}),null);
 assert.equal(waited,9000);sql.close();
});
test('a transfer rebuild sees Talabat orders written by another isolate despite its old match cache',async()=>{
 const {sql,db}=fixture();const now=Date.parse('2026-11-12T20:00:00Z'),day='2026-11-12';
 const app={db,now:()=>now,route(){},afterRequest(){}};setupTalabat(app);
 assert.equal((await app.talabat.matchDay(day)).rows.length,0);
 sql.prepare('INSERT INTO talabat_orders(id,day,placed_at,first_seen,updated_at) VALUES(?,?,?,?,?)').run('123',day,now,now,now);
 assert.equal((await app.talabat.matchDay(day)).rows.length,0,'old report cache reproduced');
 assert.equal((await app.talabat.matchDay(day,{fresh:true})).rows.length,1);
 sql.close();
});
test('100 simultaneous isolates acquire one build lease; crash expiry and owner release are safe',async()=>{
 const {sql,db}=fixture();
 const leases=await Promise.all(Array.from({length:100},()=>takeTransferBuildLease(db,'2026-11-12',1000)));
 assert.equal(leases.filter(Boolean).length,1);
 assert.equal(await takeTransferBuildLease(db,'2026-11-12',30999),null);
 const successor=await takeTransferBuildLease(db,'2026-11-12',31000); assert.ok(successor);
 await leases.find(Boolean)();
 assert.equal(await takeTransferBuildLease(db,'2026-11-12',31001),null,'expired owner cannot remove successor');
 await successor(); assert.ok(await takeTransferBuildLease(db,'2026-11-12',31002));
 sql.close();
});
test('100 queue readers share one rebuild of 1000 orders and then all see the new order',async()=>{
 const {sql,db}=fixture(); let now=Date.parse('2026-11-12T20:00:00Z'),builds=0;
 const day='2026-11-12';
 for(let i=1;i<=500;i++) sql.prepare('INSERT INTO site_orders(id,day,status,created_at) VALUES(?,?,?,?)').run(i,day,'processing',now);
 const rows=Array.from({length:500},(_,i)=>({id:String(10000+i),day,status:'ACCEPTED',placed_at:now,items:'[]'}));
 const apps=Array.from({length:100},()=>{
  const app={db,now:()=>now,route(){},afterRequest(){},fail:(s,m)=>{throw Object.assign(Error(m),{status:s})},talabat:{matchDay:async()=>{builds++; await new Promise(r=>setImmediate(r));return {rows:[...rows],matches:new Map(),states:new Map()}}}};
  setup(app);return app;
 });
 const initial=await apps[0].transferQueue(day,{now});assert.equal(initial.orders.length,1000);
 now+=5000;rows.push({id:'99999',day,status:'ACCEPTED',placed_at:now,items:'[]'});
 const burst=await Promise.all(apps.map(app=>app.transferQueue(day,{now})));
 assert.equal(builds,2,'only one additional heavy build across 100 readers');
 assert.ok(burst.every(x=>x.orders.length>=1000));
 assert.ok(burst.every(x=>!x.stale),'busy builder must not disable an active editor');
 const fresh=await Promise.all(apps.map(app=>app.transferQueue(day,{now})));
 assert.ok(fresh.every(x=>x.orders.some(o=>o.ref==='99999')));
 assert.equal(builds,2,'completed shared snapshot avoids duplicate rebuilds');
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM settings WHERE key LIKE 'transfer-build:%'").get().n,0);
 sql.close();
});
test('new cards appear during editing without replacing the focused card or its text',()=>{
 const html=readFileSync(new URL('../public/transfer/index.html',import.meta.url),'utf8');
 const begin=html.indexOf('  const act = document.activeElement;',html.indexOf('function render(force)'));
 const end=html.indexOf('  // The order at the top',begin);
 const root={children:[],contains:()=>true,appendChild(el){this.children.push(el)}};
 const node=(key,text)=>({dataset:{k:key},classList:{contains:()=>false},outerHTML:text,replaceWith(el){root.children.splice(root.children.indexOf(this),1,el)},remove(){root.children.splice(root.children.indexOf(this),1)}});
 const active=node('site:1','unsaved text'),old=node('talabat:2','old status'),gone=node('site:3','gone');
 root.children=[active,old,gone];
 const incoming=[node('site:1','server text'),node('talabat:2','new status'),node('site:4','new order')];
 const act={tagName:'INPUT',value:'employee typing',selectionStart:4,closest:()=>active};
 const render={};
 vm.runInNewContext('(function(){'+html.slice(begin,end)+'})()',{
  document:{activeElement:act,createElement:()=>({content:{children:incoming}})},
  force:false,data:{stale:false},$:()=>root,html:'rendered',render
 });
 assert.equal(root.children[0],active);assert.equal(act.value,'employee typing');assert.equal(act.selectionStart,4);
 assert.equal(root.children.find(x=>x.dataset.k==='talabat:2').outerHTML,'new status');
 assert.ok(root.children.some(x=>x.dataset.k==='site:4'));assert.ok(!root.children.includes(gone));
 assert.equal(render.pending,true,'focused card reconciles after focus leaves');
 incoming.splice(0,1); // Source cancelled the card whose input still has focus.
 vm.runInNewContext('(function(){'+html.slice(begin,end)+'})()',{
  document:{activeElement:act,createElement:()=>({content:{children:incoming}})},
  force:false,data:{stale:false},$:()=>root,html:'rendered',render
 });
 assert.ok(!root.children.includes(active),'cancelled focused card must disappear immediately');
});
test('failed build releases lease so a later request can recover',async()=>{
 const {sql,db}=fixture();const now=Date.parse('2026-11-12T20:00:00Z');let broken=true;
 const app={db,now:()=>now,route(){},afterRequest(){},fail:(s,m)=>{throw Error(m)},talabat:{matchDay:async()=>{if(broken)throw Error('test outage');return {rows:[],matches:new Map(),states:new Map()}}}};setup(app);
 await assert.rejects(app.transferQueue('2026-11-12',{now}),/test outage/);broken=false;
 assert.equal((await app.transferQueue('2026-11-12',{now})).orders.length,0);
 sql.close();
});


