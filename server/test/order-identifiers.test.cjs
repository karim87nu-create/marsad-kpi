const test=require('node:test'),assert=require('node:assert/strict');
const {referenceEvidence,talabatReference,apexReceipt,apexAlertText,platformAlertText}=require('../src/order-identifiers.js');

test('platform numbers have separate namespaces; no zero stripping, suffix or Apex ID comparisons',()=>{
 const o={source:'talabat',id:'4676938403',code:'8403'};
 assert.equal(referenceEvidence(o,{kind:'طلبات',tag:'8403'}).exact,true);
 for(const tag of ['843','38403'])assert.equal(referenceEvidence(o,{kind:'طلبات',tag}).exact,false);
 assert.equal(referenceEvidence(o,{kind:'طلبات',tag:o.id}).exact,false);
 assert.equal(referenceEvidence(o,{kind:'طلبات',no:'8403',sn:'8403'}).exact,false);
 assert.equal(referenceEvidence(o,{kind:'طلبات',sourceRefs:{talabat:{orderId:'8403'}}}).conflict,true);
 assert.equal(referenceEvidence(o,{kind:'طلبات',sourceRefs:{talabat:{orderId:o.id}}}).exact,true);
 assert.equal(referenceEvidence(o,{kind:'الموقع',tag:'8403'}).conflict,true);
 const website={source:'site',id:'8403',code:'9999'};
 assert.equal(referenceEvidence(website,{kind:'الموقع',tag:'8403'}).exact,true);
 assert.equal(referenceEvidence(website,{kind:'الموقع',sourceRefs:{talabat:{code:'8403'}}}).exact,false);
});
test('Telegram labels distinguish Talabat ID and hashtag and never substitute internal Apex ID for receipt',()=>{
 assert.equal(talabatReference({id:'4676938403',code:'8403'}),'رقم أوردر طلبات: 4676938403\nهاشتاج طلبات: #8403');
 assert.equal(apexReceipt({no:3526900,sn:512}),'512');assert.equal(apexReceipt({no:3526900}),'غير متاح');
 assert.equal(apexAlertText('🖥️ Apex | أوردر 3526900 اتأخر',{no:3526900,sn:512}),'🖥️ Apex | أوردر Apex 512 اتأخر');
 const old='رقم أوردر طلبات: #8403\nرقمه على Apex: 3526900';
 const fixed=platformAlertText(old,'talabatCancel','talabat:cancel:4676938403');
 assert.match(fixed,/هاشتاج طلبات: #8403/);assert.match(fixed,/رقم أوردر طلبات: 4676938403/);assert.ok(!fixed.includes('3526900'));
 const site=platformAlertText('رقم أوردر الموقع: #101\nرقمه على Apex: 222','sitePrep','site:prep:101');
 assert.ok(site.includes('#101'));assert.ok(!site.includes('222'));
});
