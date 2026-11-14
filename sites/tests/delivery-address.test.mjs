import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliveryAddress,splitDeliveryAddress,deliveryMark } from '../lib/marsad/delivery-fields.js';
import { setup } from '../lib/marsad/translate.js';
test('observed address retains the building instead of moving it into a truncated landmark',()=>{
 const p=deliveryAddress('سكن مصر مسلسل 8، بجانب نادى المهندسين، القاهرة، مبنى: عماره 20 — الدور: 3 — الشقة: 13');
 assert.equal(p.floor,'3');assert.equal(p.flat,'13');assert.ok(!p.street.includes('القاهرة'));
 // Karim 11-14: the place first (here «سكن مصر»), then the building, the landmark last.
 assert.equal(p.street,'سكن مصر مسلسل 8، عماره 20، بجانب نادى المهندسين');const s=splitDeliveryAddress(p.street);assert.equal(s.extra,'');assert.equal(s.main,p.street);
});
test('addresses use 100 characters and overflow is retained without cutting words',()=>{
 const input='شارع طويل بجوار المدرسة الجديدة مبنى 123 بوابة 4 '.repeat(3).trim();
 const s=splitDeliveryAddress(input);assert.ok(s.main.length<=100);assert.ok(s.main.length>52);
 assert.equal([s.main,s.extra].filter(Boolean).join(' '),input);
});
test('special-mark limits match the writer and reject overflow instead of losing address text',()=>{
 assert.equal(deliveryMark('', 'x'.repeat(50)),'x'.repeat(50));
 assert.equal(deliveryMark('خصم طلبات 145.64','x'.repeat(50)),null);
 const s=splitDeliveryAddress('x'.repeat(101));assert.equal(s.main,'');assert.equal(s.extra.length,101);assert.equal(deliveryMark('',s.extra),null);
});
test('safe address dictionary preserves unfamiliar places and numbers without AI or cached guesses',()=>{
 const app={config:{},now:()=>0,db:{prepare(){throw Error('address translation must not query old translations')}}};setup(app);
 const raw='Qzxplace, Mountain View Hyde Park, Building 6B — Floor: 2 — Apartment: 41';
 const ar=app.toArabicAddress([raw]).get(raw);
 assert.ok(ar.includes('Qzxplace'));assert.ok(ar.includes('ماونتن فيو'));assert.ok(ar.includes('6B'));
 assert.deepEqual(ar.match(/\d+/g),raw.match(/\d+/g));
 const p=deliveryAddress(ar);assert.equal(p.floor,'2');assert.equal(p.flat,'41');
});
test('browser and server have exactly the same address formatting and capacity',()=>{
 assert.equal(readFileSync(new URL('../lib/marsad/delivery-fields.js',import.meta.url),'utf8'),readFileSync(new URL('../public/transfer/delivery-fields.js',import.meta.url),'utf8'));
});
