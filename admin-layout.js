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

 for(const section of [...dashboard.querySelectorAll(':scope > .view')])content.appendChild(section);
 dashboard.append(sidebar,content);

 function openSidebar(){document.body.classList.add('sidebar-open');menu.setAttribute('aria-expanded','true')}
 function closeSidebar(){document.body.classList.remove('sidebar-open');menu.setAttribute('aria-expanded','false')}
 backdrop.addEventListener('click',closeSidebar);window.addEventListener('resize',()=>{if(innerWidth>820)closeSidebar()});

 for(const section of document.querySelectorAll('.view')){
  for(const p of [...section.children].filter(e=>e.tagName==='P'&&e.classList.contains('muted')&&!e.id&&e.textContent.trim().length>165)){
   if(p.closest('details'))continue;
   const d=document.createElement('details');d.className='help-detail';const s=document.createElement('summary');s.textContent='طريقة الحساب والتوضيح';p.before(d);d.append(s,p);
  }
 }
 const liveDetails=$('attentionDetails');if(liveDetails&&!liveDetails.closest('details')){const d=document.createElement('details');d.className='detail-panel';const s=document.createElement('summary');s.textContent='تفاصيل التنبيهات والإجراءات';liveDetails.before(d);d.append(s,liveDetails)}
 const firstLiveDetails=document.querySelector('#live .detail-panel[open]');if(firstLiveDetails)firstLiveDetails.open=false;

 for(const cards of document.querySelectorAll('.cards')){
  if(cards.dataset.compactReady==='1')continue;cards.dataset.compactReady='1';cards.classList.add('summary-cards');
  const b=document.createElement('button');b.type='button';b.className='secondary indicators-toggle';b.hidden=true;b.textContent='باقي المؤشرات';cards.after(b);
  const syncVisibility=()=>{b.hidden=cards.children.length<=6};new MutationObserver(syncVisibility).observe(cards,{childList:true});syncVisibility();
  b.addEventListener('click',()=>{const expanded=cards.classList.toggle('expanded');b.textContent=expanded?'اختصار المؤشرات':'باقي المؤشرات';b.setAttribute('aria-expanded',String(expanded))});
 }

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

 const expandedEmployeeGroups=new Set();
 function compactEmployeeGroups(){
  const root=$('employeeLiveGroups');if(!root)return;
  for(const group of root.querySelectorAll('.employee-group')){
   if(group.dataset.compactApplied==='1')continue;
   group.dataset.compactApplied='1';
   const tiles=group.querySelector('.employee-tiles'),items=tiles?[...tiles.querySelectorAll('.employee-tile')]:[];
   const state=[...group.classList].find(c=>c.startsWith('state-'))?.slice(6)||'';
   const shouldCollapse=['shift_ended','no_session'].includes(state)||items.length>8;
   if(!shouldCollapse)continue;
   group.classList.add('employee-group-collapsible');
   const h=group.querySelector('h4');if(!h)continue;
   const b=document.createElement('button');b.type='button';b.className='secondary employee-group-toggle';
   const sync=()=>{const open=expandedEmployeeGroups.has(state);group.classList.toggle('employee-group-open',open);b.textContent=open?'إخفاء القائمة':'عرض القائمة';b.setAttribute('aria-expanded',String(open))};
   b.addEventListener('click',()=>{expandedEmployeeGroups.has(state)?expandedEmployeeGroups.delete(state):expandedEmployeeGroups.add(state);sync()});h.appendChild(b);sync();
  }
 }
 const employeeGroups=$('employeeLiveGroups');if(employeeGroups){new MutationObserver(compactEmployeeGroups).observe(employeeGroups,{childList:true,subtree:true});compactEmployeeGroups()}

 const employeesById=()=>new Map((typeof staff!=='undefined'?staff:[]).map(e=>[Number(e.id),e]));
 const employeeFilterValue=()=>Number($('employeeFilter')?.value||0),extensionFilterValue=()=>String($('extensionFilter')?.value||'').trim();
 const inCurrentScope=r=>(!employeeFilterValue()||Number(r.employeeId)===employeeFilterValue())&&(!extensionFilterValue()||String(r.extension||'')===extensionFilterValue());
 const safeSeconds=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
 const minIso=(a,b)=>!a?b:!b?a:(Date.parse(a)<=Date.parse(b)?a:b),maxIso=(a,b)=>!a?b:!b?a:(Date.parse(a)>=Date.parse(b)?a:b);

 function ensureDerivedPanels(){
  const attendance=$('attendance');
  if(attendance&&!$('unavailabilityPanel')){
   const d=document.createElement('details');d.id='unavailabilityPanel';d.className='detail-panel management-derived';d.open=false;
   d.innerHTML='<summary>وقت عدم الإتاحة / انقطاع الرصد</summary><p class="muted">يعرض فقط الفترات التي سجلها النظام كـ «انقطاع رصد». خروج المتصفح أو السيستم احتمال من ضمن الأسباب، لكنه لا يُنسب للموظف كسبب مؤكد بدون دليل إضافي.</p><div id="unavailabilityCards" class="cards"></div><div class="tablewrap"><table><thead><tr><th>الموظف</th><th>التحويلة</th><th>وقت عدم الإتاحة المرصود</th><th>عدد الفترات</th><th>أول انقطاع</th><th>آخر رصد</th></tr></thead><tbody id="unavailabilityRows"></tbody></table></div>';
   const coverage=$('attendanceCoverage');(coverage||attendance.firstElementChild)?.insertAdjacentElement('afterend',d);
  }
  const profile=$('profile');
  if(profile&&!$('extensionUsagePanel')){
   const d=document.createElement('details');d.id='extensionUsagePanel';d.className='detail-panel management-derived';d.open=true;
   d.innerHTML='<summary>مدة العمل على كل تحويلة</summary><p class="muted">المدة من جلسات العمل الموثقة في يوم التشغيل، مجمعة لكل موظف وتحويلة. هي مدة الجلسة على التحويلة وليست وقت المكالمات فقط.</p><div id="extensionUsageCards" class="cards"></div><div class="tablewrap"><table><thead><tr><th>الموظف</th><th>التحويلة</th><th>إجمالي المدة</th><th>عدد الجلسات</th><th>أول دخول</th><th>آخر رصد/خروج</th></tr></thead><tbody id="extensionUsageRows"></tbody></table></div>';
   const cards=profile.querySelector('#profileCards');(cards||profile.firstElementChild)?.insertAdjacentElement('afterend',d);
  }
  const metrics=$('metrics');
  if(metrics&&!$('extensionUsageAllPanel')){
   const d=document.createElement('details');d.id='extensionUsageAllPanel';d.className='detail-panel management-derived';d.open=false;
   d.innerHTML='<summary>كل الموظفين × التحويلات</summary><div id="extensionUsageAllCards" class="cards"></div><div class="tablewrap"><table><thead><tr><th>الموظف</th><th>التحويلة</th><th>إجمالي المدة</th><th>عدد الجلسات</th></tr></thead><tbody id="extensionUsageAllRows"></tbody></table></div>';
   const cards=metrics.querySelector('#metricCards');(cards||metrics.firstElementChild)?.insertAdjacentElement('afterend',d);
  }
 }

 function renderUnavailability(){
  ensureDerivedPanels();const body=$('unavailabilityRows'),cardBox=$('unavailabilityCards');if(!body||!cardBox)return;
  const states=(typeof daily!=='undefined'&&daily?.attendance?.states)||[],people=employeesById(),groups=new Map();
  for(const s of states){if(s.state!=='unknown'||!inCurrentScope(s))continue;const key=Number(s.employeeId)+'|'+String(s.extension||'—'),g=groups.get(key)||{employeeId:Number(s.employeeId),extension:s.extension||'—',seconds:0,count:0,first:null,last:null};g.seconds+=safeSeconds(s.durationSeconds);g.count++;g.first=minIso(g.first,s.startedAt);g.last=maxIso(g.last,s.endedAt||s.evidenceUntil||s.startedAt);groups.set(key,g)}
  const rows=[...groups.values()].sort((a,b)=>b.seconds-a.seconds),total=rows.reduce((n,r)=>n+r.seconds,0),affected=new Set(rows.map(r=>r.employeeId)).size;
  cardBox.innerHTML=[['إجمالي عدم الإتاحة المرصود',typeof fmt==='function'?fmt(total):total+' ث'],['موظفون لديهم انقطاع',affected],['فترات الانقطاع',rows.reduce((n,r)=>n+r.count,0)]].map(([k,v])=>'<div class="card"><span class="card-label">'+String(k)+'</span><span>'+String(v)+'</span></div>').join('');
  body.innerHTML=rows.map(r=>'<tr><td>'+String(people.get(r.employeeId)?.name||'اسم غير متاح')+'</td><td>'+String(r.extension)+'</td><td>'+(typeof fmt==='function'?fmt(r.seconds):r.seconds)+'</td><td>'+r.count+'</td><td>'+(typeof at==='function'?at(r.first):r.first||'—')+'</td><td>'+(typeof at==='function'?at(r.last):r.last||'—')+'</td></tr>').join('')||'<tr><td colspan="6">لا توجد فترات انقطاع رصد في الفلاتر الحالية.</td></tr>';
 }

 function extensionUsageRows(){
  const sessions=(typeof daily!=='undefined'&&daily?.attendance?.sessions)||[],people=employeesById(),groups=new Map();
  for(const s of sessions){if(!inCurrentScope(s))continue;const ext=String(s.extension||'—'),key=Number(s.employeeId)+'|'+ext,g=groups.get(key)||{employeeId:Number(s.employeeId),extension:ext,seconds:0,count:0,first:null,last:null};g.seconds+=safeSeconds(s.daySeconds??s.durationSeconds);g.count++;g.first=minIso(g.first,s.workStartedAt||s.issuedAt||s.startedAt);g.last=maxIso(g.last,s.endedAt||s.observedThrough||s.lastSeen||s.workStartedAt||s.issuedAt);groups.set(key,g)}
  return [...groups.values()].map(r=>({...r,name:people.get(r.employeeId)?.name||'اسم غير متاح'})).sort((a,b)=>a.name.localeCompare(b.name,'ar')||b.seconds-a.seconds);
 }
 function renderExtensionUsage(){
  ensureDerivedPanels();const rows=extensionUsageRows(),filteredEmployee=employeeFilterValue();
  const profileRows=filteredEmployee?rows.filter(r=>r.employeeId===filteredEmployee):rows;
  const render=(bodyId,cardsId,list,full=true)=>{const body=$(bodyId),cardBox=$(cardsId);if(!body||!cardBox)return;const total=list.reduce((n,r)=>n+r.seconds,0),exts=new Set(list.map(r=>r.extension)).size;cardBox.innerHTML=[['إجمالي الجلسات على التحويلات',typeof fmt==='function'?fmt(total):total+' ث'],['عدد التحويلات المستخدمة',exts]].map(([k,v])=>'<div class="card"><span class="card-label">'+String(k)+'</span><span>'+String(v)+'</span></div>').join('');body.innerHTML=list.map(r=>'<tr><td>'+r.name+'</td><td>'+r.extension+'</td><td>'+(typeof fmt==='function'?fmt(r.seconds):r.seconds)+'</td><td>'+r.count+'</td>'+(full?'<td>'+(typeof at==='function'?at(r.first):r.first||'—')+'</td><td>'+(typeof at==='function'?at(r.last):r.last||'—')+'</td>':'')+'</tr>').join('')||'<tr><td colspan="'+(full?6:4)+'">لا توجد جلسات مطابقة للفلاتر الحالية.</td></tr>'};
  render('extensionUsageRows','extensionUsageCards',profileRows,true);render('extensionUsageAllRows','extensionUsageAllCards',rows,false);
 }
 function currentUnavailabilityTotal(){return ((typeof daily!=='undefined'&&daily?.attendance?.states)||[]).filter(s=>s.state==='unknown'&&inCurrentScope(s)).reduce((n,s)=>n+safeSeconds(s.durationSeconds),0)}
 function syncLiveUnavailabilityCard(){const box=$('liveCards');if(!box)return;if(box.querySelector('[data-derived-unavailability]'))return;const c=document.createElement('div');c.className='card';c.dataset.derivedUnavailability='1';c.innerHTML='عدم الإتاحة المرصود<span>'+((typeof fmt==='function')?fmt(currentUnavailabilityTotal()):currentUnavailabilityTotal()+' ث')+'</span>';box.appendChild(c)}
 const liveCardsBox=$('liveCards');if(liveCardsBox)new MutationObserver(syncLiveUnavailabilityCard).observe(liveCardsBox,{childList:true});
 function renderDerivedAdminMetrics(){try{renderUnavailability();renderExtensionUsage();syncLiveUnavailabilityCard()}catch(e){console.warn('Derived admin metrics skipped',e)}}
 ensureDerivedPanels();window.addEventListener('kpi-admin-refresh',renderDerivedAdminMetrics);for(const id of ['employeeFilter','extensionFilter','day'])$(id)?.addEventListener('change',renderDerivedAdminMetrics);renderDerivedAdminMetrics();

 const updateDashboardState=()=>document.body.classList.toggle('dashboard-active',!dashboard.hidden);
 new MutationObserver(updateDashboardState).observe(dashboard,{attributes:true,attributeFilter:['hidden']});updateDashboardState();

 showTab(document.querySelector('#tabs button.selected')?.dataset.tab||'live');
})();
