/* Preview v2 — restructure only live, attendance and missed. Keeps IDs/events/data intact. */
(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const title=(text)=>{const h=document.createElement('h3');h.className='pv2-zone-title';const sp=document.createElement('span');sp.textContent=text;h.appendChild(sp);return h};
  const zone=(name,cls='')=>{const z=document.createElement('div');z.className=`pv2-zone ${cls}`.trim();z.appendChild(title(name));return z};
  function addQuick(section,items){if(section.querySelector('.pv2-quick'))return;const q=document.createElement('div');q.className='pv2-quick';items.forEach(([label,target])=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',()=>section.querySelector(target)?.scrollIntoView({behavior:'smooth',block:'start'}));q.appendChild(b)});const head=section.querySelector('.section-head');(head||section.firstElementChild)?.insertAdjacentElement('afterend',q)}
  function moveMany(nodes,to){nodes.filter(Boolean).forEach(n=>to.appendChild(n))}

  function restructureLive(){
    const s=$('#live'); if(!s||s.dataset.pv2)return; s.dataset.pv2='1'; s.classList.add('pv2-page');
    addQuick(s,[['الملخص','#liveCards'],['محتاج تدخل','#attentionNow'],['الموظفون','#employeeLiveGroups'],['انتظار العملاء','#waitingRows']]);
    const summary=zone('ملخص التشغيل الآن','pv2-summary');
    moveMany([$('#liveCards',s),$('#liveServiceCards',s)],summary);
    const att=zone('محتاج تدخل الآن','pv2-attention');
    moveMany([$('#attentionNow',s),$('#attentionDetails',s)],att);
    const staff=zone('الموظفون الآن');
    const staffHead=$$('.section-head',s).find(h=>h.textContent.includes('الموظفون'));
    moveMany([staffHead,$('#employeeLiveGroups',s)],staff);
    const waiting=zone('عملاء مستنيين الرد');
    const waitHead=$$('.section-head',s).find(h=>h.textContent.includes('عملاء مستنيين'));
    const waitTable=$('#waitingRows',s)?.closest('.tablewrap');
    moveMany([waitHead,$('#queueLiveNote',s),waitTable],waiting);
    const details=zone('التفاصيل والسجلات','pv2-details');
    $$('details.detail-panel',s).forEach(d=>details.appendChild(d));
    const dayHead=$$('.section-head',s).find(h=>h.textContent.includes('نتيجة يوم التشغيل'));
    moveMany([dayHead,$('#overviewDayCards',s),$('#overviewDayNote',s)],details);
    [summary,att,staff,waiting,details].forEach(z=>s.appendChild(z));
  }

  function genericRestructure(id,labels){
    const s=$(id); if(!s||s.dataset.pv2)return; s.dataset.pv2='1'; s.classList.add('pv2-page');
    const head=s.querySelector('.section-head')||s.querySelector('h2');
    const lead=[]; let n=head?.nextElementSibling; while(n&&n.matches('p.muted')){lead.push(n);n=n.nextElementSibling}
    const cards=s.querySelector('.cards');
    const summary=zone(labels.summary,'pv2-summary'); moveMany([cards,...lead],summary);
    const attention=zone(labels.attention,'pv2-attention');
    const candidates=$$('.attention,.incident-list',s); candidates.forEach(x=>attention.appendChild(x));
    const detail=zone(labels.details,'pv2-details');
    Array.from(s.children).filter(el=>el!==head&&!el.classList.contains('pv2-quick')&&el!==summary&&el!==attention&&el!==detail).forEach(el=>detail.appendChild(el));
    s.appendChild(summary); if(attention.children.length>1)s.appendChild(attention); s.appendChild(detail);
    $$('details',detail).forEach(d=>d.open=false);
  }
  function boot(){
    restructureLive();
    genericRestructure('#attendance',{summary:'ملخص الحضور والبريك',attention:'الحالات التي تحتاج تدخل',details:'تفاصيل الحضور والبريك'});
    genericRestructure('#missed',{summary:'ملخص المكالمات الفائتة',attention:'حالات تحتاج مراجعة',details:'تفاصيل الفائت والأدلة'});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
