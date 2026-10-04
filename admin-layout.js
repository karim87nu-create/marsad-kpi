/* Admin shell redesign. UI-only: existing data handlers, APIs and calculations stay untouched. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const dashboard=$('dashboard'),tabs=$('tabs');
 if(!dashboard||!tabs||dashboard.dataset.shellReady==='1')return;
 dashboard.dataset.shellReady='1';

 const groups=[
  {id:'now',label:'الآن',icon:'●',views:['live'],title:'الآن',desc:'الحالة الحالية والتنبيهات التي تحتاج تدخل'},
  {id:'day',label:'أداء اليوم',icon:'↗',views:['queue','metrics','analysis'],title:'أداء اليوم',desc:'مؤشرات الخدمة والموظفين والضغط خلال يوم التشغيل'},
  {id:'people',label:'الموظفون',icon:'◎',views:['profile','attendance','shifts'],title:'الموظفون',desc:'ملف الموظف والحضور والبريك والخروج والاستئناف'},
  {id:'calls',label:'المكالمات',icon:'☎',views:['calls','missed'],title:'المكالمات',desc:'السجل والمكالمات الفائتة وحالات الموظفين وقتها'},
  {id:'action',label:'المتابعة',icon:'✓',views:['followup'],title:'المتابعة',desc:'المشكلات المفتوحة وتسليم الشيفت والتقارير المحفوظة'},
  {id:'manage',label:'الإعدادات',icon:'⚙',views:['settings','health','guide','messages','telegram'],title:'الإعدادات',desc:'الموظفون والربط ودقة البيانات والرسائل والتنبيهات'}
 ];

 // Build a stable application shell without changing any existing element IDs.
 dashboard.classList.add('dashboard-shell');
 const sidebar=document.createElement('aside');sidebar.className='dashboard-sidebar';sidebar.id='workspaceSidebar';
 const content=document.createElement('div');content.className='dashboard-content';
 const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='sidebar-backdrop';backdrop.setAttribute('aria-label','إغلاق القائمة');
 dashboard.before(backdrop);

 const brand=document.createElement('div');brand.className='sidebar-brand';brand.innerHTML='<div class="brand-mark">م</div><div class="brand-copy"><strong>مرصد الأداء</strong><span>إدارة الكول سنتر</span></div>';
 sidebar.appendChild(brand);
 const label=document.createElement('div');label.className='sidebar-section-label';label.textContent='القائمة الرئيسية';sidebar.appendChild(label);
 const nav=document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','القائمة الرئيسية');sidebar.appendChild(nav);
 for(const g of groups){
  const b=document.createElement('button');b.type='button';b.dataset.workspace=g.id;b.innerHTML='<span class="nav-icon" aria-hidden="true">'+g.icon+'</span><span>'+g.label+'</span>';b.addEventListener('click',()=>{showTab(g.views[0]);closeSidebar()});nav.appendChild(b);
 }
 const subLabel=document.createElement('div');subLabel.className='sidebar-section-label';subLabel.textContent='داخل القسم';sidebar.appendChild(subLabel);sidebar.appendChild(tabs);
 const footer=document.createElement('div');footer.className='sidebar-footer';sidebar.appendChild(footer);
 const logout=$('logoutButton');if(logout)footer.appendChild(logout);

 const top=document.createElement('div');top.className='dashboard-topline';
 const heading=document.createElement('div');heading.className='workspace-heading';heading.innerHTML='<h2 id="workspaceTitle">الآن</h2><p id="workspaceDescription">الحالة الحالية والتنبيهات التي تحتاج تدخل</p>';
 const topActions=document.createElement('div');topActions.className='topline-actions';
 const menu=document.createElement('button');menu.type='button';menu.className='secondary mobile-sidebar-toggle';menu.textContent='القائمة';menu.setAttribute('aria-controls','workspaceSidebar');menu.setAttribute('aria-expanded','false');menu.addEventListener('click',()=>document.body.classList.contains('sidebar-open')?closeSidebar():openSidebar());topActions.appendChild(menu);
 const sync=$('syncStatus');if(sync)topActions.appendChild(sync);top.append(heading,topActions);content.appendChild(top);

 const filters=dashboard.querySelector('.filters');
 if(filters){
  filters.classList.add('admin-topbar');
  const fields=document.createElement('div');fields.className='filter-fields';
  for(const id of ['day','employeeFilter','queueFilter']){const node=$(id);const owner=node?.closest('label');if(owner)fields.appendChild(owner)}
  const advanced=filters.querySelector('.filter-advanced');if(advanced)fields.appendChild(advanced);
  const actions=document.createElement('div');actions.className='filter-actions';
  const dateActions=filters.querySelector('.date-actions');if(dateActions)actions.appendChild(dateActions);
  for(const id of ['resetFiltersButton','refreshButton']){const node=$(id);if(node)actions.appendChild(node)}
  const summaryRow=document.createElement('div');summaryRow.className='filter-summary-row';
  const filterSummary=$('filterSummary');if(filterSummary)summaryRow.appendChild(filterSummary);
  const period=$('periodNote');if(period){period.classList.add('period-note-compact');summaryRow.appendChild(period)}
  filters.prepend(fields);filters.append(actions,summaryRow);content.appendChild(filters);
 }

 const message=$('message');if(message)content.appendChild(message);
 const load=$('operationsLoad');if(load){load.classList.add('operations-strip');content.appendChild(load)}
 const toolbar=dashboard.querySelector('.ops-toolbar');
 if(toolbar){const prefs=document.createElement('details');prefs.className='display-preferences';const s=document.createElement('summary');s.textContent='خيارات العرض وحفظ الفلاتر';prefs.append(s,toolbar);content.appendChild(prefs)}

 // Move all feature views into the content surface. Dynamic sections created by other scripts are already present now.
 for(const section of [...dashboard.querySelectorAll(':scope > .view')])content.appendChild(section);
 dashboard.append(sidebar,content);

 function openSidebar(){document.body.classList.add('sidebar-open');menu.setAttribute('aria-expanded','true')}
 function closeSidebar(){document.body.classList.remove('sidebar-open');menu.setAttribute('aria-expanded','false')}
 backdrop.addEventListener('click',closeSidebar);window.addEventListener('resize',()=>{if(innerWidth>820)closeSidebar()});

 // Reduce visual noise while keeping all explanatory text available.
 for(const section of document.querySelectorAll('.view')){
  for(const p of [...section.children].filter(e=>e.tagName==='P'&&e.classList.contains('muted')&&!e.id&&e.textContent.trim().length>165)){
   if(p.closest('details'))continue;
   const d=document.createElement('details');d.className='help-detail';const s=document.createElement('summary');s.textContent='طريقة الحساب والتوضيح';p.before(d);d.append(s,p);
  }
 }
 const liveDetails=$('attentionDetails');if(liveDetails&&!liveDetails.closest('details')){const d=document.createElement('details');d.className='detail-panel';const s=document.createElement('summary');s.textContent='تفاصيل التنبيهات والإجراءات';liveDetails.before(d);d.append(s,liveDetails)}
 const firstLiveDetails=document.querySelector('#live .detail-panel[open]');if(firstLiveDetails)firstLiveDetails.open=false;

 // Keep the executive view compact; secondary KPI cards remain one click away.
 for(const cards of document.querySelectorAll('.cards')){
  if(cards.dataset.compactReady==='1')continue;cards.dataset.compactReady='1';cards.classList.add('summary-cards');
  const b=document.createElement('button');b.type='button';b.className='secondary indicators-toggle';b.hidden=true;b.textContent='باقي المؤشرات';cards.after(b);
  const syncVisibility=()=>{b.hidden=cards.children.length<=6};new MutationObserver(syncVisibility).observe(cards,{childList:true});syncVisibility();
  b.addEventListener('click',()=>{const expanded=cards.classList.toggle('expanded');b.textContent=expanded?'اختصار المؤشرات':'باقي المؤشرات';b.setAttribute('aria-expanded',String(expanded))});
 }

 // Large operational tables are available on demand instead of dominating the screen.
 const collapsible={metricRows:'تفاصيل أداء الموظفين',callRows:'سجل المكالمات بالتفصيل',attendanceRows:'تفاصيل الحضور والبريك',shiftRows:'تفاصيل الخروج واستئناف العمل',queueRows:'تفاصيل مؤشرات أنواع الطلبات',missedRows:'قائمة المكالمات الفائتة',rosterRows:'قائمة الموظفين',reviewRows:'قائمة المتابعات',connectionRows:'تفاصيل الربط بالأجهزة',unattributedRows:'المكالمات غير المنسوبة',customerRows:'تكرار اتصالات العملاء'};
 for(const [bodyId,title] of Object.entries(collapsible)){
  const body=$(bodyId),wrap=body?.closest('.tablewrap');if(!wrap||wrap.closest('details'))continue;
  const d=document.createElement('details');d.className='auto-detail';const s=document.createElement('summary');s.textContent=title;wrap.before(d);d.append(s,wrap);
 }

 const previousShowTab=showTab;
 showTab=function(view){
  const group=groups.find(g=>g.views.includes(view))||groups[0];
  for(const b of nav.querySelectorAll('[data-workspace]')){const selected=b.dataset.workspace===group.id;b.classList.toggle('selected',selected);b.setAttribute('aria-current',selected?'page':'false')}
  for(const b of tabs.querySelectorAll('[data-tab]'))b.hidden=!group.views.includes(b.dataset.tab);
  tabs.hidden=group.views.length===1;
  subLabel.hidden=group.views.length===1;
  $('workspaceTitle').textContent=group.title;$('workspaceDescription').textContent=group.desc;
  previousShowTab(view);
  closeSidebar();
 };

 // Reflect login state in the surrounding chrome without touching auth behavior.
 const updateDashboardState=()=>document.body.classList.toggle('dashboard-active',!dashboard.hidden);
 new MutationObserver(updateDashboardState).observe(dashboard,{attributes:true,attributeFilter:['hidden']});updateDashboardState();

 showTab(document.querySelector('#tabs button.selected')?.dataset.tab||'live');
})();
