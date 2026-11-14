import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setup as setupLearn } from '../lib/marsad/learn.js';
import { setup as setupTransfer } from '../lib/marsad/transfer.js';
import { sha256 } from '../lib/marsad/security.js';

test('kind-filtered evidence keeps replacement semantics and uses indexed lookups', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE learned(kind TEXT,a TEXT,b TEXT,ref TEXT,value REAL,at INTEGER,PRIMARY KEY(kind,a,b,ref)); CREATE TABLE learning_evidence(source TEXT,ref TEXT,facts TEXT,at INTEGER,PRIMARY KEY(source,ref)); CREATE INDEX learning_evidence_ref ON learning_evidence(ref)');
  const insert = sql.prepare('INSERT INTO learned VALUES(?,?,?,?,?,?)');
  for (let i=0;i<10000;i++) insert.run('unrelated','a','b',String(i),null,1);
  insert.run('match-v2:item:talabat','old','1','7',null,1);
  insert.run('match-v2:item:talabat','legacy','2','8',null,1);
  insert.run('transfer:item:site','website','3','site:7',null,1);
  sql.prepare('INSERT INTO learning_evidence VALUES(?,?,?,?)').run('talabat','7',JSON.stringify([{kind:'match-v2:item:talabat',a:'new',b:'4'}]),2);
  const queries=[];
  const app={now:()=>10,route(){},db:{prepare:q=>({all:async(...p)=>{queries.push({q,p});return sql.prepare(q).all(...p);}})}};
  const learn=setupLearn(app);
  const pairs=await learn.pairs('match-v2:item:talabat');
  assert.deepEqual([...pairs.keys()].sort(),['legacy','new']);
  assert.equal(pairs.get('new').get('4'),1);
  const first=queries[0];
  assert.match(sql.prepare('EXPLAIN QUERY PLAN '+first.q).all(...first.p).map(x=>x.detail).join(' '),/SEARCH learned .*kind=/);
  queries.length=0;
  const site=await learn.pairs('transfer:item:site');
  assert.equal(site.get('website').get('3'),1);
  assert.equal(queries.length,1,'non-match evidence must not scan active match history');
  queries.length=0;
  await learn.pairs('transfer:item:site');
  assert.equal(queries.length,0,'completed results stay cached');
  sql.close();
});

function writerFixture({failLearning=false,failUpdate=false}={}) {
  const routes=new Map(),background=[];
  let state='auto_sending',saved=null;
  const app={afterRequest(){},route:(m,p,h)=>routes.set(m+' '+p,h),
    fail:(s,m)=>{throw new Error(s+':'+m);},audit:async()=>{},learn:{},
    db:{kind:'d1',prepare:q=>({
      get:async(...args)=>{
        if(q.includes('FROM settings')) return {value:sha256('test-token')};
        if(q.includes('SELECT result')) return {result:null};
        if(q.includes('SELECT payload')) {if(failLearning) throw new Error('D1 overloaded during learning'); return {payload:'{}'};}
        throw new Error('unexpected query: '+q);
      },
      run:async(...args)=>{if(failUpdate) throw new Error('D1 failed before result persisted'); state=args[0];saved=JSON.parse(args[1]);return {changes:1};}
    })}
  };
  setupTransfer(app);
  return {handler:routes.get('POST /api/apex-writer/result'),background,
    ctx:{now:100000,header:()=> 'test-token',body:{source:'talabat',ref:'123',db:'live',ok:true,orderNo:702100,shiftSerial:650},waitUntil:p=>background.push(p)},
    state:()=>state,saved:()=>saved};
}

test('learning failure after durable success does not fail the cashier response',async()=>{
  const f=writerFixture({failLearning:true});
  const errors=[],previous=console.error; console.error=(...v)=>errors.push(v);
  try {
    assert.deepEqual(await f.handler(f.ctx),{ok:true});
    await Promise.all(f.background);
    assert.equal(f.state(),'auto_done');
    assert.equal(f.saved().orderNo,702100);
    assert.equal(errors.length,1);
  } finally {console.error=previous;}
});

test('failure before persisting a writer result is still reported',async()=>{
  const f=writerFixture({failUpdate:true});
  await assert.rejects(f.handler(f.ctx),/before result persisted/);
  assert.equal(f.state(),'auto_sending');
  assert.equal(f.background.length,0);
});
