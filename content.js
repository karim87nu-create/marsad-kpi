(function(){
 if(location.hostname!=='41.38.207.218'||/^\/themes\/arabicssReportsInclude(?:\/|$)/i.test(location.pathname))return;
 const API='https://marsad-kpi-live.karim87nu.chatgpt.site',TOKEN='7000865f1220458f86506b41a97cab7d',VERSION='2.4.6';
 const SESSION='arabicss_kpi_employee_session',STATE='arabicss_kpi_state',EPOCH='arabicss_kpi_runtime_epoch';
 let employee=null,sessionToken='',runtimeEpoch='',sourceConnection='unknown',sourceStateKnown=false,call=null,breakActive=false,breakStarted=null,scanTimer=null,refreshTimer=null,focusRefresh=null,flushing=false,initialized=false;
 const ext=()=>((document.querySelector('#issabel-callcenter-titulo-consola')?.textContent||'').match(/(?:IAX2|SIP)\/(\d+)/i)||[])[1]||'';
 const apiFetch=async(path,options={})=>{const r=await browser.runtime.sendMessage({type:'KPI_API',path,method:options.method||'GET',headers:options.headers||{},body:options.body});return {...r,json:()=>JSON.parse(r.body)}};
 const seconds=v=>{if(typeof v==='number')return Math.max(0,Math.round(v));const s=String(v??'').trim();if(/^\d+$/.test(s))return Number(s);return /^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(s)?s.split(':').reduce((a,n)=>a*60+Number(n),0):null};
 const canonicalId=v=>String(v||'').match(/(?:incoming-q\d+-|outgoing-)?(\d+)$/)?.[1]||String(v||'');
 const status=text=>{const el=document.getElementById('kpi-status');if(el)el.textContent=text};
 let savedFingerprint='',arabicssAuthenticated=false;
 function saveState(){const state={token:sessionToken,extension:ext()||boundExtension(),arabicssAuthenticated,call,breakActive,breakStarted};sessionStorage.setItem(STATE,JSON.stringify(state));const fingerprint=JSON.stringify({...state,call:call?{...call,elapsed:null}:null});if(employee&&sessionToken&&fingerprint!==savedFingerprint){savedFingerprint=fingerprint;registerSession()}}
 function readState(){try{return JSON.parse(sessionStorage.getItem(STATE)||'null')}catch{return null}}
 function boundExtension(){const state=readState();return state?.token===sessionToken?state.extension||'':''}
 function restoreState(){const s=readState();if(s?.token===sessionToken&&(!ext()||s.extension===ext())){arabicssAuthenticated=!!s.arabicssAuthenticated;call=s.call;breakActive=!!s.breakActive;breakStarted=s.breakStarted||null}}
 async function enqueue(event,token){return browser.runtime.sendMessage({type:'QUEUE_EVENT',event,token})}
 async function send(event,token=sessionToken){
  if(!token||!event.extension)return false;
  try{
   const r=await apiFetch('/api/events',{method:'POST',headers:{'content-type':'application/json','x-device-token':TOKEN,'x-employee-session':token},body:JSON.stringify(event)});
   if(r.ok){status('الإضافة متصلة — أرابيكس: '+(sourceConnection==='connected'?'متصل':sourceConnection==='disconnected'?'منقطع':'غير مؤكد'));return true}
   if([401,403,409].includes(r.status)&&token===sessionToken){await enqueue(event,token);resetLocal();return false}
   await enqueue(event,token);status('الحدث محفوظ للمراجعة/إعادة الإرسال');return false;
  }catch{try{await enqueue(event,token);status('الحدث محفوظ لحين عودة الاتصال')}catch{status('تعذر حفظ الحدث — لا تعتمد على اكتمال البيانات')}return false}
 }
 function activity(eventType,extra={},token=sessionToken,extension=ext()||boundExtension()){
  const at=new Date().toISOString();return send({eventType,eventKey:extension+':'+eventType+':'+at+':'+crypto.randomUUID(),extension,occurredAt:at,...extra},token);
 }
 let presenceFingerprint='';
 function reportPresence(force=false){
  if(!employee||!sessionToken||!ext())return;
  const state=sourceConnection!=='connected'?'unknown':breakActive?'break':call?'on_call':sourceStateKnown?'ready':'unknown';
  const payload={sourceConnection,breakStartedAt:breakStarted,callStartedAt:call?.startedAt||null,callId:call?.callId||'',phone:call?.phone||'',callType:call?.callType||'',queue:call?.queue||''};
  const fingerprint=JSON.stringify({extension:ext(),state,payload});
  if(!force&&fingerprint===presenceFingerprint)return;
  presenceFingerprint=fingerprint;activity('heartbeat',{state,payload});
 }
 async function registerSession(){if(!sessionToken||!employee)return;try{const r=await browser.runtime.sendMessage({type:'REGISTER_SESSION',token:sessionToken,deviceToken:TOKEN,employee,version:VERSION,state:readState()});if(r.duplicate)resetLocal()}catch{status('تعذر تأكيد حفظ الجلسة؛ أعد تحميل الصفحة')}}
 async function flush(){
  if(flushing)return;flushing=true;try{const result=await browser.runtime.sendMessage({type:'FLUSH_EVENTS',deviceToken:TOKEN});if(result.rejected)status('يوجد '+result.rejected+' حدث مرفوض محفوظ للمراجعة؛ البيانات قد تكون ناقصة')}catch{}finally{flushing=false}
 }
 function resetLocal(){
  employee=null;sessionToken='';call=null;breakActive=false;breakStarted=null;sourceStateKnown=false;savedFingerprint='';presenceFingerprint='';arabicssAuthenticated=false;
  for(const key of [SESSION,SESSION+'_token',STATE,SESSION+'_version'])sessionStorage.removeItem(key);
  document.getElementById('kpi-session-box')?.remove();if(initialized&&document.body)mount();
 }
 function finishSession(reason='manual'){
  const token=sessionToken,extension=ext()||boundExtension();
  if(!token){resetLocal();return}
  activity(reason==='manual'?'session_logout':'arabicss_logout',{state:reason},token,extension);
  const fallback=()=>apiFetch('/api/session/end',{method:'POST',headers:{'content-type':'application/json','x-device-token':TOKEN,'x-employee-session':token},body:JSON.stringify({reason})}).catch(()=>{});
  browser.runtime.sendMessage({type:'END_EMPLOYEE_SESSION',token,deviceToken:TOKEN,reason}).then(r=>{if(!r.ok&&!r.pending)return fallback()}).catch(fallback);
  resetLocal();
 }
 function callData(payload={}){
  const raw=payload.call||payload.data||payload;
  const html=String(raw.llamada_informacion||''),doc=html?new DOMParser().parseFromString(html,'text/html'):null;
  const text=(doc?.body.textContent||document.querySelector('#issabel-callcenter-llamada-info')?.textContent||'').replace(/\s+/g,' ');
  const visibleId=(text.match(/Internal Call ID:\s*([^\s]+)/i)||[])[1]||'';
  return {callId:canonicalId(raw.callid||raw.callId||visibleId),phone:String(raw.txt_contacto_telefono||raw.phone||raw.phonenumber||(text.match(/Phone number:\s*([+\d]+)/i)||[])[1]||''),
   queue:String(raw.queue||(visibleId.match(/incoming-q(\d+)-/)||[])[1]||''),callType:raw.calltype||raw.callType||(visibleId.startsWith('incoming')?'incoming':visibleId?'outgoing':null)};
 }
 function startCall(payload){
  const c=callData(payload);if(!c.callId)return;
  if(call?.callId===c.callId)return;
  call={...c,startedAt:Date.now(),elapsed:0,observed:false};saveState();
  send({...c,eventType:'agentlinked',eventKey:ext()+':'+c.callId+':start',extension:ext(),occurredAt:new Date().toISOString(),durationSeconds:0,payload});
 }
 function endCall(payload){
  const c=callData(payload),ended=call;
  if(!ended||c.callId&&c.callId!==ended.callId)return;
  if(!ended.observed){const duration=Math.max(ended.elapsed||0,Math.round((Date.now()-ended.startedAt)/1000));
   send({...ended,eventType:'agentunlinked',eventKey:ext()+':'+ended.callId+':end',extension:ext(),occurredAt:new Date().toISOString(),durationSeconds:duration,payload:{...payload,durationKnown:true}})}
  else activity('call_observed_end',{state:'ready',payload:{callId:ended.callId,durationKnown:false}});
  call=null;saveState();
 }
 function acceptState(payload){
  sourceConnection=payload.connection||sourceConnection;
  if(sourceConnection!=='connected'){sourceStateKnown=false;reportPresence();return}
  sourceStateKnown=true;
  if(payload.break_id!=null){if(!breakActive){breakActive=true;breakStarted=null;activity('break_observed',{state:'break',payload:{breakId:payload.break_id,durationKnown:false}})}}
  else if(breakActive){activity(breakStarted?'break_end':'break_end_unknown',{state:'ready',durationSeconds:breakStarted?Math.round((Date.now()-Date.parse(breakStarted))/1000):0,payload:{durationKnown:!!breakStarted}});breakActive=false;breakStarted=null}
  const id=canonicalId(payload.callid);
  if(id&&!call){call={...callData({callid:id,calltype:payload.calltype}),startedAt:null,elapsed:null,observed:true};activity('call_observed',{state:'on_call',payload:{callId:id,startedBeforeObservation:true}})}
  else if(!id&&call)endCall({callid:call.callId});
  saveState();reportPresence();
 }
 function scan(){
  if(!employee||!sessionToken)return;
  const current=ext(),bound=boundExtension();
  const arabicssPassword=[...document.querySelectorAll('input[type="password"]')].some(input=>!input.closest('#kpi-session-box'));
  const authenticatedPage=!!current||!!document.querySelector('a[href*="logout=yes"]')||!!document.querySelector('#issabel_framework_module_id');
  if(!current&&arabicssPassword&&(bound||arabicssAuthenticated&&!authenticatedPage)){finishSession('arabicss_login_page');return}
  if(authenticatedPage&&!arabicssAuthenticated){arabicssAuthenticated=true;saveState()}
  if(bound&&current&&bound!==current){finishSession('extension_changed');return}
  if(current&&!bound){saveState();activity('session_login',{state:'bound'})}
  if(call&&!call.observed&&sourceConnection==='connected'){const duration=seconds(document.querySelector('#issabel-callcenter-cronometro')?.textContent);if(duration!==null){call.elapsed=Math.max(call.elapsed||0,duration);saveState()}}
 }
 function scheduleScan(){if(scanTimer)return;scanTimer=setTimeout(()=>{scanTimer=null;scan()},250)}
 document.addEventListener('click',e=>{const a=e.target?.closest?.('a[href]');if(!a||!employee)return;try{const u=new URL(a.href,location.origin);if(u.hostname===location.hostname&&u.searchParams.get('logout')==='yes')finishSession('arabicss_logout')}catch{}},true);
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.source!=='ARABICSS_KPI_SSE'||!employee||!sessionToken)return;
  let payload;try{payload=JSON.parse(e.data.data||'{}')}catch{return}
  const type=String(e.data.type||'').toLowerCase();
  if(type==='source_connection'){sourceConnection=payload.state;if(sourceConnection!=='connected')sourceStateKnown=false;reportPresence();return}
  if(type==='arabicss_state'){acceptState(payload);return}
  if(type==='logged-out'||type==='agentloggedout'){finishSession('arabicss_logout');return}
  sourceConnection='connected';sourceStateKnown=true;
  if(type==='breakenter'){if(!breakActive){breakStarted=payload._previousBreakId!=null?null:new Date().toISOString();activity(breakStarted?'break_start':'break_observed',{state:'break',payload:{...payload,durationKnown:!!breakStarted}})}breakActive=true;saveState()}
  else if(type==='breakexit'){if(breakActive)activity(breakStarted?'break_end':'break_end_unknown',{state:'ready',durationSeconds:breakStarted?Math.round((Date.now()-Date.parse(breakStarted))/1000):0,payload:{...payload,durationKnown:!!breakStarted}});breakActive=false;breakStarted=null;saveState()}
  else if(type==='agentlinked')startCall(payload);
  else if(type==='agentunlinked')endCall(payload);
  reportPresence();
 });
 function mount(){
  const existing=document.getElementById('kpi-session-box');
  if(existing){existing._kpiRender?.();return}
  if(refreshTimer)clearInterval(refreshTimer);if(focusRefresh)window.removeEventListener('focus',focusRefresh);
  const box=document.createElement('div');box.id='kpi-session-box';box.dir='rtl';
  box.innerHTML='<div style="font-weight:700;margin-bottom:9px">جلسة الموظف — KPI · '+VERSION+'</div><div id="kpi-active"><div>الموظف: <b id="kpi-name"></b></div><div id="kpi-status" style="margin-top:8px">بانتظار تأكيد مصدر أرابيكس</div><div style="margin-top:8px;font-size:14px">الخروج مرتبط بالخروج من أرابيكس أو إغلاق المتصفح</div></div><div id="kpi-form"><select id="kpi-employee"></select><button id="kpi-refresh">تحديث الموظفين</button><input id="kpi-pin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN الشخصي"><button id="kpi-start">بدء الشيفت</button><div id="kpi-error" role="status"></div></div>';
  document.body.appendChild(box);
  const render=()=>{box.querySelector('#kpi-active').hidden=!employee;box.querySelector('#kpi-form').hidden=!!employee;box.querySelector('#kpi-name').textContent=employee?.name||'';box.style.cssText='position:fixed;z-index:2147483647;color:white;padding:18px;border:1px solid #2dd4bf;font:17px Arial;'+(employee?'left:16px;bottom:16px;width:300px;border-radius:12px;background:#142033':'inset:0;display:grid;place-content:center;text-align:center;background:#101b2bee')};
  const refresh=async()=>{if(employee)return;const select=box.querySelector('#kpi-employee'),chosen=select.value;try{const r=await apiFetch('/api/employees/list?t='+Date.now());if(!r.ok)throw Error();const d=r.json();select.replaceChildren(new Option('اختر اسم الموظف',''));for(const e of d.employees)select.add(new Option(e.name,String(e.id)));select.value=chosen;box.querySelector('#kpi-error').textContent=d.employees.length?'':'لا يوجد موظفون نشطون'}catch{box.querySelector('#kpi-error').textContent='تعذر تحميل الموظفين؛ أعد المحاولة'}};
  box.querySelector('#kpi-refresh').onclick=refresh;focusRefresh=refresh;window.addEventListener('focus',refresh);refreshTimer=setInterval(refresh,15000);refresh();
  box.querySelector('#kpi-start').onclick=async()=>{
   if(!initialized)return;
   const employeeId=Number(box.querySelector('#kpi-employee').value),pin=box.querySelector('#kpi-pin').value,button=box.querySelector('#kpi-start');
   if(!employeeId||!/^\d{4,8}$/.test(pin)){box.querySelector('#kpi-error').textContent='اختر اسمك وأدخل PIN الصحيح';return}
   button.disabled=true;
   try{const r=await apiFetch('/api/session/start',{method:'POST',headers:{'content-type':'application/json','x-device-token':TOKEN},body:JSON.stringify({employeeId,pin,extension:ext()})}),d=r.json();
    if(!r.ok){box.querySelector('#kpi-error').textContent=r.status===429?'محاولات كثيرة؛ انتظر 15 دقيقة':r.status===409?'توجد جلسة أخرى نشطة للموظف أو الاكستنشن':r.status===401?'PIN غير صحيح':'تعذر بدء الجلسة';return}
    employee=d.employee;sessionToken=d.token;sessionStorage.setItem(SESSION,JSON.stringify(employee));sessionStorage.setItem(SESSION+'_token',sessionToken);sessionStorage.setItem(SESSION+'_version',VERSION);sessionStorage.setItem(EPOCH,runtimeEpoch);call=null;breakStarted=null;breakActive=false;saveState();box.querySelector('#kpi-pin').value='';await registerSession();render();if(ext())activity('session_login',{state:'verified'});scan();flush();
   }catch{box.querySelector('#kpi-error').textContent='تعذر الاتصال؛ لم تبدأ الجلسة'}finally{button.disabled=false}
  };
  box._kpiRender=render;render();if(employee)registerSession();
 }
 const inject=()=>{const root=document.documentElement;if(!root)return false;const script=document.createElement('script');script.src=browser.runtime.getURL('page-hook.js');script.onload=()=>script.remove();root.appendChild(script);return true};
 if(!inject())document.addEventListener('readystatechange',inject,{once:true});
 async function initialize(){
  try{
   const runtime=await browser.runtime.sendMessage({type:'EMPLOYEE_RUNTIME_EPOCH'});runtimeEpoch=runtime.epoch;
   // Same-tab navigation can change HTTP/HTTPS origin and lose sessionStorage.
   // Recover only this tab's identity, never a device-wide or another tab's session.
   if(runtime.session?.employee&&runtime.session.version===VERSION){
    sessionStorage.setItem(SESSION,JSON.stringify(runtime.session.employee));sessionStorage.setItem(SESSION+'_token',runtime.session.token);sessionStorage.setItem(SESSION+'_version',VERSION);sessionStorage.setItem(EPOCH,runtimeEpoch);
    if(runtime.session.state)sessionStorage.setItem(STATE,JSON.stringify(runtime.session.state));
   }
   const savedToken=sessionStorage.getItem(SESSION+'_token'),same=sessionStorage.getItem(EPOCH)===runtimeEpoch&&sessionStorage.getItem(SESSION+'_version')===VERSION;
   if(same&&savedToken){const body=savedToken.split('.')[0],claims=JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));if(claims.exp>Date.now()){employee=JSON.parse(sessionStorage.getItem(SESSION)||'null');sessionToken=savedToken;restoreState()}}
   if(!employee){if(savedToken)apiFetch('/api/session/end',{method:'POST',headers:{'content-type':'application/json','x-device-token':TOKEN,'x-employee-session':savedToken},body:'{}'}).catch(()=>{});resetLocal()}
  }catch{resetLocal()}
  if(sessionToken)await registerSession();
  initialized=true;mount();scan();flush();
 }
 function boot(){
  const style=document.createElement('style');style.textContent='#kpi-session-box select,#kpi-session-box input{box-sizing:border-box;width:100%;padding:12px;margin:7px 0;border-radius:7px;background:#fff!important;color:#111827!important;opacity:1!important;font:700 17px Arial!important}#kpi-session-box option{background:#fff;color:#111827}#kpi-session-box button{width:100%;padding:10px;margin:6px 0;border-radius:7px;border:1px solid #64748b;background:#2dd4bf;color:#06251e;font:700 17px Arial;cursor:pointer}#kpi-session-box [hidden]{display:none!important}#kpi-error{color:#ffb4b4;margin-top:8px}';document.documentElement.appendChild(style);
  // Gate before initialization completes; never briefly expose the login form.
  mount();new MutationObserver(scheduleScan).observe(document.body,{childList:true,subtree:true,characterData:true});initialize();
 }
 window.addEventListener('online',flush);setInterval(flush,10000);
 setInterval(async()=>{
  if(!employee||!sessionToken)return;
  try{const runtime=await browser.runtime.sendMessage({type:'EMPLOYEE_RUNTIME_EPOCH'});if(runtime.epoch!==runtimeEpoch){finishSession('extension_restarted');return}}catch{resetLocal();return}
  registerSession();
  reportPresence(true);
 },30000);
 window.addEventListener('pagehide',()=>{if(employee){saveState();activity('page_closed',{state:'navigation_or_closed'})}});
 if(document.body)boot();else document.addEventListener('DOMContentLoaded',boot,{once:true});
})();