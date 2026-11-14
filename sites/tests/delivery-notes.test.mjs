import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryLabel,deliveryNotes,deliveryComment,compactDeliveryComment} from '../lib/marsad/delivery-fields.js';
const at=Date.parse('2026-11-14T17:30:00Z');
test('Cairo appointment goes next to customer name, preserving source, payment and full order number',()=>{
 const b=deliveryNotes('موعد التوصيل: 14/11/2026 ٧:٣٠ م | بدون ملح',at);
 assert.equal(b.appointment,'حجز 14/11 7:30م');assert.equal(b.note,'بدون ملح');
 const label=deliveryLabel('محمد أحمد عبدالله إبراهيم حسن مصطفى','site','cash','31075',b.appointment);
 assert.ok(label.length<=50);assert.ok(label.startsWith('محمد'));assert.match(label,/حجز 14\/11 7:30م/);assert.ok(label.endsWith('/موقع/كاش/#31075'));
});
test('a standalone appointment in the source note can move without inventing a date',()=>{
 assert.deepEqual(deliveryNotes('حجز الساعة ٨ م | زيادة عيش'),{appointment:'حجز 8:00م',note:'زيادة عيش'});
});
test('conflicting times, dates, and instructions containing a time are preserved',()=>{
 for(const note of ['موعد التوصيل: 8 م','موعد التوصيل: 15/11/2026 7:30 م','كلم العميل الساعة 7:30 م','حجز 7:30 م بدون بصل'])assert.equal(deliveryNotes(note,at).note,note);
 assert.equal(deliveryNotes('حجز 7 م | حجز 8 م').note,'حجز 8 م');
});
test('midnight and noon use the correct meridiem; invalid or absent appointment adds nothing',()=>{
 assert.match(deliveryNotes('',Date.parse('2026-11-13T22:00:00Z')).appointment,/14\/11 12:00ص/);
 assert.match(deliveryNotes('',Date.parse('2026-11-14T10:00:00Z')).appointment,/12:00م/);
 assert.equal(deliveryNotes('بدون بصل').appointment,'');
 assert.equal(deliveryNotes('حجز 25:99 م').appointment,'');
});
test('receipt example omits empty salad choice heading but keeps actual food and customer instructions',()=>{
 const order={source:'site',note:'بدون بصل',items:[{name:'طبق كباب ضاني',freeOptions:['اختيارات السلطة','اختيارات السلطة: سلطة طحينة'],note:'تسوية كاملة'}]};
 const comment=deliveryComment(order);assert.ok(!comment.includes('اختيارات'));assert.ok(comment.includes('سلطة طحينة'));assert.ok(comment.includes('بدون بصل'));assert.ok(comment.includes('تسوية كاملة'));
 assert.equal(compactDeliveryComment('طبق كباب ضاني: اختيارات السلطة'),'');
 assert.equal(compactDeliveryComment('بدون ملح: اختيارات السلطة'),'بدون ملح: اختيارات السلطة');
});
test('scheduled order retains cooking notes while its standalone schedule leaves kitchen comment',()=>{
 const comment=deliveryComment({source:'site',scheduledAt:new Date(at).toISOString(),note:'ميعاد التوصيل: 7:30 م | حساسية من المكسرات',items:[]});
 assert.equal(comment,'حساسية من المكسرات');
});
