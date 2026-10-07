/* Administration workspace 3.7.2: existing data and actions, task-based layout only. */
(()=>{'use strict';
const $=id=>document.getElementById(id),dashboard=$('dashboard'),tabs=$('tabs'),M=window.MarsadAdminViewModel;if(!dashboard||!tabs||!M)return;
const groups=[
{id:'now',label:'الآن',icon:'●',views:['live'],title:'الآن'},
{id:'action',label:'محتاج تدخل',icon:'!',views:['intervention'],title:'محتاج تدخل'},
{id:'day',label:'أداء اليوم',icon:'↗',views:['queue','analysis'],title:'أداء اليوم'},
{id:'people',label:'الموظفون',icon:'◎',views:['metrics','profile','attendance','shifts'],title:'الموظفون'},
{id:'calls',label:'المكالمات',icon:'☎',views:['calls','missed','unattributed','customers'],title:'المكالمات'},
{id:'follow',label:'المتابعة',icon:'✓',views:['followup','reports'],title:'المتابعة'},
{id:'alerts',label:'التنبيهات',icon:'◉',views:['messages','telegram','alertLog'],title:'التنبيهات'},
{id:'manage',label:'الإدارة',icon:'⚙',views:['settings','adminUsers','audit','health','guide'],title:'الإدارة'}];
const pageNames={live:'حالة الموظفين والعملاء الآن',intervention:'الحالات المحتاجة قرار',queue:'ملخص يوم التشغيل',analysis:'الضغط والتغطية والمقارنة',metrics:'أداء الفريق',profile:'ملف الموظف',attendance:'الحضور والبريك',shifts:'الشيفتات',calls:'السجل',missed:'حالة التشغيل وقت المكالمات الفائتة',unattributed:'غير المنسوبة',customers:'اتصالات العملاء',followup:'المشاكل المفتوحة وتسليم الشيفت',reports:'التقارير المحفوظة',messages:'رسائل الموظفين',telegram:'Telegram',alertLog:'سجل التنبيهات وحالة الإرسال',settings:'موظفو التشغيل',adminUsers:'مستخدمو صفحة الإدارة',audit:'سجل تغييرات الإدارة',health:'النظام والأجهزة',guide:'طريقة الحساب'};
function moveTopic(from,title,to){const section=$(from),head=[...section.children].find(n=>n.tagName==='H3'&&n.textContent===title);if(!head)return;let n=head;while(n){const next=n.nextElementSibling;$(to).appendChild(n);if(!next||next.tagName==='H3')break;n=next;}}
moveTopic('calls','مكالمات لم يُحدد موظفها','unattributed');moveTopic('calls','اتصالات العملاء خلال اليوم','customers');
moveTopic('attendance','اتصال الموظفين بأرابيكس','health');moveTopic('settings','إضافة Firefox الموقّعة — تحديثات مركزية','health');
moveTopic('health','سجل تغييرات الإدارة','audit');moveTopic('followup','تقرير محفوظ كما كان وقت استخراجه','reports');
moveTopic('shifts','تبديل الموظف على نفس التحويلة','followup');
// Current state must stay under Now; attendance is scoped to the selected day.
const currentStaffDetails=$('liveStaffDetails')?.closest('details');if(currentStaffDetails){currentStaffDetails.querySelector('summary').textContent='تفاصيل حالة الموظفين الآن والبريك المتبقي';$('live').appendChild(currentStaffDetails);}
const live=$('live'),overview=$('overviewDayCards');
if(overview){const head=overview.previousElementSibling;if(head?.classList.contains('section-head'))$('queue').prepend(head);$('queue').prepend(overview);if($('overviewDayNote'))$('queue').prepend($('overviewDayNote'));}
const placeholder=[...live.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='المتاح — طلبات والموقع');if(placeholder)$('health').appendChild(placeholder);
const logHead=[...$('telegram').children].find(n=>n.tagName==='H3'&&n.textContent.startsWith('سجل التنبيهات'));
for(const n of [logHead,$('tgLoadAlerts'),$('tgExportAlerts'),$('tgAlertsNote'),$('tgAlertRows')?.closest('.tablewrap')])if(n)$('alertLog').appendChild(n);
if($('attentionDetails'))$('intervention').appendChild($('attentionDetails'));$('attentionDetails')?.classList.add('existing-incident-actions');
for(const id of ['liveServiceCards'])$(id)?.classList.add('secondary-live-information');
const liveStateLabel=$('liveStateFilter')?.closest('label');
const sidebar=document.createElement('aside');sidebar.className='dashboard-sidebar';sidebar.id='workspaceSidebar';
const content=document.createElement('div');content.className='dashboard-content';
dashboard.append(sidebar,content);
const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='sidebar-backdrop';backdrop.setAttribute('aria-label','إغلاق القائمة');dashboard.before(backdrop);
sidebar.innerHTML='<div class="sidebar-brand"><div class="brand-mark">م</div><div class="brand-copy"><strong>مرصد الأداء</strong><span>إدارة المكالمات والموظفين</span></div></div>';
const nav=document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','أقسام الإدارة');sidebar.appendChild(nav);
const leaves=[...tabs.querySelectorAll('[data-tab]')];tabs.replaceChildren();nav.appendChild(tabs);
function expandGroup(id){for(const g of groups){const b=nav.querySelector('[data-workspace="'+g.id+'"]'),sub=$('submenu-'+g.id);b?.setAttribute('aria-expanded',String(g.id===id));if(sub)sub.hidden=g.id!==id;}}
for(const g of groups){const wrap=document.createElement('div');wrap.className='workspace-group';const button=document.createElement('button');button.type='button';button.dataset.workspace=g.id;button.innerHTML='<span class="nav-icon">'+g.icon+'</span><span>'+g.label+'</span>';const sub=document.createElement('div');sub.id='submenu-'+g.id;sub.className='workspace-submenu';sub.hidden=true;
 for(const view of g.views){const leaf=leaves.find(n=>n.dataset.tab===view)||document.createElement('button');leaf.type='button';leaf.dataset.tab=view;leaf.textContent=pageNames[view];sub.appendChild(leaf);}
 if(g.views.length===1){button.dataset.tab=g.views[0];sub.hidden=true;sub.classList.add('single-page-leaf');}else{button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',sub.id);button.onclick=()=>expandGroup(button.getAttribute('aria-expanded')==='true'?'':g.id);}
 wrap.append(button,sub);tabs.appendChild(wrap);}
const footer=document.createElement('div');footer.className='sidebar-footer';if($('logoutButton'))footer.appendChild($('logoutButton'));sidebar.appendChild(footer);
const top=document.createElement('div');top.className='dashboard-topline';top.innerHTML='<div class="workspace-heading"><nav id="adminBreadcrumb" aria-label="مكانك في الإدارة"></nav><h2 id="workspaceTitle">الآن</h2><p id="workspaceDescription"></p></div>';
const topActions=document.createElement('div');topActions.className='topline-actions';top.appendChild(topActions);
const menu=document.createElement('button');menu.type='button';menu.className='secondary mobile-sidebar-toggle';menu.textContent='القائمة';menu.setAttribute('aria-controls',sidebar.id);menu.onclick=()=>document.body.classList.contains('sidebar-open')?closeSidebar():openSidebar();topActions.appendChild(menu);
const exportMenu=document.createElement('details');exportMenu.id='pageExport';exportMenu.className='page-export';exportMenu.innerHTML='<summary>تصدير</summary><div id="pageExportOptions"></div>';topActions.appendChild(exportMenu);
if($('syncStatus'))topActions.appendChild($('syncStatus'));content.appendChild(top);
const search=document.createElement('div');search.className='employee-global-search';search.innerHTML='<label for="adminEmployeeSearch">ابحث عن موظف بالاسم أو الكود</label><input id="adminEmployeeSearch" type="search" autocomplete="off" placeholder="اسم الموظف أو الكود"><div id="adminEmployeeResults" role="list" hidden></div><span id="adminEmployeeChoice"></span><button id="clearEmployeeChoice" type="button" class="secondary">إلغاء اختيار الموظف</button>';content.appendChild(search);
const filters=dashboard.querySelector('.filters'),fields=document.createElement('div');fields.className='filter-fields';
const filterNodes={date:$('day').closest('label'),employee:$('employeeFilter').closest('label'),queue:$('queueFilter').closest('label'),extension:$('extensionFilter').closest('details'),state:liveStateLabel};filterNodes.extension.open=true;filterNodes.extension.querySelector('summary').hidden=true;
for(const n of Object.values(filterNodes))if(n)fields.appendChild(n);
const dateActions=filters.querySelector('.date-actions'),actions=document.createElement('div');actions.className='filter-actions';if(dateActions)actions.appendChild(dateActions);for(const id of ['resetFiltersButton','refreshButton'])actions.appendChild($(id));
const scopeBanner=document.createElement('p');scopeBanner.id='adminScopeBanner';scopeBanner.setAttribute('role','status');
filters.classList.add('admin-topbar');filters.prepend(fields);filters.append(actions,scopeBanner);content.appendChild(filters);
for(const id of ['filterSummary','periodNote','filterNote'])$(id).classList.add('legacy-filter-note');
if($('message'))content.appendChild($('message'));if($('operationsLoad')){content.appendChild($('operationsLoad'));$('operationsLoad').classList.add('operations-strip');}
const toolbar=dashboard.querySelector('.ops-toolbar');const prefs=document.createElement('details');prefs.className='display-preferences';prefs.innerHTML='<summary>خيارات العرض</summary>';prefs.appendChild(toolbar);content.appendChild(prefs);
for(const section of [...dashboard.querySelectorAll(':scope > .view')])content.appendChild(section);dashboard.classList.add('dashboard-shell');dashboard.append(sidebar,content);
function syncSidebar(){const open=document.body.classList.contains('sidebar-open');sidebar.inert=innerWidth<=820&&!open;backdrop.inert=!open;menu.setAttribute('aria-expanded',String(open));}
function openSidebar(){document.body.classList.add('sidebar-open');syncSidebar()}function closeSidebar(){document.body.classList.remove('sidebar-open');syncSidebar()}backdrop.onclick=closeSidebar;window.addEventListener('resize',()=>{if(innerWidth>820)closeSidebar();else syncSidebar()});syncSidebar();
const subLabel=document.createElement('span');subLabel.hidden=true;
const state={day:$('day').value,employee:$('employeeFilter').value,extension:$('extensionFilter').value,queue:$('queueFilter').value};
let current='live',switching=false,operations=null;
const dateText=d=>new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',timeZone:'Africa/Cairo'}).format(new Date(d+'T12:00:00Z'));
function remember(view){const policy=M.filterPolicy(view);if(policy.includes('date'))state.day=$('day').value;if(policy.includes('employee'))state.employee=$('employeeFilter').value;if(policy.includes('extension'))state.extension=$('extensionFilter').value;if(policy.includes('queue'))state.queue=$('queueFilter').value;}
function breadcrumb(){const group=groups.find(g=>g.views.includes(current)),emp=staff.find(e=>String(e.id)===state.employee);$('adminBreadcrumb').textContent=[group?.label,pageNames[current],current==='profile'&&emp?emp.name:''].filter(Boolean).filter((x,i,a)=>!i||x!==a[i-1]).join(' > ');$('adminEmployeeChoice').textContent=emp?'الموظف المختار: '+emp.name+' — '+emp.employeeCode:'لم يتم اختيار موظف';}
function scope(view){document.body.classList.toggle('dashboard-active',!dashboard.hidden);const p=M.filterPolicy(view);switching=true;$('day').value=p.includes('date')?state.day:today();$('employeeFilter').value=p.includes('employee')?state.employee:'';$('extensionFilter').value=p.includes('extension')?state.extension:'';$('queueFilter').value=p.includes('queue')?state.queue:'';
 for(const [key,node]of Object.entries(filterNodes))if(node)node.hidden=!p.includes(key);dateActions.hidden=!p.includes('date');$('resetFiltersButton').hidden=p.length===0;filters.classList.toggle('no-operation-filters',p.length===0);fields.hidden=p.length===0;scopeBanner.hidden=p.length===0;
 scopeBanner.className=['live','intervention'].includes(view)?'scope-live':'scope-day';scopeBanner.textContent=['live','intervention'].includes(view)?'الآن — حالة التشغيل الحالية، وليست نتيجة اليوم':'يوم التشغيل: '+dateText($('day').value)+' — من 9:00 ص حتى 3:00 ص اليوم التالي';
 if(p.includes('date'))scopeBanner.title='يظل سجل 3:00 ص إلى قبل 9:00 ص محفوظًا مع نفس يوم البيانات، ولا يدخل في مؤشرات ساعات التشغيل.';
 $('operationsLoad').hidden=['live','intervention','settings','adminUsers','telegram'].includes(view);search.hidden=p.length===0;
 for(const id of ['employeeFilter','queueFilter','liveStateFilter']){const b=$(id+'-button');if(b)b.textContent=($(id).selectedOptions?.[0]?.textContent||'اختر')+' ▾';}
 switching=false;breadcrumb();
}
function chooseEmployee(id){state.employee=String(id);if(!M.filterPolicy(current).includes('employee')){showTab('profile');}else{$('employeeFilter').value=state.employee;$('employeeFilter').dispatchEvent(new Event('change',{bubbles:true}));$('employeeFilter').dispatchEvent(new Event('input',{bubbles:true}));}$('adminEmployeeResults').hidden=true;$('adminEmployeeSearch').value='';breadcrumb();}
$('clearEmployeeChoice').onclick=()=>chooseEmployee('');
$('adminEmployeeSearch').oninput=()=>{const q=$('adminEmployeeSearch').value.trim().normalize('NFKC').replace(/[أإآ]/g,'ا').toLocaleLowerCase('ar'),result=$('adminEmployeeResults');result.replaceChildren();result.hidden=!q;if(!q)return;for(const e of staff.filter(e=>(e.name+' '+e.employeeCode).normalize('NFKC').replace(/[أإآ]/g,'ا').toLocaleLowerCase('ar').includes(q)).slice(0,12)){const b=document.createElement('button');b.type='button';b.textContent=e.name+' — '+e.employeeCode;b.onclick=()=>chooseEmployee(e.id);result.appendChild(b);}if(!result.children.length)result.textContent='لا يوجد موظف بهذا الاسم أو الكود.';};
let exportSignature='';function exportOptions(){const box=$('pageExportOptions');const sources=[...$(current).querySelectorAll('[data-export],[data-ops-export],#tgExportAlerts,#exportMessages,[data-ui-export]')];const signature=current+'|'+sources.map(b=>(b.dataset.export||b.dataset.opsExport||b.id||b.dataset.uiExport)+b.textContent).join('|');if(signature===exportSignature)return;exportSignature=signature;box.replaceChildren();const seen=new Set();for(const source of sources){const key=source.dataset.export||source.dataset.opsExport||source.id||source.dataset.uiExport;if(seen.has(key))continue;seen.add(key);const b=document.createElement('button');b.type='button';b.textContent=source.dataset.uiExport?.startsWith('filtered-')?'الصفوف المعروضة — '+(tableTitles[source.dataset.uiExport.slice(9)]||'هذا الجدول'):source.textContent.replace(/^سحب(?: شيت)?\s*/,'').replace(/^تصدير\s*/,'');b.onclick=()=>{exportMenu.open=false;source.click()};box.appendChild(b);}
 if(!sources.length){const p=document.createElement('p');p.textContent='لا يوجد تصدير لهذا القسم.';box.appendChild(p);}exportMenu.hidden=!sources.length;}
const tableTitles={breakOverlapRows:'البريكات المتزامنة وحالة التشغيل وقتها',queueSampleRows:'رصد انتظار العملاء خلال اليوم',profileBreakRows:'بريكات الموظف',profileUnavailableRows:'عدم الإتاحة',profileOverlapRows:'تداخل الجلسات',liveRows:'حالة الموظفين الآن',waitingRows:'العملاء المنتظرون الآن',queueLiveRows:'المكالمات الجارية',metricRows:'أداء الفريق',callRows:'المكالمات المسجلة',attendanceRows:'الحضور والبريك ومدد الحالات',shiftRows:'الدخول والخروج والشيفتات',queueRows:'نتيجة كل نوع طلب',missedRows:'حالة التشغيل وقت المكالمات الفائتة',rosterRows:'موظفو التشغيل',pressureRows:'المكالمات وعدد المتاحين كل نصف ساعة',profileSessionRows:'وقت الدخول والخروج وبدء الاستقبال',profileCallRows:'مكالمات الموظف',profileStateRows:'الحالات ومددها',reviewRows:'المشاكل والمتابعات الإدارية',savedReportRows:'التقارير المحفوظة',auditRows:'سجل تغييرات الإدارة',connectionRows:'اتصال الموظفين بأرابيكس',unattributedRows:'مكالمات تحتاج تحديد الموظف',handoverRows:'تسليم التحويلة بين الموظفين',customerRows:'اتصالات العملاء',formulaRows:'المكالمات المستخدمة في الحساب',tgAlertRows:'سجل التنبيهات وحالة الإرسال',accessRows:'مستخدمو صفحة الإدارة',unavailabilityRows:'فترات عدم الإتاحة',extensionUsageRows:'مدة العمل على كل تحويلة',extensionUsageAllRows:'مدد الفريق على التحويلات',extensionSessionRows:'كل جلسة على التحويلات'};
for(const h of live.querySelectorAll('h3,summary')){if(h.textContent==='كل المكالمات في أرابيكس — المنتظرة والجارية')h.textContent='المكالمات الجارية الآن';if(h.textContent==='محتاج تدخل — بالدليل والحالة')h.textContent='قرار سريع';}
const secondaryTables=new Set(['attributionRows','formulaRows']);
function tidy(){
 for(const h of live.querySelectorAll('h3,summary'))if(h.textContent==='كل المكالمات في أرابيكس — المنتظرة والجارية')h.textContent='المكالمات الجارية الآن';
 for(const section of content.querySelectorAll('.view')){if(section.hidden)continue;

 for(const wrap of section.querySelectorAll('.tablewrap')){const id=wrap.querySelector('tbody')?.id;if(!wrap.closest('details')&&!wrap.closest('#contextPanel')){const d=document.createElement('details');d.className='page-disclosure';const s=document.createElement('summary');const prev=wrap.previousElementSibling;s.textContent=tableTitles[id]||prev?.textContent||'عرض القائمة';if(prev?.tagName==='H3')prev.remove();wrap.before(d);d.append(s,wrap);}if(secondaryTables.has(id)||wrap.closest('details')&&!wrap.closest('details').open)continue;if(!wrap.dataset.sectionTitle){wrap.dataset.sectionTitle='1';const prev=wrap.previousElementSibling;if(prev?.tagName!=='H3'&&prev?.tagName!=='H2'&&prev?.tagName!=='SUMMARY'){const h=document.createElement('h3');h.textContent=tableTitles[id]||section.querySelector('h2')?.textContent||'البيانات';wrap.before(h);}}const ths=[...wrap.querySelectorAll('thead th')];for(const tr of wrap.querySelectorAll('tbody tr'))for(const [i,td]of [...tr.children].entries()){if(tr.children.length===1&&tr.firstElementChild.colSpan>1&&/لا توجد بيانات مطابقة|لا توجد بيانات/.test(tr.textContent)){const text='لا توجد '+(id==='missedRows'?'مكالمات فائتة مطابقة':id==='waitingRows'?'سجلات انتظار حالية':id==='queueLiveRows'?'مكالمات جارية الآن':(tableTitles[id]||'سجلات')+' مطابقة للفلاتر');if(tr.firstElementChild.textContent!==text)tr.firstElementChild.textContent=text;}const label=ths[i]?.textContent.replace(/فلتر/g,'').trim()||'';if(td.dataset.label!==label)td.dataset.label=label;}}
 for(const b of section.querySelectorAll('[data-export],[data-ops-export],#tgExportAlerts,#exportMessages,[data-ui-export]'))b.classList.add('ui-export-source');
 for(const cards of section.querySelectorAll('.cards'))if(cards.id!=='liveCards'){cards.classList.add('summary-facts');if(!cards.closest('details')&&cards.children.length>6){const d=document.createElement('details');d.className='page-disclosure';const s=document.createElement('summary');s.textContent='ملخص اليوم والأرقام';cards.before(d);d.append(s,cards);}}
 }
 for(const b of content.querySelectorAll('[data-delete],[data-remove],[data-pin],[data-employee],[data-active],[data-edit],#savePinButton,#tgNewPair,#tgGroupRemove'))b.classList.add('danger-action');
 const timeline=$('profileWorkTimeline');if(timeline&&!timeline.closest('details')){const d=document.createElement('details');d.className='page-disclosure';const s=document.createElement('summary');s.textContent='تسلسل شغل الموظف';timeline.before(d);d.append(s,timeline);}
 exportOptions();
}
document.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS'&&e.target.open)tidy();},true);
let tidyQueued=false;new MutationObserver(()=>{if(tidyQueued)return;tidyQueued=true;requestAnimationFrame(()=>{tidyQueued=false;tidy();})}).observe(content,{childList:true,subtree:true});
const baseShow=showTab;showTab=function(view){if(!groups.some(g=>g.views.includes(view)))return;if($('employeeFilter').value)state.employee=$('employeeFilter').value;remember(current);const oldKey=[$('day').value,$('employeeFilter').value,$('extensionFilter').value,$('queueFilter').value].join('|');current=view;scope(view);const newKey=[$('day').value,$('employeeFilter').value,$('extensionFilter').value,$('queueFilter').value].join('|');if(oldKey!==newKey){generation++;clearDay();operations=null;}baseShow(view);
 const g=groups.find(g=>g.views.includes(view));expandGroup(g.id);for(const b of nav.querySelectorAll('[data-workspace]'))b.classList.toggle('selected',b.dataset.workspace===g.id);for(const b of nav.querySelectorAll('[data-tab]'))b.setAttribute('aria-current',b.dataset.tab===view?'page':'false');$('workspaceTitle').textContent=g.title;$('workspaceDescription').textContent=pageNames[view];closeSidebar();tidy();if(oldKey!==newKey||!daily||daily.liveOnly&&view!=='live')refresh(true);
 if(view==='alertLog')$('tgLoadAlerts').click();renderDecision();
};
const baseRefresh=refresh;refresh=function(force){if(!switching)remember(current);return baseRefresh(force);};
for(const id of ['day','employeeFilter','extensionFilter','queueFilter'])$(id).addEventListener('change',()=>{if(!switching){remember(current);scope(current);}});
const age=stamp=>Date.now()+offset-Date.parse(stamp||'');
function snapshot(){const fresh=Date.now()-lastLiveFetch<15000,queueFresh=fresh&&!!historical?.live&&age(historical.live.observedAt)<30000,people=livePeople().map(p=>({...p,displayState:liveState(p)})),records=historical?.live?.records||[];
 const currentOps=operations?.date===$('day').value&&operations.profileExtension===($('extensionFilter').value||'')&&(operations.queueFilter||'')===($('queueFilter').value||'')?operations:null;
 return{fresh,queueFresh,presence:people,records,staff,now:Date.now()+offset,operations:currentOps};}
function renderDecision(){if(!['live','intervention'].includes(current))return;const snap=snapshot(),items=M.interventions(snap).filter(item=>current!=='live'||item.key!=='unattributed');const count=s=>snap.fresh?snap.presence.filter(p=>p.displayState===s).length:'غير متاح';const waiting=snap.records.filter(r=>/^on wait$|^waiting$/i.test(String(r[10]).trim()));
 cards('liveCards',[['المتاحين',count('ready')],['في مكالمة',count('on_call')],['في بريك',count('break')],['انقطاع رصد',snap.presence.filter(p=>p.displayState==='unknown').length],['عملاء منتظرين',snap.queueFresh?waiting.length:'غير متاح'],['يحتاج تدخل',items.length]]);
 $('attentionNow').textContent=items.length?'يوجد '+items.length+' حالة تحتاج مراجعة — افتح «محتاج تدخل».':'لا توجد حالات تشغيلية تحتاج تدخل في البيانات الحديثة.';
 $('attentionNow').onclick=()=>showTab('intervention');
 const actionIds=new Set(items.filter(x=>x.employeeId&&x.priority!==2).map(x=>Number(x.employeeId))),root=$('employeeLiveGroups');
 const ordered=[['action','يحتاج تدخل'],['unknown','انقطاع رصد'],['break','في بريك'],['on_call','في مكالمة'],['ready','متاح'],['logged_in','دخل ولم يبدأ الاستقبال'],['offline','خروج مسجل'],['no_session','لم يسجل'],['shift_ended','خلص الشيفت']];
 if(root)window.MarsadLiveGroups.render(root,ordered.map(([key,label])=>{const list=snap.presence.filter(p=>key==='action'?actionIds.has(Number(p.employeeId)):!actionIds.has(Number(p.employeeId))&&p.displayState===key);if(!list.length)return {key,label,html:''};const tiles=list.map(p=>'<article class="employee-tile"><strong>'+esc(staff.find(e=>Number(e.id)===Number(p.employeeId))?.name||'اسم الموظف غير متاح')+'</strong>'+(['on_call','break'].includes(p.displayState)&&p.startedAt?'<time class="clock">'+esc(fmt(Math.max(0,(snap.now-Date.parse(p.startedAt))/1000)))+'</time>':'')+'</article>').join('');return {key,label:label+' — '+list.length,html:tiles};}));

 $('interventionScope').textContent='الحالات مرتبة حسب الأولوية — الآن'+(snap.operations?'':'؛ جارٍ تحميل المشاكل المفتوحة ومراجعة المكالمات.');
 $('interventionList').innerHTML=items.map(x=>'<article class="intervention-item priority-'+x.priority+'"><span class="priority-badge">'+(x.priority<=1?'عاجل':x.priority===2?'اتصال':'مراجعة')+'</span><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.detail)+'</p></div><button class="secondary" data-decision-view="'+x.view+'"'+(x.employeeId?' data-decision-employee="'+x.employeeId+'"':'')+'>فتح التفاصيل</button></article>').join('')||'<p class="empty-state">لا توجد حالات تحتاج تدخل في البيانات التي اكتمل تحميلها.</p>';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-decision-view]');if(!b)return;if(b.dataset.decisionEmployee){state.employee=b.dataset.decisionEmployee;$('employeeFilter').value=state.employee;}showTab(b.dataset.decisionView);});
window.addEventListener('marsad-operations-data',e=>{operations=e.detail;renderDecision();});
window.addEventListener('kpi-admin-refresh',()=>{breadcrumb();scope(current);renderDecision();tidy();});
const oldLive=renderLive;renderLive=function(){if(!['live','intervention'].includes(current))return;oldLive(true);if(current==='live'){const ongoing=(historical?.live?.records||[]).filter(r=>/^live call$/i.test(String(r[10]).trim()));table('queueLiveRows',ongoing.map(r=>row([requestType(r[0]),r[2],r[9],r[8],'مكالمة جارية'])),5);}renderDecision();};
window.MarsadAdminUI={$,dashboard,tabs,groups,nav,topActions,subLabel,showHome:()=>showTab('live'),showBase:view=>showTab(view),getOperations:()=>operations};
tidy();showTab('live');
})();
