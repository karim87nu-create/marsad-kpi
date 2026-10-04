/* Progressive navigation: retain all existing controls and data handlers. */
(()=>{
 const groups=[['now','الآن',['live']],['day','نتائج اليوم',['queue','metrics','calls','analysis']],['people','الموظفون',['attendance','shifts','profile']],['action','المتابعة',['missed','followup']],['manage','الإعدادات',['settings','health','guide']]];
 const tabs=document.getElementById('tabs'),nav=document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','القائمة الرئيسية');
 for(const [id,label,views] of groups){const b=document.createElement('button');b.textContent=label;b.dataset.workspace=id;b.onclick=()=>showTab(views[0]);nav.append(b)}tabs.before(nav);
 const dashboard=document.getElementById('dashboard');dashboard.classList.add('sidebar-workspace');
 const sidebar=document.createElement('aside');sidebar.className='workspace-sidebar';sidebar.id='workspaceSidebar';dashboard.prepend(sidebar);sidebar.append(document.querySelector('#dashboard > .filters'),nav,tabs);
 const menu=document.createElement('button');menu.className='secondary sidebar-toggle';menu.textContent='القائمة';menu.setAttribute('aria-controls',sidebar.id);menu.setAttribute('aria-expanded','false');nav.before(document.createElement('span'));dashboard.before(menu);
 const closeMenu=()=>{dashboard.classList.remove('sidebar-open');menu.setAttribute('aria-expanded','false')};menu.onclick=()=>{const open=dashboard.classList.toggle('sidebar-open');menu.setAttribute('aria-expanded',String(open))};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();menu.focus()}});
 new MutationObserver(()=>{menu.hidden=dashboard.hidden;if(dashboard.hidden)closeMenu()}).observe(dashboard,{attributes:true,attributeFilter:['hidden']});menu.hidden=dashboard.hidden;
 const original=showTab;showTab=function(view){const group=groups.find(g=>g[2].includes(view))||groups[0];for(const b of nav.querySelectorAll('button')){const selected=b.dataset.workspace===group[0];b.classList.toggle('selected',selected);b.setAttribute('aria-current',selected?'page':'false')}for(const b of tabs.querySelectorAll('button'))b.hidden=false;tabs.hidden=false;nav.hidden=true;original(view);closeMenu();};
 const toolbar=document.querySelector('.ops-toolbar'),prefs=document.createElement('details');prefs.className='display-preferences';const summary=document.createElement('summary');summary.textContent='خيارات العرض وحفظ الفلاتر';prefs.append(summary);toolbar.before(prefs);prefs.append(toolbar);sidebar.insertBefore(prefs,nav);
 const details=document.querySelector('#live .detail-panel');if(details)details.open=false;
 const incidents=document.getElementById('attentionDetails');if(incidents){const d=document.createElement('details');d.className='detail-panel';const s=document.createElement('summary');s.textContent='تفاصيل التنبيهات والإجراءات';d.append(s);incidents.before(d);d.append(incidents)}
 for(const section of document.querySelectorAll('.view'))for(const p of [...section.children].filter(e=>e.tagName==='P'&&e.classList.contains('muted')&&!e.id&&e.textContent.length>170)){const d=document.createElement('details');d.className='help-detail';const s=document.createElement('summary');s.textContent='طريقة الحساب والتوضيح';p.before(d);d.append(s,p)}
 // Keep the primary six indicators visible; reveal the rest on demand.
 for(const cards of document.querySelectorAll('.cards')){const b=document.createElement('button');b.className='secondary indicators-toggle';b.hidden=true;b.textContent='باقي المؤشرات';cards.after(b);cards.classList.add('summary-cards');b.onclick=()=>{const open=cards.classList.toggle('expanded');b.textContent=open?'اختصار المؤشرات':'باقي المؤشرات';b.setAttribute('aria-expanded',String(open))};new MutationObserver(()=>{b.hidden=cards.children.length<=6}).observe(cards,{childList:true});b.hidden=cards.children.length<=6;}
 showTab(document.querySelector('#tabs button.selected')?.dataset.tab||'live');
})();

