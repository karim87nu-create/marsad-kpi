/* Employee detail panels use recorded sessions and states only. */
(()=>{'use strict';
const U=window.MarsadAdminUI,M=window.MarsadAdminViewModel;if(!U||!M)return;const {$}=U;let data=null,result=null;
const root=document.createElement('div');root.id='employeeWorkDetails';root.className='employee-work-details';
root.innerHTML='<h3>ملخص التحويلات والتداخل</h3><p id="profileExtensionSummary" class="summary-facts"></p><p class="muted">التغييرات من أوقات التحويلات المسجلة. التداخل يعني تداخل فترات الجلسات المسجلة، وليس إثبات استقبال مكالمتين أو خطأ من الموظف.</p><h3>البريكات</h3><div class="tablewrap"><table><thead><tr><th>التحويلة</th><th>البداية</th><th>النهاية</th><th>المدة المسجلة</th></tr></thead><tbody id="profileBreakRows"></tbody></table></div><h3>عدم الإتاحة وتوقف تحديث الحالة</h3><div class="tablewrap"><table><thead><tr><th>الحالة</th><th>التحويلة</th><th>من</th><th>إلى</th><th>المدة المسجلة</th></tr></thead><tbody id="profileUnavailableRows"></tbody></table></div><h3>تداخل الجلسات المسجل</h3><div class="tablewrap"><table><thead><tr><th>التحويلات</th><th>من</th><th>إلى</th><th>المدة</th></tr></thead><tbody id="profileOverlapRows"></tbody></table></div><h3>تسلسل الشغل خلال اليوم</h3><p class="muted">من الأوقات والحالات التي وصلت بالفعل. لا نضيف جاهزية أو خروجًا لم يسجله النظام. وقت تسجيل دخول النظام منفصل عن بدء الاستقبال.</p><ol id="profileWorkTimeline" class="work-timeline"></ol><button type="button" data-ui-export="profileTimeline">تصدير تسلسل الشغل</button>';
$('profile').appendChild(root);
const empty=(id,text,cols)=>{$(id).innerHTML='<tr><td colspan="'+cols+'">'+esc(text)+'</td></tr>'};
function render(){const id=Number($('employeeFilter').value),ext=$('extensionFilter').value;
 const valid=data&&data.date===$('day').value&&data.profileExtension===ext&&(data.queueFilter||'')===($('queueFilter').value||'');
 if(!id){root.hidden=true;result=null;return;}root.hidden=false;
 if(!valid){result=null;$('profileExtensionSummary').textContent='جارٍ تحميل ملف الموظف للفلاتر الحالية…';for(const [bid,cols]of [['profileBreakRows',4],['profileUnavailableRows',5],['profileOverlapRows',4]])empty(bid,'لم يكتمل تحميل الفترات المسجلة.',cols);$('profileWorkTimeline').innerHTML='<li>جارٍ تحميل تسلسل العمل…</li>';return;}
 result=M.profile(data,id,ext);$('profileExtensionSummary').textContent='التحويلات المستخدمة: '+result.extensions+' · تغييرات التحويلة المسجلة: '+result.changes+' · فترات تداخل الجلسات: '+result.overlaps.length;
 table('profileBreakRows',result.breaks.map(s=>row([s.extension||'—',at(s.startedAt),s.running?'بريك جارٍ':at(s.endedAt),fmt(s.durationSeconds)])),4);
 if(!result.breaks.length)empty('profileBreakRows','لا توجد بريكات مسجلة للموظف في اليوم والفلاتر المختارة.',4);
 table('profileUnavailableRows',result.unavailable.map(s=>row([M.labels[s.state]||'حالة مسجلة',s.extension||'—',at(s.startedAt),at(s.endedAt),fmt(s.durationSeconds)])),5);
 if(!result.unavailable.length)empty('profileUnavailableRows','لا توجد فترات عدم إتاحة مسجلة مطابقة.',5);
 table('profileOverlapRows',result.overlaps.map(s=>row([s.extensions,at(s.start),at(s.end),fmt(s.seconds)])),4);
 if(!result.overlaps.length)empty('profileOverlapRows','لا يوجد تداخل بين جلسات الموظف في الفترات المسجلة.',4);
 $('profileWorkTimeline').innerHTML=result.events.map(e=>'<li class="timeline-'+e.kind+'"><time>'+esc(at(e.time))+'</time><strong>'+esc(e.label)+'</strong><span>التحويلة: '+esc(e.extension)+(e.duration!=null?' · المدة المسجلة: '+esc(fmt(e.duration)):'')+'</span></li>').join('')||'<li>لا توجد أحداث عمل مسجلة مطابقة لهذا الموظف.</li>';
}
root.querySelector('[data-ui-export]').onclick=()=>{if(!result){$('message').textContent='انتظر تحميل ملف الموظف أولًا.';return}csv('employee-timeline',['الموظف','الوقت','الحالة أو العملية','التحويلة','المدة المسجلة بالثواني'],result.events.map(e=>[staff.find(s=>s.id===Number($('employeeFilter').value))?.name||'',e.time,e.label,e.extension,e.duration]));};
window.addEventListener('marsad-operations-data',e=>{data=e.detail;render()});
window.addEventListener('kpi-admin-refresh',render);
for(const id of ['employeeFilter','extensionFilter','day'])$(id).addEventListener('change',render);
const old=showTab;showTab=function(view){old(view);render();};
render();
})();
