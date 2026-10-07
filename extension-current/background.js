const API='https://marsad-kpi-live.karim87nu.chatgpt.site',ROOT='https://41.38.207.218:11594/themes/arabicssReportsInclude/dark/';
const employeeRuntimeEpoch=crypto.randomUUID();
let queueLock=Promise.resolve();
const withQueueLock=fn=>{const job=queueLock.then(fn,fn);queueLock=job.catch(()=>{});return job};
const QUEUE='arabicss_kpi_offline_queue';
const TAB_SESSIONS='arabicss_kpi_tab_sessions';
async function endTracked(entry,reason){
 try{const r=await request(API+'/api/session/end',{method:'POST',headers:{'content-type':'application/json','x-device-token':entry.deviceToken,'x-employee-session':entry.token},body:JSON.stringify({reason})});return r.ok||[401,403].includes(r.status)}catch{return false}
}
// Firefox may stop the background page before a shutdown request finishes.
// Persist pending closure and retry at next startup; epoch forces fresh employee login.
const startupCleanup=withQueueLock(async()=>{
 const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},left={};
 for(const [id,entry] of Object.entries(entries))if(!await endTracked(entry,entry.closeReason||'browser_restarted'))left[id]={...entry,pendingClose:true};
 await browser.storage.local.set({[TAB_SESSIONS]:left});
});
browser.tabs?.onRemoved?.addListener(tabId=>withQueueLock(async()=>{
 const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},entry=entries[tabId];if(!entry)return;
 if(await endTracked(entry,entry.closeReason||'tab_closed'))delete entries[tabId];else entries[tabId]={...entry,pendingClose:true,closeReason:entry.closeReason||'tab_closed'};
 await browser.storage.local.set({[TAB_SESSIONS]:entries});
}));
let busy=false,liveBusy=false,status={message:'موصل الإدارة غير مفعّل'};
let collectorAuthFlight=null;
let collectorSetupFlight=null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const daysBefore=(value,days)=>{const [y,m,d]=value.split('-').map(Number);return new Date(Date.UTC(y,m-1,d-days,12)).toISOString().slice(0,10)};
const trustedAdminPage=value=>{try{const u=new URL(value);return u.origin==='https://marsad-kpi-live.karim87nu.chatgpt.site'&&/^\/admin(?:\/|$)/.test(u.pathname)}catch{return false}};
const config=async()=> (await browser.storage.local.get('historyCollector')).historyCollector;
async function request(url,options={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{return await fetch(url,{...options,signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
async function collectorAction(body,headers={}){const r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'تعذر تجديد ربط الموصل');return d}
async function ensureCollectorAccess(force=false){
 if(collectorAuthFlight)return collectorAuthFlight;
 collectorAuthFlight=(async()=>{
  const cfg=await config();if(!cfg?.enabled)throw Error('موصل الإدارة متوقف');
  const exp=Number(String(cfg.token||'').split('.')[0]);if(!force&&Number.isFinite(exp)&&exp>Date.now()+60*60*1000&&cfg.refreshToken)return cfg;
  let d;
  if(cfg.refreshToken)d=await collectorAction({action:'refresh',refreshToken:cfg.refreshToken});
  else if(cfg.token)d=await collectorAction({action:'upgrade'},{'x-history-token':cfg.token});
  else throw Error('افتح موصل الإدارة وفعّله مرة واحدة');
  const current=await config();if(!current?.enabled)return current;
  const next={...current,token:d.token,...d.refreshToken?{refreshToken:d.refreshToken}:{}};
  await browser.storage.local.set({historyCollector:next});return next;
 })().finally(()=>{collectorAuthFlight=null});
 return collectorAuthFlight;
}
async function activateCollectorFromAdmin(adminSession){
 if(collectorSetupFlight)return collectorSetupFlight;
 collectorSetupFlight=(async()=>{
  const existing=await config();
  if(existing?.enabled){status={...status,message:'المزامنة التلقائية مفعّلة'};collectHistory();collectLive();return{ok:true,already:true}}
  const startDate=daysBefore(today(),13);
  const d=await collectorAction({action:'token'},{'x-admin-password':adminSession});
  await browser.storage.local.set({historyCollector:{enabled:true,token:d.token,refreshToken:d.refreshToken,startDate,nextDate:startDate}});
  status={...status,message:'تم تفعيل المزامنة التلقائية واستكمال آخر 14 يومًا'};collectHistory();collectLive();return{ok:true}
 })().catch(error=>{status={...status,message:'تعذر تفعيل المزامنة التلقائية: '+(error.message||'تحقق من صلاحية حساب الإدارة')};throw error}).finally(()=>{collectorSetupFlight=null});
 return collectorSetupFlight;
}
async function post(body){
 let cfg=await ensureCollectorAccess(),r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json','x-history-token':cfg.token},body:JSON.stringify(body)});
 if(r.status===401){cfg=await ensureCollectorAccess(true);r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json','x-history-token':cfg.token},body:JSON.stringify(body)})}
 const d=await r.json();if(!r.ok)throw Error(r.status===401?'تعذر تجديد ربط الموصل؛ افتح إعداد الموصل وأعد ربطه مرة واحدة':d.error||'تعذر حفظ السجل');return d
}
async function source(path,options={}){const r=await request(ROOT+path,{...options,credentials:'include'}),html=await r.text();if(!r.ok||/login\.php/i.test(r.url)||/<input[^>]+type=["']password/i.test(html))throw Error('سجل دخول إدارة أرابيكس مرة واحدة ثم أعد المحاولة');return html}
async function collectHistory(){
 if(busy)return;const cfg=await config();if(!cfg?.enabled)return;busy=true;
 try{let date=cfg.nextDate||cfg.startDate;const end=today();
 for(let step=0;step<14&&date<=end;step++){
 const [y,m,d]=date.split('-'),v=m+'/'+d+'/'+y,html=await source('0002_inbound_calls.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({start_date:v,end_date:v}).toString()});
 const doc=new DOMParser().parseFromString(html,'text/html'),table=doc.querySelector('#example23');if(!table)throw Error('لم يتم التعرف على جدول السجل');
 const header=Array.from(table.querySelectorAll('thead th')).map(c=>c.textContent.trim()),rows=Array.from(table.querySelectorAll('tbody tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.textContent.trim())).filter(r=>r.length===10);
 const label=Array.from(doc.querySelectorAll('h5')).find(e=>e.textContent.trim()==='All Inbound Calls'),count=Number(label?.previousElementSibling?.textContent.trim());
 if(!label||!Number.isInteger(count)||count!==rows.length)throw Error('السجل ناقص؛ لم تُحسب الفترة');
 const di=header.indexOf('Call Date');if(di<0||rows.some(r=>r[di]!==date))throw Error('التاريخ الذي أعاده أرابيكس لا يطابق المطلوب');
 await post({rows:[header,...rows],expectedCount:count,reportDate:date});
 status={...status,message:'تم استكمال سجل '+date+' ('+rows.length+' مكالمة)',lastHistory:new Date().toISOString()};
 const current=await config();if(!current?.enabled||current.token!==cfg.token)break;
 const done=date===end;date=done?date:new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 await browser.storage.local.set({historyCollector:{...current,nextDate:date}});if(done)break;
 }
 }catch(e){status={...status,message:e.message||'تعذر سحب السجل؛ راجع الاتصال وشهادة أرابيكس'}}finally{busy=false}
}
async function collectLive(){
 if(liveBusy)return;const cfg=await config();if(!cfg?.enabled)return;liveBusy=true;
 try{const html=await source('get_inbound_calls_real_time.php'),doc=new DOMParser().parseFromString('<table><tbody>'+html+'</tbody></table>','text/html'),rows=Array.from(doc.querySelectorAll('tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.textContent.trim())).filter(r=>r.length===11);
 if(html.trim()&&!rows.length)throw Error('رد اللايف غير معروف؛ اللقطة السابقة لم تُحدّث');
 await post({action:'live',rows});status={...status,lastLive:new Date().toISOString(),liveError:null}
 }catch(e){status={...status,liveError:e.message||'تعذر سحب اللايف'}}finally{liveBusy=false}
}
browser.runtime.onMessage.addListener(async(message,sender)=>{
 if(message?.type==='EMPLOYEE_ALERT'){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  await startupCleanup;
  return withQueueLock(async()=>{
   const entry=((await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{})[sender.tab.id];
   if(!entry||entry.pendingClose||entry.token!==message.token)return {ok:false};
   const kinds={call_long:['مكالمتك تجاوزت 4 دقائق','راجع احتياج العميل واستكمل خدمته؛ التنبيه لا ينهي المكالمة.'],break_warning:['باقي دقيقة على البريك','مدة البريك 15 دقيقة. استعد للعودة لاستقبال المكالمات.'],break_limit:['انتهت مدة البريك','مرّت 15 دقيقة. ارجع لاستقبال المكالمات.']};
   const notice=kinds[message.kind];if(!notice)return {ok:false};
   const key=String(message.key||'').slice(0,160),seen=entry.alertKeys||[];if(!key||seen.includes(key))return {ok:true,duplicate:true};
   try{await browser.notifications.create('kpi-'+sender.tab.id+'-'+message.kind,{type:'basic',iconUrl:browser.runtime.getURL('notification.svg'),title:notice[0],message:notice[1]});}catch{return {ok:false}}
   const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};
   if(entries[sender.tab.id]?.token===message.token){entries[sender.tab.id].alertKeys=[...seen,key].slice(-100);await browser.storage.local.set({[TAB_SESSIONS]:entries})}
   return {ok:true};
  });
 }
 if(message?.type==='END_EMPLOYEE_SESSION'){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  await startupCleanup;
  return withQueueLock(async()=>{
   const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},entry=entries[sender.tab.id];
   if(!entry||entry.token!==message.token)return{ok:false};
   const closed=await endTracked(entry,message.reason);
   if(closed)delete entries[sender.tab.id];else entries[sender.tab.id]={...entry,pendingClose:true,closeReason:message.reason};
   await browser.storage.local.set({[TAB_SESSIONS]:entries});return{ok:closed,pending:!closed};
  });
 }
 if(['REGISTER_SESSION','UNREGISTER_SESSION'].includes(message?.type)){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  await startupCleanup;
  return withQueueLock(async()=>{
   const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};
   if(message.type==='REGISTER_SESSION'){
    if(!message.token||!message.deviceToken)throw Error('invalid_session');
    if(Object.entries(entries).some(([id,e])=>Number(id)!==sender.tab.id&&e.token===message.token&&!e.pendingClose))return {ok:false,duplicate:true};
    if(entries[sender.tab.id]?.pendingClose&&entries[sender.tab.id].token!==message.token){entries['pending-'+crypto.randomUUID()]=entries[sender.tab.id];delete entries[sender.tab.id]}
    const previous=entries[sender.tab.id]?.token===message.token?entries[sender.tab.id]:{};
    entries[sender.tab.id]={...previous,token:message.token,deviceToken:message.deviceToken,employee:message.employee||previous.employee,version:message.version||previous.version,state:message.state||previous.state,pendingClose:false};
   }else if(entries[sender.tab.id]?.token===message.token)delete entries[sender.tab.id];
   await browser.storage.local.set({[TAB_SESSIONS]:entries});return {ok:true};
  });
 }
 if(message?.type==='QUEUE_EVENT'||message?.type==='FLUSH_EVENTS'){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  return withQueueLock(async()=>{
   const q=(await browser.storage.local.get(QUEUE))[QUEUE]||[];
   if(message.type==='QUEUE_EVENT'){q.push({...message.event,_sessionToken:message.token,_queueId:crypto.randomUUID()});await browser.storage.local.set({[QUEUE]:q});return {ok:true,pending:q.length}}
   const left=[],rejected=(await browser.storage.local.get('kpi_rejected_events')).kpi_rejected_events||[];
   for(let i=0;i<q.length;i++){
    const event=q[i];if(i>=25||!event._sessionToken){left.push(event);continue}
    try{
     const r=await request(API+'/api/events',{method:'POST',headers:{'content-type':'application/json','x-device-token':message.deviceToken,'x-employee-session':event._sessionToken},body:JSON.stringify(event)});
     if(!r.ok){
      if([400,401,403,409].includes(r.status))rejected.push({...event,_reason:await r.text(),_rejectedAt:new Date().toISOString()});
      else {left.push(...q.slice(i));break}
     }
    }catch{left.push(...q.slice(i));break}
   }
   await browser.storage.local.set({[QUEUE]:left,kpi_rejected_events:rejected});
   return{pending:left.length,rejected:rejected.length}
  });
 }
 if(message?.type==='EMPLOYEE_RUNTIME_EPOCH'){
  if(!sender.tab||!/^https?:\/\/41\.38\.207\.218(?::11594)?\//.test(sender.url||''))throw Error('invalid_sender');
  await startupCleanup;
  const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},entry=entries[sender.tab.id];
  return {epoch:employeeRuntimeEpoch,session:entry&&!entry.pendingClose?{token:entry.token,employee:entry.employee,version:entry.version,state:entry.state}:null};
 }
 if(message?.type==='COLLECTOR_ADMIN_SESSION'){
  if(!trustedAdminPage(sender.url)||typeof message.token!=='string'||message.token.length>1024)throw Error('invalid_sender');
  return activateCollectorFromAdmin(message.token);
 }
 if(String(message?.type||'').startsWith('COLLECTOR_')){
 if(sender.url!==browser.runtime.getURL('collector.html'))throw Error('invalid_sender');
 if(message.type==='COLLECTOR_STATUS'){const c=await config();if(c?.enabled&&status.message==='موصل الإدارة غير مفعّل')status={...status,message:'المزامنة التلقائية مفعّلة'};return{...status,config:c?{enabled:c.enabled,startDate:c.startDate,nextDate:c.nextDate}:null}}
 if(message.type==='COLLECTOR_STOP'){const c=await config();if(c?.refreshToken)try{await collectorAction({action:'revoke',refreshToken:c.refreshToken})}catch{}await browser.storage.local.remove('historyCollector');status={message:'موصل الإدارة متوقف'};return{ok:true}}
 if(message.type==='COLLECTOR_SYNC'){collectHistory();collectLive();return{ok:true}}
 return;
 }
 if(message?.type!=='KPI_API')return;
 if(!sender.url||new URL(sender.url).hostname!=='41.38.207.218')throw Error('invalid_sender');
 const path=String(message.path||'');if(!/^\/api\/(employees\/list(?:\?.*)?|session\/(?:start|end)|events|messages|break-requests)$/.test(path))throw Error('invalid_path');
 const r=await request(API+path,{method:message.method||'GET',headers:message.headers||{},body:message.body});return{status:r.status,ok:r.ok,body:await r.text()}
});
setInterval(collectHistory,300000);setInterval(collectLive,5000);collectHistory();collectLive();
setInterval(()=>ensureCollectorAccess().catch(e=>{status={...status,liveError:e.message||'تعذر تجديد ربط الموصل'}}),5*60*1000);
setInterval(()=>withQueueLock(async()=>{const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};for(const [id,entry] of Object.entries(entries))if(entry.pendingClose&&await endTracked(entry,entry.closeReason||'browser_restarted'))delete entries[id];await browser.storage.local.set({[TAB_SESSIONS]:entries})}).catch(()=>{}),10000);

