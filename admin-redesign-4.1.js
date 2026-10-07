/* Marsad Admin 4.1 — page-level presentation decorators only. No data mutation. */
(()=>{
 'use strict';
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
 const PAGE_HINTS={
  live:'تشغيل لحظي',metrics:'مؤشرات الأداء',calls:'سجل الخدمة',attendance:'الحضور والبريك',shifts:'الشيفت',queue:'الضغط والانتظار',missed:'الفائت',settings:'الموظفون',analysis:'تحليل اليوم',profile:'ملف الموظف',followup:'المتابعات',health:'النظام والإدارة',guide:'دليل الحساب'
 };
 function decorateSection(section){
  if(!section||section.dataset.mr41==='1')return;
  section.dataset.mr41='1';section.classList.add('mr41-page',`mr41-${section.id}`);
  const hint=PAGE_HINTS[section.id];
  const head=$('.section-head',section)||$('h2',section);
  if(head&&hint){
   const tag=document.createElement('span');tag.className='mr41-section-tag';tag.textContent=hint;
   if(head.classList?.contains('section-head'))head.prepend(tag);else head.insertAdjacentElement('beforebegin',tag);
  }
  $$('h3',section).forEach((h,i)=>{h.dataset.blockIndex=String(i+1)});
  $$('.tablewrap',section).forEach(w=>w.classList.add('mr41-data-block'));
  $$('.cards',section).forEach(c=>c.classList.add('mr41-summary-grid'));
  $$('details',section).forEach(d=>d.classList.add('mr41-disclosure'));
 }
 function addStylesForTags(){
  if($('#mr41Inline'))return;
  const s=document.createElement('style');s.id='mr41Inline';s.textContent=`
   .mr41-section-tag{display:inline-flex;align-items:center;width:max-content;padding:4px 8px;border-radius:999px;background:#eaf5f8;color:#176b87;font-size:10px;font-weight:800;margin:0 0 8px}
   .section-head>.mr41-section-tag{margin-inline-end:auto;margin-bottom:0}
   .mr41-page>.mr41-data-block,.mr41-page>.mr41-summary-grid,.mr41-page>.mr41-disclosure{position:relative}
   @media(max-width:820px){.mr41-section-tag{font-size:9px;padding:3px 7px}}
  `;document.head.appendChild(s);
 }
 function boot(){addStylesForTags();$$('section.view').forEach(decorateSection);new MutationObserver(()=>$$('section.view').forEach(decorateSection)).observe(document.body,{childList:true,subtree:true})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();