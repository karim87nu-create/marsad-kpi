/* Marsad Admin Redesign 4.0 — UI shell only; existing data, IDs and business logic stay untouched. */
(()=>{
  'use strict';
  const VERSION='4.0.0';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  const META={
    live:{title:'المتابعة المباشرة',desc:'الحالة الحالية للموظفين والانتظار وأهم ما يحتاج تدخلًا الآن.'},
    metrics:{title:'أداء الموظفين',desc:'مؤشرات الأداء اليومية للموظفين حسب البيانات المحملة والفلاتر الحالية.'},
    calls:{title:'سجل المكالمات',desc:'تفاصيل المكالمات والربط بالموظفين مع إمكانية التصفية والتصدير.'},
    attendance:{title:'الحضور والبريك',desc:'الحضور والبريك ومدد الحالات المرصودة خلال يوم التشغيل.'},
    shifts:{title:'الشيفت والرجوع للعمل',desc:'نهاية الشيفت والعودة للعمل والتغيرات التشغيلية المرتبطة بها.'},
    queue:{title:'الضغط والانتظار',desc:'ملخص حركة المكالمات والانتظار وحالة الضغط على الخدمة.'},
    missed:{title:'المكالمات الفائتة',desc:'تحليل الفائت مع حالة الموظفين والأدلة المتاحة دون افتراض الرنين.'},
    settings:{title:'إدارة الموظفين',desc:'بيانات الموظفين والربط التشغيلي والإعدادات الإدارية الموجودة حاليًا.'},
    analysis:{title:'تحليل اليوم',desc:'حركة المكالمات والمتاحين على مدار يوم التشغيل ومقارنة الفترات.'},
    profile:{title:'ملف الموظف',desc:'ملف زمني مفصل للموظف: الجلسات والمكالمات ومدد الحالات.'},
    followup:{title:'المتابعات والتقارير',desc:'المشكلات المفتوحة وتسليم الشيفت والتقارير المحفوظة.'},
    health:{title:'النظام والصلاحيات',desc:'حالة الربط ومستخدمو الإدارة وسجل تغييرات الإدارة.'},
    guide:{title:'دليل الحساب',desc:'شرح قواعد الحساب ومصادر الأرقام وحدود البيانات المتاحة.'}
  };

  const GROUPS=[
    {label:'التشغيل الآن',items:[['live','المتابعة المباشرة'],['attendance','الحضور والبريك'],['missed','المكالمات الفائتة']]},
    {label:'الأداء والمكالمات',items:[['metrics','أداء الموظفين'],['calls','سجل المكالمات'],['queue','الضغط والانتظار'],['analysis','تحليل اليوم']]},
    {label:'الأفراد',items:[['profile','ملف الموظف'],['settings','إدارة الموظفين'],['shifts','الشيفت والرجوع']]},
    {label:'الإدارة',items:[['followup','المتابعات والتقارير'],['health','النظام والصلاحيات'],['guide','دليل الحساب']]}
  ];

  function originalButton(tab){return $(`#tabs [data-tab="${tab}"]`)}
  function selectedTab(){
    const selected=$('#tabs [data-tab].selected');
    if(selected) return selected.dataset.tab;
    const visible=$$('section.view').find(s=>!s.hidden);
    return visible?.id || 'live';
  }
  function go(tab){
    const b=originalButton(tab);
    if(!b)return;
    b.click();
    closeSidebar();
    setTimeout(syncActive,0);
  }

  function buildSidebar(){
    if($('#mrSidebar'))return;
    const aside=document.createElement('aside');
    aside.id='mrSidebar';aside.className='mr-sidebar';aside.setAttribute('aria-label','تنقل الإدارة');
    aside.innerHTML=`
      <button class="mr-sidebar-close" type="button" aria-label="إغلاق القائمة">×</button>
      <div class="mr-brand"><div class="mr-brand-mark">م</div><div><strong>مرصد الأداء</strong><small>لوحة الإدارة</small></div></div>
      <nav class="mr-nav" id="mrNav"></nav>
      <div class="mr-sidebar-footer">واجهة الإدارة ${VERSION}<br>إعادة تنظيم للعرض فقط — البيانات الحالية كما هي.</div>`;
    const nav=$('#mrNav',aside);
    GROUPS.forEach(g=>{
      const box=document.createElement('div');box.className='mr-nav-group';
      const label=document.createElement('div');label.className='mr-nav-label';label.textContent=g.label;box.appendChild(label);
      g.items.forEach(([tab,text])=>{
        if(!originalButton(tab))return;
        const b=document.createElement('button');b.type='button';b.dataset.mrTab=tab;
        b.innerHTML=`<span class="mr-nav-dot" aria-hidden="true"></span><span>${text}</span>`;
        b.addEventListener('click',()=>go(tab));box.appendChild(b);
      });
      nav.appendChild(box);
    });
    document.body.appendChild(aside);
    const backdrop=document.createElement('div');backdrop.className='mr-sidebar-backdrop';backdrop.id='mrSidebarBackdrop';backdrop.addEventListener('click',closeSidebar);document.body.appendChild(backdrop);
    $('.mr-sidebar-close',aside)?.addEventListener('click',closeSidebar);
  }

  function buildPagebar(){
    const dash=$('#dashboard');if(!dash||$('#mrPagebar'))return;
    const bar=document.createElement('div');bar.id='mrPagebar';bar.className='mr-pagebar';
    bar.innerHTML=`
      <div class="mr-page-title-wrap">
        <p class="mr-eyebrow">لوحة التحكم</p>
        <h2 class="mr-page-title" id="mrPageTitle">المتابعة المباشرة</h2>
        <p class="mr-page-desc" id="mrPageDesc"></p>
      </div>
      <div class="mr-page-actions">
        <button type="button" class="secondary mr-mobile-menu" id="mrMenuButton" aria-label="فتح القائمة">☰</button>
        <button type="button" class="secondary" id="mrFiltersButton">الفلاتر</button>
        <button type="button" class="secondary" id="mrTodayButton">اليوم</button>
        <button type="button" id="mrRefreshButton">تحديث</button>
        <span class="mr-sync-slot" id="mrSyncSlot"></span>
      </div>`;
    dash.insertBefore(bar,dash.firstChild);
    const sync=$('#syncStatus');if(sync)$('#mrSyncSlot')?.appendChild(sync);
    $('#mrMenuButton')?.addEventListener('click',()=>document.body.classList.toggle('mr-sidebar-open'));
    $('#mrRefreshButton')?.addEventListener('click',()=>$('#refreshButton')?.click());
    $('#mrTodayButton')?.addEventListener('click',()=>$('#todayButton')?.click());
    $('#mrFiltersButton')?.addEventListener('click',toggleFilters);
  }

  function buildContext(){
    const dash=$('#dashboard');if(!dash||$('#mrContextStrip'))return;
    const ctx=document.createElement('div');ctx.id='mrContextStrip';ctx.className='mr-context-strip';ctx.innerHTML=`
      <div class="mr-context-item"><small>يوم التشغيل</small><strong id="mrCtxDay">—</strong></div>
      <div class="mr-context-item"><small>الموظف</small><strong id="mrCtxEmployee">كل الموظفين</strong></div>
      <div class="mr-context-item"><small>نوع الطلب</small><strong id="mrCtxQueue">كل الأنواع</strong></div>
      <div class="mr-context-item"><small>القسم الحالي</small><strong id="mrCtxSection">المتابعة المباشرة</strong></div>`;
    const pagebar=$('#mrPagebar');pagebar?.insertAdjacentElement('afterend',ctx);
    ['day','employeeFilter','queueFilter','extensionFilter'].forEach(id=>$('#'+id)?.addEventListener('change',syncContext));
    ['employeeFilter','queueFilter'].forEach(id=>$('#'+id)?.addEventListener('input',syncContext));
  }

  function selectedText(el,fallback){
    if(!el)return fallback;
    if(el.tagName==='SELECT')return el.options[el.selectedIndex]?.textContent?.trim()||fallback;
    return el.value?.trim()||fallback;
  }
  function syncContext(){
    const day=$('#day');const emp=$('#employeeFilter');const queue=$('#queueFilter');const tab=selectedTab();
    const d=day?.value?new Intl.DateTimeFormat('ar-EG',{year:'numeric',month:'short',day:'numeric'}).format(new Date(day.value+'T12:00:00')):'—';
    if($('#mrCtxDay'))$('#mrCtxDay').textContent=d;
    if($('#mrCtxEmployee'))$('#mrCtxEmployee').textContent=selectedText(emp,'كل الموظفين');
    if($('#mrCtxQueue'))$('#mrCtxQueue').textContent=selectedText(queue,'كل الأنواع');
    if($('#mrCtxSection'))$('#mrCtxSection').textContent=META[tab]?.title||tab;
  }

  function syncActive(){
    const tab=selectedTab();const meta=META[tab]||{title:'لوحة الإدارة',desc:''};
    $$('.mr-nav [data-mr-tab]').forEach(b=>b.classList.toggle('is-active',b.dataset.mrTab===tab));
    if($('#mrPageTitle'))$('#mrPageTitle').textContent=meta.title;
    if($('#mrPageDesc'))$('#mrPageDesc').textContent=meta.desc;
    syncContext();
    document.body.dataset.mrSection=tab;
  }

  function toggleFilters(){
    const f=$('.filters.panel');if(!f)return;
    f.classList.toggle('mr-filters-collapsed');
    const hidden=f.classList.contains('mr-filters-collapsed');
    const b=$('#mrFiltersButton');if(b)b.textContent=hidden?'إظهار الفلاتر':'الفلاتر';
  }
  function openSidebar(){document.body.classList.add('mr-sidebar-open')}
  function closeSidebar(){document.body.classList.remove('mr-sidebar-open')}

  function watchAuth(){
    const dash=$('#dashboard');if(!dash)return;
    const apply=()=>{
      const logged=!dash.hidden;
      document.body.classList.toggle('marsad-authenticated',logged);
      if(logged){syncActive();syncContext()}else closeSidebar();
    };
    apply();new MutationObserver(apply).observe(dash,{attributes:true,attributeFilter:['hidden']});
  }

  function watchTabs(){
    const tabs=$('#tabs');if(!tabs)return;
    tabs.addEventListener('click',()=>setTimeout(syncActive,0));
    new MutationObserver(()=>syncActive()).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
    $$('section.view').forEach(s=>new MutationObserver(()=>{if(!s.hidden)syncActive()}).observe(s,{attributes:true,attributeFilter:['hidden']}));
  }

  function improveSemantics(){
    // Keep all existing nodes/IDs. Only add presentation hints.
    const filters=$('.filters.panel');if(filters)filters.setAttribute('aria-label','فلاتر يوم التشغيل');
    $$('.tablewrap').forEach(w=>w.setAttribute('tabindex','0'));
    $$('section.view').forEach(s=>{if(!s.getAttribute('aria-label')){const h=$('h2',s);if(h)s.setAttribute('aria-label',h.textContent.trim())}});
  }

  function boot(){
    if(document.body.classList.contains('marsad-redesign'))return;
    document.body.classList.add('marsad-redesign');
    buildSidebar();buildPagebar();buildContext();improveSemantics();watchAuth();watchTabs();syncActive();syncContext();
    window.addEventListener('resize',()=>{if(innerWidth>820)closeSidebar()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
