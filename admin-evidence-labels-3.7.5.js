/* Marsad admin 3.7.5 — evidence wording only; no KPI or attribution changes. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const READY_OLD=new Set(['متاح','متاح — بدون مكالمة حسب الرصد','متاح — بدون مكالمة']);
function patchMissed(){
 const section=$('missed');if(!section)return;
 let note=section.querySelector('.missed-evidence-note');
 if(!note){note=document.createElement('p');note.className='muted missed-evidence-note';note.textContent='مهم: «متاح» هنا تعني متاح حسب آخر رصد فقط. لا تثبت أن المكالمة رنّت على الموظف. دليل الرنين الفردي غير متاح من المصدر الحالي.';const head=section.querySelector('.section-head');head?.insertAdjacentElement('afterend',note);}
 const rows=$('contextRows');if(rows)for(const td of rows.querySelectorAll('td'))if(READY_OLD.has(td.textContent.trim()))td.textContent='متاح حسب آخر رصد — لم يثبت الرنين';
}
function patchLabels(root=document){
 for(const el of root.querySelectorAll?.('td,span,p,div')||[]){const t=el.textContent.trim();if(t==='بريك لم تصل بدايته أو نهايته'&&el.children.length===0)el.textContent='بريك مرصود جزئيًا — البداية أو النهاية غير مؤكدة';if(t==='observed_owner'&&el.children.length===0)el.textContent='التحويلة كانت مرتبطة بالموظف وقت المكالمة';}
 patchMissed();
}
const observer=new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)if(n.nodeType===1)patchLabels(n)});
function start(){patchLabels();const d=$('dashboard');if(d)observer.observe(d,{childList:true,subtree:true});}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
window.addEventListener('kpi-admin-refresh',()=>patchLabels());
})();
