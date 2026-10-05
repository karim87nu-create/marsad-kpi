/* Marsad admin hotfix 3.7.1 — compact accordion navigation */
(()=>{
'use strict';
const nav=document.querySelector('.experience-nav');
if(!nav||nav.dataset.accordionReady==='371')return;
nav.dataset.accordionReady='371';
const style=document.createElement('style');
style.textContent='.experience-hub-button[aria-expanded="true"] .experience-hub-chevron{transform:rotate(180deg)}.experience-hub-chevron{transition:transform .16s ease}.experience-pages[hidden]{display:none!important}.experience-hub:not(.active)>.experience-hub-button[aria-expanded="true"]{background:#10283b;color:#e4f0f8}';
document.head.appendChild(style);
function closeAll(except=''){
 for(const hub of nav.querySelectorAll('.experience-hub')){
  const pages=hub.querySelector('.experience-pages'),button=hub.querySelector('.experience-hub-button');
  const open=hub.dataset.hub===except;
  if(pages)pages.hidden=!open;
  if(button)button.setAttribute('aria-expanded',String(open));
 }
}
function currentHub(){
 const selected=nav.querySelector('.experience-page-button.selected');
 return selected?.closest('.experience-hub')?.dataset.hub||'';
}
for(const hub of nav.querySelectorAll('.experience-hub')){
 const button=hub.querySelector('.experience-hub-button'),pages=hub.querySelector('.experience-pages');
 if(!button||!pages)continue;
 button.setAttribute('aria-expanded',String(!pages.hidden));
 button.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  const willOpen=pages.hidden;
  closeAll(willOpen?hub.dataset.hub:'');
 };
}
function syncToView(){const id=currentHub();if(id)closeAll(id)}
window.addEventListener('marsad-experience-view',syncToView);
requestAnimationFrame(syncToView);
})();
