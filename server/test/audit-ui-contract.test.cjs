const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {start}=require('./helpers.cjs');const root=path.join(__dirname,'../..');
test('Sites exports every registered method and permits PUT in CORS',async()=>{
 const source=fs.readFileSync(path.join(root,'sites/app/api/[...path]/route.ts'),'utf8');
 const methods=new Set();for(const file of fs.readdirSync(path.join(root,'server/src')))if(file.endsWith('.js'))for(const m of fs.readFileSync(path.join(root,'server/src',file),'utf8').matchAll(/app\.route\('([A-Z]+)'/g))methods.add(m[1]);
 for(const method of methods)assert.match(source,new RegExp('export const '+method+' = handle;'));
 const t=await start();try{const r=await t.call('OPTIONS','/api/apex-names',{headers:{origin:'https://karim87nu-create.github.io'}});assert.match(r.headers.get('access-control-allow-methods'),/PUT/);}finally{await t.close();}
});
test('team card computes weighted AHT from raw totals, including answered calls of zero duration',async()=>{
 const source=fs.readFileSync(path.join(root,'v2/app.js'),'utf8'),fn=source.slice(source.indexOf('  async function renderTeam()'),source.indexOf('  // ---------- ملف الموظف'));
 let cards;const employees=[{answered:1,talkSeconds:600},{answered:9,talkSeconds:900},{answered:1,talkSeconds:0}];
 const ctx={dayData:async()=>({employees}),teamRows:()=>[],kpi:(label,value)=>({label,value}),dur:x=>x,avg:a=>a.reduce((x,y)=>x+y,0)/a.length,table:()=>{},teamColumns:[],state:{},$:()=>({replaceChildren:(...x)=>{cards=x;}})};
 vm.createContext(ctx);vm.runInContext(fn+';this.run=renderTeam;',ctx);await ctx.run();assert.equal(cards[2].value,1500/11);
});
test('open review is visible but does not count as a confirmed employee error; clear records before and after',async()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'v2/insights.js'),'utf8'),ctx);
 const ui=ctx.window.MarsadInsights({state:{day:'2026-10-22'},$:()=>({addEventListener(){}}),api:async()=>({reviews:[{key:'error',verdict:'error'},{key:'ok',verdict:'ok'}],patterns:{}})});
 await ui.reviews(true);assert.equal(ui.counts({key:'open'}),false);assert.equal(ui.counts({key:'error'}),true);assert.equal(ui.counts({key:'ok'}),false);
 const t=await start();try{const admin=await t.admin();await admin('POST','/api/exception-reviews',{key:'x',verdict:'error'});await admin('POST','/api/exception-reviews',{key:'x',verdict:null,note:'corrected'});const a=JSON.parse(t.app.db.raw.prepare("SELECT details FROM audit WHERE action='exception_review_cleared'").get().details);assert.equal(a.before.verdict,'error');assert.equal(a.after,null);assert.equal(a.reason,'corrected');}finally{await t.close();}
});
