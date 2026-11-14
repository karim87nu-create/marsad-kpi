import test from 'node:test';
import assert from 'node:assert/strict';
import { sitePaymentChoice } from '../lib/marsad/site-payment-choice.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const [from,to] of [['cod','paid'],['online','cash'],['online-unpaid','cash'],['online-unpaid','paid']]) {
  test('manual payment correction '+from+' -> '+to,()=>{
    const confirmation={from,to,confirmed:true};
    assert.deepEqual(sitePaymentChoice(from,to,confirmation,true),{override:{from,to}});
    assert.ok(sitePaymentChoice(from,to,null,true).error);
    assert.ok(sitePaymentChoice(from,to,confirmation,false).error,'automatic processing cannot override source');
    assert.ok(sitePaymentChoice(from,to,{...confirmation,from:'stale-method'},true).error);
    assert.ok(sitePaymentChoice(from,to,{...confirmation,to:to==='cash'?'paid':'cash'},true).error);
  });
}
test('unchanged payment needs no confirmation',()=>{
  assert.deepEqual(sitePaymentChoice('cod','cash',null),{override:null});
  assert.deepEqual(sitePaymentChoice('online','paid',null),{override:null});
});
test('mixed payment cannot be collapsed to either payment type',()=>{
  for(const to of ['cash','paid']) assert.ok(sitePaymentChoice('mixed',to,{from:'mixed',to,confirmed:true},true).error);
});
test('invalid payment cannot be submitted',()=>{
  assert.ok(sitePaymentChoice('cod','other',{from:'cod',to:'other',confirmed:true},true).error);
});
test('transfer browser script remains valid JavaScript',()=>{
  const html=readFileSync(new URL('../public/transfer/index.html',import.meta.url),'utf8');
  for(const [,attributes,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    if(!/src=|type=["']module/.test(attributes)) new vm.Script(code);
  }
});
