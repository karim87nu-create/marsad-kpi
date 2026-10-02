const API='https://marsad-kpi-live.karim87nu.chatgpt.site';
const $=id=>document.getElementById(id),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let daily=null,historical=null,staff=[],context=null,contextCall=null,offset=0,lastLiveFetch=0,refreshing=false,selectedTab='live',generation=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fmt(v){if(v==null||!Number.isFinite(Number(v)))return 'غير معروف';const s=Math.max(0,Math.floor(Number(v)));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')}
const at=v=>v?new Date(v).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'}):'—';
const stateLabel=v=>({no_session:'لم يبدأ جلسة في نظامنا',unknown:'غير معروف / لا توجد نبضة مؤكدة',offline:'خروج موثق',break:'بريك',on_call:'في مكالمة',ready:'متصل؛ الاستقبال غير مثبت',post_call:'أنهى مكالمة؛ الاستقبال غير مثبت',logged_in:'دخول مسجل',uncertain:'حالة غير مؤكدة خلال التوقيت'}[v]||v||'غير معروف');
const eventLabel=v=>({session_login:'دخول / ربط الموظف',session_logout:'خروج الموظف',arabicss_logout:'خروج أرابيكس',arabicss_login:'دخول أرابيكس',break_start:'بداية بريك',break_end:'نهاية بريك',break_observed:'بريك قائم؛ البداية غير معروفة',break_end_unknown:'نهاية بريك؛ المدة ناقصة',call_observed:'مكالمة قائمة قبل الرصد',call_observed_end:'نهاية المكالمة المرصودة',page_closed:'انتقال / إغلاق الصفحة؛ ليس خروجًا مؤكدًا'}[v]||v);
const reasonLabel=v=>({explicit_logout:'خروج مؤكد',arabicss_logout:'خروج من أرابيكس',arabicss_login_page:'عودة إلى دخول أرابيكس',extension_changed:'تغير الاكستنشن',extension_restarted:'أعيد تشغيل الإضافة',tab_closed:'إغلاق صفحة الموظف',browser_restarted:'اكتُشف عند إعادة فتح المتصفح؛ وقت الإغلاق غير معروف',verified:'هوية موثقة',identity_verified:'تسجيل الهوية',bound:'ربط الاكستنشن',ready:'متصل',break:'بريك',recent_identity_event:'حدث حديث موثق',no_identity_events:'لا يوجد سجل هوية وقتها',missing_recent_presence:'لا توجد نبضة حديثة؛ لا يثبت الخروج',page_closed_or_unknown:'الصفحة أُغلقت أو الحالة غير مؤكدة',employee_created_later:'أُضيف الموظف بعد هذه المكالمة',changed_within_time_window:'تغيرت الحالة داخل توقيت المصدر',missing_call_time:'وقت الفائتة غير متاح',stale_logout:'دليل الخروج قديم'}[v]||v||'—');
const missedLabel=v=>({counted:'محتسبة (>7ث)',short_exempt:'معفاة — توضيح فقط',after_hours:'خارج ساعات العمل',unknown_wait:'انتظار غير معروف',unknown_queue:'نوع طلب غير معروف'}[v]||v);
const requestType=q=>({'0':'خارج ساعات العمل','1':'طلب أوردر','2':'متابعة أوردر','3':'شكاوى'}[String(q).slice(-1)]||'نوع طلب غير معروف');
const unavailable=e=>['break','on_call','offline'].includes(e.state);
function row(values,cls=''){return '<tr'+(cls?' class="'+cls+'"':'')+'>'+values.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>'}
function table(id,values,columns){$(id).innerHTML=values.join('')||'<tr><td colspan="'+columns+'">لا توجد بيانات مطابقة</td></tr>'}
function cards(id,values){$(id).innerHTML=values.map(([k,v])=>'<div class="card">'+esc(k)+'<span>'+esc(v)+'</span></div>').join('')}
function matches(e){return(!$('employeeFilter').value||Number(e.employeeId)===Number($('employeeFilter').value))&&(!$('extensionFilter').value||String(e.extension)===$('extensionFilter').value.trim())}
function callsFiltered(list=daily?.calls||[]){const q=$('callSearch').value.trim().toLowerCase();return list.filter(e=>matches(e)&&(!q||(String(e.agentName)+' '+String(e.phone)).toLowerCase().includes(q))&&(!$('callType').value||e.callType===$('callType').value)&&(!$('callStatus').value||e.eventType===$('callStatus').value))}
function eventsFiltered(list=daily?.timeline||[]){const f=$('eventFilter').value;return list.filter(e=>matches(e)&&(!f||f==='break'&&e.eventType.startsWith('break_')||f==='login'&&e.eventType.endsWith('_login')||f==='logout'&&e.eventType.endsWith('_logout')||f==='unknown'&&['page_closed','break_observed','break_end_unknown','call_observed','call_observed_end'].includes(e.eventType)))}
function queuesFiltered(){return(historical?.queues||[]).filter(q=>!$('queueFilter').value||q.queue===$('queueFilter').value)}
function missedFiltered(){return(historical?.missed||[]).filter(c=>(!$('queueFilter').value||c.queue===$('queueFilter').value)&&(!$('missedFilter').value||c.classification===$('missedFilter').value))}
function contextFiltered(list=context?.employees||[]){const f=$('contextFilter').value;return list.filter(e=>matches(e)&&(!f||f==='unavailable'&&unavailable(e)||f==='unknown'&&['unknown','uncertain'].includes(e.state)))}
function dashboardQuery(date=$('day').value){return '/api/dashboard?'+new URLSearchParams({date,employee:$('employeeFilter').value,extension:$('extensionFilter').value.trim()})}
async function api(path,options={}){const r=await fetch(API+path,{...options,headers:{'x-admin-password':sessionStorage.getItem('adminPassword')||'',...(options.headers||{})},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(r.status===401?'كلمة المرور غير صحيحة أو انتهى الدخول':d.error||'تعذر الاتصال');return d}
function showTab(id){selectedTab=id;$('filterNote').textContent=['queue','missed'].includes(id)?'فلتر الموظف يخص حالات الموظفين فقط. سجل أرابيكس بحساب مشترك لا يدعم نسبة المكالمة لشخص؛ استخدم نوع الطلب للسجل.':'فلتر الاسم ورقم التحويلة يطبق على بيانات الموظفين في القسم المفتوح.';document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===id))}
function clearDay(){daily=null;historical=null;context=null;contextCall=null;$('contextPanel').hidden=true;renderDaily();renderHistory()}
async function refresh(force=false){
 if(!sessionStorage.getItem('adminPassword')||refreshing&&!force)return;
 refreshing=true;const date=$('day').value,seq=++generation;
 try{
  const [d,h,employees]=await Promise.all([api(dashboardQuery(date)),api('/api/history?date='+date),api('/api/employees')]);
  if(seq!==generation||date!==$('day').value)return;
  daily=d;historical=h;staff=employees.employees;offset=Date.parse(d.serverNow)-Date.now();lastLiveFetch=Date.now();
  const choice=$('employeeFilter').value;$('employeeFilter').innerHTML='<option value="">كل الموظفين</option>'+staff.map(e=>'<option value="'+e.id+'">'+esc(e.name+(e.active?'':' — محذوف'))+'</option>').join('');$('employeeFilter').value=choice;
  const queueChoice=$('queueFilter').value;$('queueFilter').innerHTML='<option value="">كل أنواع الطلبات</option>'+(h.queues||[]).map(q=>'<option value="'+esc(q.queue)+'">'+esc(q.label)+'</option>').join('');$('queueFilter').value=queueChoice;
  $('syncStatus').textContent='آخر تحديث '+new Date().toLocaleTimeString('ar-EG',{timeZone:'Africa/Cairo'});$('syncStatus').classList.remove('bad');$('message').textContent='';
  $('periodNote').textContent='السجلات والمؤشرات: '+date+' فقط — اللايف يعرض الآن دائمًا، حتى عند اختيار يوم قديم.';
  renderDaily();renderHistory();renderRoster();renderLive();
 }catch(e){if(seq===generation){$('syncStatus').textContent='تعذر التحديث — البيانات المعروضة قديمة';$('syncStatus').classList.add('bad');$('message').textContent=e.message;renderLive()}}finally{if(seq===generation)refreshing=false}
}
function metricsFiltered(){const perf=daily?.performance||[];const records=$('extensionFilter').value?perf:staff.filter(e=>e.active||perf.some(p=>p.employeeId===e.id)||Number($('employeeFilter').value)===e.id).map(e=>perf.find(p=>p.employeeId===e.id)||{employeeId:e.id,employee:e.name,calls:0,inbound:0,outbound:0,answered:0,avgHandleTime:0,breakSeconds:0,unknownBreaks:0,firstLogin:null,lastLogout:null});return records.filter(p=>!$('employeeFilter').value||p.employeeId===Number($('employeeFilter').value))}
function renderDaily(){
 const perf=metricsFiltered(),sum=k=>perf.reduce((n,p)=>n+(p[k]||0),0);
 cards('metricCards',[['مكالمات مسجلة',sum('calls')],['وارد',sum('inbound')],['صادر',sum('outbound')],['البريك المكتمل',fmt(sum('breakSeconds'))]]);
 table('metricRows',perf.map(p=>{const e=staff.find(e=>e.id===p.employeeId);return row([e?.name||p.employee,e?.employeeCode||'—',p.calls,p.inbound,p.outbound,p.answered,p.answered?fmt(p.avgHandleTime):'غير متاح',at(p.firstLogin),at(p.lastLogout),fmt(p.breakSeconds),p.unknownBreaks])}),11);
 table('callRows',callsFiltered().map(e=>row([e.agentName,e.extension,e.callType==='incoming'?'وارد':e.callType==='outgoing'?'صادر':'غير معروف',e.phone,e.eventType==='agentunlinked'?'مكتملة':'بداية بدون نهاية — ليست دليلًا أنها جارية الآن',at(e.startedAt||e.occurredAt),e.eventType==='agentunlinked'?fmt(e.durationSeconds):'انظر اللايف'])),7);
 table('attendanceRows',eventsFiltered().map(e=>row([e.agentName,e.extension,eventLabel(e.eventType),reasonLabel(e.state),at(e.occurredAt),e.eventType==='break_end'?fmt(e.durationSeconds):e.eventType==='break_end_unknown'?'غير معروفة':'—'])),6);
 $('callCoverage').textContent=daily?.detailsTruncated?'التفاصيل تعرض آخر 300 مكالمة؛ التصدير يسحب اليوم كاملًا قبل تطبيق الفلاتر.':'كل المكالمات المسجلة لهذا اليوم ظاهرة حسب الفلاتر.';
 $('attendanceCoverage').textContent=daily?.detailsTruncated?'التفاصيل تعرض آخر 500 حدث؛ التصدير يسحب السجل كاملًا.':'كل أحداث اليوم متاحة حسب الفلاتر.';
 renderContext();
}
function renderLive(){
 const fresh=Date.now()-lastLiveFetch<15000,people=(daily?.presence||[]).filter(matches),now=Date.now()+offset;
 cards('liveCards',[['في مكالمة',fresh?people.filter(p=>p.state==='on_call').length:'غير مؤكد'],['في بريك',fresh?people.filter(p=>p.state==='break').length:'غير مؤكد'],['خروج موثق',fresh?people.filter(p=>p.state==='offline').length:'غير مؤكد'],['لم يبدأ جلسة بالنظام',fresh?people.filter(p=>p.state==='no_session').length:'غير مؤكد'],['غير مؤكد',people.filter(p=>!fresh||p.state==='unknown').length]]);
 $('liveRows').innerHTML=people.map(p=>{const e=staff.find(e=>e.id===p.employeeId),confirmed=fresh&&(['offline','no_session'].includes(p.state)||now-Date.parse(p.evidenceAt||0)<90000),state=confirmed?p.state:'unknown',duration=confirmed&&['on_call','break'].includes(state)&&p.startedAt?fmt((now-Date.parse(p.startedAt))/1000):'غير معروف';return '<tr>'+[e?.name||p.employeeId,p.extension,stateLabel(state),p.phone||'—',p.queue?requestType(p.queue):'—',at(p.startedAt)].map(v=>'<td>'+esc(v)+'</td>').join('')+'<td><span class="clock">'+esc(duration)+'</span></td><td>'+esc(at(p.evidenceAt))+'</td></tr>'}).join('')||'<tr><td colspan="8">لا يوجد موظفون مطابقون للفلاتر؛ أضف موظفين من قسم الموظفون والإضافة</td></tr>';
 const live=historical?.live,stale=!fresh||!live||Date.now()-Date.parse(live.observedAt)>30000;
 $('queueLiveNote').textContent=live?(stale?'لقطة قديمة — لا تعتبر لايف':'لقطة حديثة')+' — '+at(live.observedAt):'لم تصل بيانات نوع الطلب؛ فعّل موصل الإدارة في الإضافة.';
 table('queueLiveRows',(live?.records||[]).filter(r=>!$('queueFilter').value||r[0]===$('queueFilter').value).map(r=>row([requestType(r[0]),r[2],r[9],r[8],r[10]])),5);
}
function renderHistory(){
 const h=historical?.report;
 $('historyCoverage').textContent=h?'تاريخ السجل '+h.date+' — آخر سحب '+at(h.importedAt)+' — '+(h.verifiedTotal?'عدد الصفوف مطابق لإجمالي المصدر حتى وقت السحب':'ملف مستورد؛ اكتمال اليوم غير مثبت'):'لا يوجد سجل أرابيكس محفوظ لهذا التاريخ.';
 const qs=queuesFiltered(),perc=v=>v==null?'غير متاح':Number(v).toFixed(2)+'%';
 cards('historyCards',h?[['مكالمات محتسبة',h.calls],['تم الرد',h.answered],['فائتة محتسبة',h.abandoned],['≤7ث للتوضيح',h.shortAbandoned],['متوسط انتظار الرد (ASA)',fmt(h.asa)],['الرد خلال 10 ثوانٍ (SLA)',perc(h.sla)],['نسبة المكالمات الفائتة',perc(h.abandonmentRate)],['خارج ساعات العمل',h.afterHours]]:[]);
 table('queueRows',qs.map(q=>row([q.label,q.calls,q.answered,q.abandoned,fmt(q.asa),perc(q.sla),perc(q.abandonmentRate)])),7);
 $('missedRows').innerHTML=missedFiltered().map(c=>'<tr>'+[c.queueLabel,c.end||((c.start||'غير معروف')+' — بداية السجل؛ النهاية غير مسجلة'),c.phone,fmt(c.waitSeconds),missedLabel(c.classification)].map(v=>'<td>'+esc(v)+'</td>').join('')+'<td><button data-missed="'+c.index+'" class="secondary">من لم يكن متاحًا؟</button></td></tr>').join('')||'<tr><td colspan="6">لا توجد فائتة مطابقة لهذا اليوم</td></tr>';
}
function renderContext(){
 if(!context)return;
 const list=contextFiltered();
 cards('contextCounts',[['بريك',list.filter(e=>e.state==='break').length],['في مكالمة',list.filter(e=>e.state==='on_call').length],['خروج موثق',list.filter(e=>e.state==='offline').length],['غير معروف / غير مؤكد',list.filter(e=>['unknown','uncertain'].includes(e.state)).length]]);
 table('contextRows',list.sort((a,b)=>Number(unavailable(b))-Number(unavailable(a))).map(e=>row([e.name+' — '+e.code,stateLabel(e.state),e.extension||'—',reasonLabel(e.reason),at(e.evidenceAt)],unavailable(e)?'unavailable':'')),5);
}
async function showContext(index){
 const reportId=historical?.report?.id;if(!reportId)return;
 $('contextPanel').hidden=false;$('contextNote').textContent='جارٍ مراجعة سجل الحالات…';context=null;table('contextRows',[],5);
 try{const d=await api('/api/history?reportId='+reportId+'&missedIndex='+index);if(historical?.report?.id!==reportId)return;context=d.context;contextCall=d.call;
 $('contextTitle').textContent=d.call.date+' — '+(d.call.end||d.call.start||'وقت غير معروف')+' — '+d.call.phone;
 $('contextNote').textContent=(d.context.timeReference==='record_start'?'الحالات عند بداية السجل؛ نهاية الانتظار غير مسجلة. ':'')+(d.context.timeWindow?.precision==='minute'?'التوقيت بالدقيقة؛ تغير الحالة داخلها يظهر غير مؤكد. ':'')+'توضيح عدم التوفر فقط؛ لا يثبت أن المكالمة رنّت على موظف أو أنه رفضها.';
 renderContext();$('contextPanel').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){$('contextNote').textContent='تعذر تحديد الحالات: '+e.message}
}
function renderRoster(){ $('rosterRows').innerHTML=staff.filter(e=>!$('employeeFilter').value||e.id===Number($('employeeFilter').value)).map(e=>'<tr>'+[e.name,e.employeeCode,e.active?'نشط':'محذوف من الدخول'].map(v=>'<td>'+esc(v)+'</td>').join('')+'<td><button class="secondary" data-employee="'+e.id+'">'+(e.active?'حذف مع حفظ السجل':'استعادة')+'</button></td></tr>').join('')}
async function changeEmployee(id){const e=staff.find(e=>e.id===id);if(!e)return;if(e.active&&!confirm('حذف الموظف من تسجيل الدخول وإنهاء جلساته؟ السجل سيظل محفوظًا.'))return;try{await api('/api/employees',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,active:!e.active})});await refresh(true);$('employeeMessage').textContent='تم حفظ التغيير'}catch(err){$('employeeMessage').textContent=err.message}}
async function addEmployee(){
 const name=$('empName').value.trim(),employeeCode=$('empCode').value.trim(),pin=$('empPin').value;
 if(!name||!employeeCode||!/^\d{4,8}$/.test(pin)){$('employeeMessage').textContent='اكتب الاسم والكود وPIN من 4 إلى 8 أرقام';return}
 try{const records=(await api('/api/employees')).employees,old=records.find(e=>e.employeeCode===employeeCode);
 if(old&&(old.name!==name||old.active))throw Error('الكود موجود باسم '+old.name+(old.active?' والموظف نشط بالفعل':'؛ استخدم نفس الاسم لاستعادته'));
 await api('/api/employees',{method:old?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(old?{id:old.id,active:true,pin}:{name,employeeCode,pin})});
 $('empName').value=$('empCode').value=$('empPin').value='';await refresh(true);$('employeeMessage').textContent=old?'تمت الاستعادة وتحديث PIN':'تمت إضافة الموظف؛ سيظهر في تحديث قائمة الإضافة';
 }catch(e){$('employeeMessage').textContent=e.message}
}
function csv(name,head,rows){const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};const url=URL.createObjectURL(new Blob(['\uFEFF'+[head,...rows].map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name+'-'+(['live-snapshot','queue-live'].includes(name)?today():$('day').value)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const contextHeaders=['تاريخ المكالمة','وقت المصدر','الهاتف','نوع الطلب','الموظف','الكود','الحالة','غير متاح بدليل','الاكستنشن','السبب','آخر دليل','مرجع التوقيت'];
function contextLines(call,c){return contextFiltered(c.employees).map(e=>[call.date,call.end||call.start,call.phone,requestType(call.queue),e.name,e.code,stateLabel(e.state),unavailable(e)?'نعم':'غير مثبت',e.extension,reasonLabel(e.reason),e.evidenceAt,c.timeReference])}
async function exportData(kind,button){
 button.disabled=true;$('message').textContent='جارٍ تجهيز شيت كامل حسب التاريخ والفلاتر…';const date=$('day').value,reportId=historical?.report?.id;
 try{
 if(['calls','attendance'].includes(kind)){const d=await api(dashboardQuery(date)+'&all=1');if(date!==$('day').value)throw Error('تغير التاريخ؛ أعد التصدير');if(kind==='calls')csv('calls',['الموظف','الاكستنشن','النوع','الهاتف','الحالة','بداية المكالمة','وقت آخر حدث','المدة بالثواني'],callsFiltered(d.calls).map(e=>[e.agentName,e.extension,e.callType,e.phone,e.eventType,e.startedAt,e.occurredAt,e.durationSeconds]));else csv('attendance',['الموظف','الاكستنشن','الحدث','الحالة / السبب','الوقت','المدة بالثواني'],eventsFiltered(d.timeline).map(e=>[e.agentName,e.extension,eventLabel(e.eventType),reasonLabel(e.state),e.occurredAt,e.eventType==='break_end_unknown'?'غير معروف':e.eventType==='break_end'?e.durationSeconds:'']));}
 else if(kind==='employees')csv('employee-kpis',['الموظف','الكود','مكالمات','وارد','صادر','مكتملة','متوسط المدة بالثواني','أول دخول','آخر خروج','البريك المكتمل بالثواني','بريكات ناقصة'],metricsFiltered().map(p=>[staff.find(e=>e.id===p.employeeId)?.name||p.employee,staff.find(e=>e.id===p.employeeId)?.employeeCode,p.calls,p.inbound,p.outbound,p.answered,p.avgHandleTime,p.firstLogin,p.lastLogout,p.breakSeconds,p.unknownBreaks]));
 else if(kind==='roster')csv('employees',['الاسم','الكود','الحالة'],staff.filter(e=>!$('employeeFilter').value||e.id===Number($('employeeFilter').value)).map(e=>[e.name,e.employeeCode,e.active?'نشط':'محذوف']));
 else if(kind==='live')csv('live-snapshot',['وقت السحب','الموظف','الاكستنشن','الحالة','الهاتف','نوع الطلب','بداية الحالة','مدة الحالة','آخر دليل'],(daily?.presence||[]).filter(matches).map(p=>[new Date().toISOString(),staff.find(e=>e.id===p.employeeId)?.name,p.extension,Date.now()-lastLiveFetch<15000?stateLabel(p.state):'لقطة قديمة',p.phone,requestType(p.queue),p.startedAt,Date.now()-lastLiveFetch<15000&&p.state!=='unknown'&&p.startedAt?fmt((Date.now()+offset-Date.parse(p.startedAt))/1000):'غير معروف',p.evidenceAt]));
 else if(kind==='queueLive')csv('queue-live',['وقت اللقطة','نوع الطلب','حساب أرابيكس','الهاتف','الانتظار','الحالة'],(historical?.live?.records||[]).filter(r=>!$('queueFilter').value||r[0]===$('queueFilter').value).map(r=>[historical.live.observedAt,requestType(r[0]),r[2],r[9],r[8],r[10]]));
 else if(kind==='queue')csv('queue-kpis',['رقم القائمة في أرابيكس','نوع الطلب','مكالمات','تم الرد','فائتة محتسبة','متوسط انتظار الرد بالثواني (ASA)','الرد خلال 10 ثوانٍ % (SLA)','نسبة المكالمات الفائتة %'],queuesFiltered().map(q=>[q.queue,q.label,q.calls,q.answered,q.abandoned,q.asa,q.sla,q.abandonmentRate]));
 else if(kind==='missed')csv('missed',['نوع الطلب','التاريخ','التوقيت','الهاتف','الانتظار بالثواني','التصنيف'],missedFiltered().map(c=>[requestType(c.queue),c.date,c.end||c.start,c.phone,c.waitSeconds,missedLabel(c.classification)]));
 else if(kind==='context'){if(!context)throw Error('اختر المكالمة أولًا');csv('missed-staff',contextHeaders,contextLines(contextCall,context));}
 else if(kind==='contexts'){if(!reportId)throw Error('لا يوجد سجل لهذا اليوم');const d=await api('/api/history?reportId='+reportId+'&contexts=1');if(reportId!==historical?.report?.id)throw Error('تغير السجل؛ أعد التصدير');const indices=new Set(missedFiltered().map(c=>c.index));csv('all-missed-staff',contextHeaders,d.contexts.filter(x=>indices.has(x.index)).flatMap(x=>contextLines(x.call,x.context)));}
 else if(kind==='history'){if(!reportId)throw Error('لا يوجد سجل لهذا اليوم');const d=await api('/api/history?reportId='+reportId+'&all=1');if(date!==$('day').value)throw Error('تغير التاريخ');csv('arabicss-history',['نوع الطلب','حساب أرابيكس','التاريخ','البداية','النهاية','المدة','الانتظار','الهاتف','الحالة'],d.records.filter(c=>!$('queueFilter').value||c.queue===$('queueFilter').value).map(c=>[requestType(c.queue),c.accountName,c.date,c.start,c.end,c.durationSeconds,c.waitSeconds,c.phone,c.status]));}
 $('message').textContent='تم تجهيز الشيت. CSV يفتح في Excel؛ النصوص والأرقام المفقودة لا تُستبدل بصفر.';
 }catch(e){$('message').textContent='لم يتم التصدير: '+e.message}finally{button.disabled=false}
}
async function login(){ $('loginError').textContent='';$('loginButton').disabled=true;try{const r=await fetch(API+'/api/dashboard',{headers:{'x-admin-password':$('password').value},cache:'no-store'});if(!r.ok)throw Error(r.status===401?'كلمة مرور الإدارة غير صحيحة':'تعذر الاتصال');sessionStorage.setItem('adminPassword',$('password').value);$('password').value='';$('login').hidden=true;$('dashboard').hidden=false;await refresh(true)}catch(e){$('loginError').textContent=e.message}finally{$('loginButton').disabled=false}}
$('day').value=today();$('day').max=today();
$('loginButton').onclick=login;$('password').onkeydown=e=>{if(e.key==='Enter')login()};
$('logoutButton').onclick=()=>{generation++;sessionStorage.removeItem('adminPassword');$('dashboard').hidden=true;$('login').hidden=false;clearDay()};
$('tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)};
$('day').onchange=()=>{generation++;clearDay();refresh(true)};
$('todayButton').onclick=()=>{$('day').value=today();clearDay();refresh(true)};
$('refreshButton').onclick=()=>refresh(true);
for(const id of ['callSearch','callType','callStatus','eventFilter','contextFilter'])$(id).addEventListener('input',()=>{renderDaily();renderLive()});
let filterTimer;for(const id of ['employeeFilter','extensionFilter'])$(id).addEventListener('input',()=>{generation++;clearDay();clearTimeout(filterTimer);filterTimer=setTimeout(()=>refresh(true),350)});
for(const id of ['queueFilter','missedFilter'])$(id).addEventListener('change',()=>{renderHistory();renderLive()});
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.filterShortcut){document.querySelector('.filters').scrollIntoView({block:'start'});requestAnimationFrame(()=>{const picker=$('employeeFilter-button');if(picker){picker.focus();picker.click()}else $('employeeFilter').focus()});return}if(button.dataset.export)exportData(button.dataset.export,button);if(button.dataset.missed!==undefined)showContext(Number(button.dataset.missed));if(button.dataset.employee)changeEmployee(Number(button.dataset.employee))});
$('addEmployeeButton').onclick=addEmployee;
$('importButton').onclick=async()=>{const file=$('historyFile').files[0];if(!file){$('message').textContent='اختر ملف Excel أولًا';return}if(file.size>2000000){$('message').textContent='صدّر يومًا واحدًا بحجم أقل من 2MB';return}try{const d=await api('/api/history',{method:'POST',headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file});$('day').value=d.date;clearDay();await refresh(true);$('message').textContent=d.duplicate?'السجل محفوظ بالفعل؛ لم يتكرر':'تم حفظ سجل هذا اليوم'}catch(e){$('message').textContent='لم يُحفظ السجل: '+e.message}};
setInterval(renderLive,1000);
setInterval(()=>{if(sessionStorage.getItem('adminPassword'))refresh()},5000);
if(sessionStorage.getItem('adminPassword')){$('login').hidden=true;$('dashboard').hidden=false;refresh(true)}