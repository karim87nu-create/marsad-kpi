(function(){
 'use strict';
 let state=null,busy=false,sequence=0;
 const node=id=>document.getElementById(id);
 const errors={telegram_token_invalid:'التوكن غير صحيح. انسخه كاملًا من BotFather.',telegram_bot_in_use:'البوت مستخدم في ربط آخر. استخدم بوتًا مخصصًا لنا.',telegram_settings_changed:'إعدادات الربط اتغيرت. حدّث الحالة قبل المحاولة.',telegram_pair_expired:'انتهت صلاحية الكود؛ أنشئ كودًا جديدًا.',telegram_pair_not_found:'لم يتم تأكيد الحساب بعد.',telegram_pair_ambiguous:'وصل الكود من أكثر من حساب. أنشئ كودًا جديدًا ولا تشاركه.',telegram_token_needs_resaving:'أعد حفظ التوكن؛ تعذر فتحه بكلمة مرور الإدارة الحالية.',telegram_rate_limit:'تليجرام طلب الانتظار. حاول لاحقًا.',telegram_setup_rate_limit:'محاولات كثيرة؛ انتظر دقيقة.',telegram_chat_blocked:'الحساب حظر البوت. افتحه واضغط Start.',telegram_delivery_unconfirmed:'تعذر تأكيد الإرسال. قد تكون الرسالة وصلت؛ راجع تليجرام قبل إعادة الإرسال.',telegram_test_not_accepted:'لا يوجد اختبار مقبول يمكن تأكيد رؤيته.',telegram_settings_unavailable:'تعذر تحميل إعدادات الربط. حاول لاحقًا.',telegram_request_rejected:'تليجرام لم يقبل الطلب؛ حاول لاحقًا.'};
 const text=(id,value)=>node(id).textContent=value;
 function render(){
  const s=state||{},test=s.latestTest;
  text('tgStatus',!s.configured?'البوت لم يتم ربطه بعد.':s.receiptAt?'أكدت وصول الاختبار إلى موبايلك. التنبيهات التلقائية لم تبدأ بعد.':s.paired?'تم ربط الحساب: '+s.chatName+' — اختبر وصول الرسالة.':'تم التحقق من البوت: @'+s.botName+' — أكمل ربط حسابك.');
  node('tgPair').hidden=!s.pairCode||!!s.paired;node('tgNewPair').hidden=!s.configured;
  node('tgLink').removeAttribute('href');
  if(s.pairUrl&&/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=marsad_[a-f0-9]+$/.test(s.pairUrl))node('tgLink').href=s.pairUrl;
  text('tgCommand',s.pairCode?'/start '+s.pairCode:'');node('tgCandidate').hidden=!s.candidateName||!!s.paired;text('tgCandidateName','الحساب الذي أرسل كود الربط: '+(s.candidateName||''));
  node('tgTesting').hidden=!s.paired;node('tgReceipt').hidden=test?.status!=='accepted'||!!s.receiptAt;
  text('tgTestStatus',!test?'لم تُرسل رسالة اختبار بعد.':s.receiptAt?'أنت أكدت رؤيتك للرسالة.':test.status==='accepted'?'تليجرام قبل الرسالة؛ ده مش إثبات إنك شفتها. راجع الموبايل ثم أكد.':test.status==='failed'?'لم يقبل تليجرام الاختبار. '+(errors[test.errorCode]||'حاول لاحقًا.'):'الإرسال غير مؤكد. راجع الموبايل؛ إعادة الإرسال قد تكرر الرسالة.');
 }
 async function run(action,extra={}){
  if(busy)return;busy=true;const seq=++sequence,auth=sessionStorage.getItem('adminPassword');
  text('tgMessage','جارٍ تنفيذ الطلب…');node('telegram').querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await api('/api/telegram',action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,revision:state?.revision,...extra})}:{});
   if(seq!==sequence||!auth||auth!==sessionStorage.getItem('adminPassword'))return;
   state=result;render();text('tgMessage',action==='discover'&&!result.candidateName&&!result.paired?'لم يصل كود الربط بعد. ابعته للبوت ثم حاول مرة أخرى.':'تم تحديث حالة الربط.');
  }catch(e){text('tgMessage',e.message==='telegram_connection_failed'?'تعذر الاتصال بتليجرام لإتمام التحقق أو الربط. لم تُرسل رسالة اختبار. حاول لاحقًا.':e.message==='telegram_redirect_rejected'?'رفضنا تحويل الاتصال إلى عنوان آخر لحماية التوكن. لم يكتمل الطلب.':errors[e.message==='telegram_bot_blocked'?'telegram_chat_blocked':e.message]||'تعذر إتمام الربط. تأكد من الدخول للإدارة واتصال الإنترنت.');}
  finally{node('tgToken').value='';busy=false;node('telegram').querySelectorAll('button').forEach(b=>b.disabled=false)}
 }
 const tab=document.createElement('button');tab.dataset.tab='telegram';tab.textContent='تنبيهات الموبايل';node('tabs').appendChild(tab);
 const previous=showTab;showTab=function(id){previous(id);if(id==='telegram'){text('filterNote','ربط تنبيهات الإدارة بالموبايل؛ لا يتأثر بفلاتر الموظفين أو التاريخ.');run()}};
 node('tgForm').onsubmit=e=>{e.preventDefault();if(state?.configured&&!confirm('إعادة حفظ التوكن تلغي ربط الحساب الحالي وتحتاج اختبارًا جديدًا. أكمل؟'))return;const token=node('tgToken').value.trim();node('tgToken').value='';run('save_token',{token})};
 node('tgReload').onclick=()=>run();node('tgDiscover').onclick=()=>run('discover');
 node('tgConfirm').onclick=()=>{if(confirm('تأكيد أن '+state?.candidateName+' هو حسابك الذي سيستقبل رسائل الإدارة؟'))run('confirm_pair')};
 node('tgNewPair').onclick=()=>{if(confirm('إلغاء الحساب المرتبط وإنشاء كود ربط جديد؟ بيانات الموظفين والسجلات لن تتغير.'))run('new_pair')};
 node('tgTest').onclick=()=>{if(state?.latestTest&&state.latestTest.status!=='failed'&&!confirm('قد يكون الاختبار السابق وصل بالفعل. إرسال رسالة اختبار جديدة؟'))return;run('test',{requestId:crypto.randomUUID()})};
 node('tgReceipt').onclick=()=>run('confirm_receipt',{requestId:state?.latestTest?.id});
 window.addEventListener('storage',()=>{if(!sessionStorage.getItem('adminPassword')){++sequence;state=null;node('tgToken').value='';render()}});
 node('logoutButton').addEventListener('click',()=>{++sequence;state=null;node('tgToken').value='';render()});
})();