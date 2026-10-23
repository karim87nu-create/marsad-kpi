(()=>{
 'use strict';
 // Break approvals are isolated from the asynchronous admin layout loader.
 const section=document.getElementById('intervention');if(!section)return;
 const panel=document.createElement('details');panel.id='adminBreakRequests';panel.className='detail-panel break-approval-panel';
 panel.innerHTML='<summary>طلبات البريك — موافقة أو رفض</summary><p>الطلب لا يوقف استقبال المكالمات قبل موافقة المشرف.</p><button type="button" data-refresh>تحديث الطلبات</button><p data-note role="status" aria-live="polite">جارٍ تحميل طلبات البريك عند فتح هذا القسم.</p><div class="tablewrap"><table><thead><tr><th>الموظف</th><th>التحويلة</th><th>النوع والمدة المطلوبة</th><th>وقت الطلب</th><th>الحالة</th><th>القرار</th></tr></thead><tbody></tbody></table></div>';
 section.prepend(panel);
 let busy=false,last=0,token='',canDecide=false;const priorPending=new Set();
 const names={pending:'ينتظر الموافقة',approved:'تمت الموافقة',rejected:'مرفوض',starting:'سُمح ببدء البريك',expired:'انتهت الصلاحية',cancelled:'انتهت الجلسة',interrupted:'انقطاع رصد أثناء انتظار الموافقة — ليس بريكًا معتمدًا'};
 async function load(force=false){
  const current=sessionStorage.getItem('adminPassword');if(!current||busy||!force&&Date.now()-last<8000)return;
  busy=true;last=Date.now();
  try{
   const d=await api('/api/break-requests');if(current!==sessionStorage.getItem('adminPassword'))return;
   token=current;canDecide=!!d.canDecide;const requests=d.requests||[],pending=requests.filter(r=>r.status==='pending'),pendingIds=new Set(pending.map(r=>String(r.id)));
   if(pending.length&&(!priorPending.size||pending.some(r=>!priorPending.has(String(r.id)))))panel.open=true;
   priorPending.clear();pendingIds.forEach(id=>priorPending.add(id));
   const body=panel.querySelector('tbody');body.replaceChildren();
   for(const r of requests){
    const tr=document.createElement('tr'),kind=r.requestKind==='prayer'?'صلاة':r.requestKind==='additional'?'إضافي بعد استهلاك الرصيد':r.requestKind==='regular'?'عادي':'استثنائي';
    for(const value of [r.employee,r.extension,r.reason+' — '+kind+' — '+r.requestedMinutes+' دقيقة',new Date(r.createdAt).toLocaleTimeString('ar-EG',{timeZone:'Africa/Cairo'}),names[r.status]||r.status]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}
    const actions=document.createElement('td');
    if(canDecide&&r.status==='pending')for(const [action,label]of [['approve','موافقة'],['reject','رفض']]){const b=document.createElement('button');b.type='button';b.textContent=label;if(action==='reject')b.className='danger';b.onclick=async()=>{b.disabled=true;try{await api('/api/break-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,id:r.id})});last=0;await load(true)}catch(e){panel.querySelector('[data-note]').textContent=e.message;b.disabled=false}};actions.appendChild(b)}
    else actions.textContent=r.status==='pending'?'حساب مشاهدة فقط — لا يملك صلاحية القرار':r.decidedBy||'—';
    tr.appendChild(actions);body.appendChild(tr);
   }
   panel.querySelector('[data-note]').textContent=pending.length&&!canDecide?'توجد طلبات معلقة، لكن هذا الحساب للعرض فقط. استخدم حساب مدير أو مشرف للموافقة.':requests.length?'':'لا توجد طلبات بريك حديثة.';
   panel.querySelector('summary').textContent='طلبات البريك — '+pending.length+(pending.length?' طلب ينتظر الموافقة':' لا توجد طلبات معلقة');
   badge(pending.length);
  }catch(e){panel.querySelector('[data-note]').textContent='تعذر تحميل طلبات البريك: '+(e.message||'تحقق من الاتصال وصلاحية الدخول')}
  finally{busy=false}
 }
 // Pending requests are announced on every page (menu badge and tab title), not only inside «محتاج تدخل»,
 // so a supervisor watching another page still sees them within 10 seconds.
 const baseTitle=document.title;
 function badge(count){
  document.title=(count?'('+count+') ':'')+baseTitle;
  const target=document.querySelector('[data-workspace="action"]')||document.querySelector('[data-tab="intervention"]');if(!target)return;
  let b=target.querySelector('.break-request-badge');
  if(!count){b?.remove();return}
  if(!b){b=document.createElement('span');b.className='break-request-badge';b.style.cssText='margin-inline-start:6px;padding:1px 8px;border-radius:999px;background:#f59e0b;color:#111;font-weight:700;font-size:13px';target.appendChild(b)}
  b.textContent=count+' بريك';b.title=count+' طلب بريك ينتظر الموافقة';
 }
 panel.querySelector('[data-refresh]').onclick=()=>load(true);panel.addEventListener('toggle',()=>{if(panel.open)load(true)});
 const visibility=new MutationObserver(()=>{if(!section.hidden)load(true)});visibility.observe(section,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('kpi-admin-refresh',()=>{if(token!==sessionStorage.getItem('adminPassword')){token='';last=0;priorPending.clear();panel.querySelector('tbody').replaceChildren()}if(!section.hidden||panel.open)load(true)});
 setInterval(()=>{if(sessionStorage.getItem('adminPassword'))load()},10000);if(!section.hidden)load(true);
})();
