const API='https://marsad-kpi-live.karim87nu.chatgpt.site',ROOT='https://41.38.207.218:11594/themes/arabicssReportsInclude/dark/';
const collectorClock=globalThis.createKpiClock?.();
const employeeRuntimeEpoch=crypto.randomUUID();
let queueLock=Promise.resolve();
const withQueueLock=fn=>{const job=queueLock.then(fn,fn);queueLock=job.catch(()=>{});return job};
const QUEUE='arabicss_kpi_offline_queue';
const TAB_SESSIONS='arabicss_kpi_tab_sessions';
const terminalEvents=new Map(),outcomeKey=e=>JSON.stringify([e._sessionToken,e.eventKey]);
function rememberRejected(events){for(const e of events)if(e._reason!=='clock_unsynchronized'){terminalEvents.set(outcomeKey(e),true);while(terminalEvents.size>1000)terminalEvents.delete(terminalEvents.keys().next().value)}}
async function endTracked(entry,reason){
 try{const r=await request(API+'/api/session/end',{method:'POST',headers:{'content-type':'application/json','x-device-token':entry.deviceToken,'x-employee-session':entry.token},body:JSON.stringify({reason})});return r.ok||[401,403].includes(r.status)}catch{return false}
}
// Firefox may stop the background page before a shutdown request finishes.
// Persist pending closure and retry at next startup; epoch forces fresh employee login.
const startupCleanup=withQueueLock(async()=>{
 const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},left={};
 const tabs=browser.tabs?.query?await browser.tabs.query({}).catch(()=>null):[];
 for(const [id,entry] of Object.entries(entries)){
  const alive=!entry.pendingClose&&(tabs===null||tabs.some(tab=>String(tab.id)===id&&/^https?:\/\/41\.38\.207\.218(?::11594)?\//.test(tab.url||'')));
  left[id]=alive?entry:{...entry,pendingClose:true,closeReason:entry.closeReason||'browser_restarted'};
 }
 await browser.storage.local.set({[TAB_SESSIONS]:left});
 const storedCount=(await browser.storage.local.get('kpi_rejected_event_count')).kpi_rejected_event_count;
 rememberRejected((await browser.storage.local.get('kpi_rejected_events')).kpi_rejected_events||[]);
 if(!Number.isFinite(storedCount)){const log=(await browser.storage.local.get('kpi_rejected_events')).kpi_rejected_events||[];await browser.storage.local.set({kpi_rejected_event_count:log.length})}
});
// A real browser startup is distinct from a background reload/update.
browser.runtime.onStartup?.addListener(()=>startupCleanup.then(async()=>{
 await withQueueLock(async()=>{const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};for(const entry of Object.values(entries)){entry.pendingClose=true;entry.closeReason=entry.closeReason||'browser_restarted'}await browser.storage.local.set({[TAB_SESSIONS]:entries})});
 await retryPendingClosures();
}).catch(()=>{}));
const closingTokens=new Set();let closureRetryFlight=null,closureRetryCursor=0;
async function closeTracked(tabId,reason,token){
 await startupCleanup;
 const entry=await withQueueLock(async()=>{const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},entry=entries[tabId];if(!entry||token&&entry.token!==token)return null;entries[tabId]={...entry,pendingClose:true,closeReason:entry.closeReason||reason};await browser.storage.local.set({[TAB_SESSIONS]:entries});return entries[tabId]});
 if(!entry)return {ok:false};if(closingTokens.has(entry.token))return {ok:false,pending:true};closingTokens.add(entry.token);
 try{const closed=await endTracked(entry,entry.closeReason);if(closed)await withQueueLock(async()=>{const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};if(entries[tabId]?.token===entry.token&&entries[tabId].pendingClose){delete entries[tabId];await browser.storage.local.set({[TAB_SESSIONS]:entries})}});return {ok:closed,pending:!closed}}
 finally{closingTokens.delete(entry.token)}
}
function retryPendingClosures(){
 if(closureRetryFlight)return closureRetryFlight;
 closureRetryFlight=(async()=>{await startupCleanup;const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},pending=Object.entries(entries).filter(([,e])=>e.pendingClose);if(!pending.length)return;const count=Math.min(4,pending.length),offset=closureRetryCursor%pending.length;closureRetryCursor=(offset+count)%pending.length;await Promise.all(Array.from({length:count},(_,i)=>{const [id,e]=pending[(offset+i)%pending.length];return closeTracked(id,e.closeReason,e.token)}))})().finally(()=>{closureRetryFlight=null});return closureRetryFlight;
}
startupCleanup.then(()=>retryPendingClosures()).catch(()=>{});
browser.tabs?.onRemoved?.addListener(tabId=>closeTracked(tabId,'tab_closed'));
let flushEventsFlight=null;
// Immediate delivery and the durable outbox share one request per event.
// Accepted responses are bounded and short-lived, never persisted credentials.
const eventDeliveries=new Map(),acceptedDeliveries=new Map();
function deliverEvent(deviceToken,event,token){
 const key=event.eventKey?JSON.stringify([deviceToken,token,event.eventKey]):null,now=Date.now();
 for(const [k,v]of acceptedDeliveries)if(v.until<=now)acceptedDeliveries.delete(k);
 if(key&&acceptedDeliveries.has(key))return Promise.resolve({...acceptedDeliveries.get(key).response,fromCache:true});
 if(key&&eventDeliveries.has(key))return eventDeliveries.get(key);
 const flight=request(API+'/api/events',{method:'POST',headers:{'content-type':'application/json','x-device-token':deviceToken,'x-employee-session':token},body:JSON.stringify(event)}).then(response=>{
  if(key&&response.ok){acceptedDeliveries.set(key,{response,until:Date.now()+300000});while(acceptedDeliveries.size>256)acceptedDeliveries.delete(acceptedDeliveries.keys().next().value)}return response;
 }).finally(()=>{if(key&&eventDeliveries.get(key)===flight)eventDeliveries.delete(key)});
 if(key)eventDeliveries.set(key,flight);return flight;
}
async function preserveRejected(update,rejected,count){
 const log=(await browser.storage.local.get('kpi_rejected_events')).kpi_rejected_events||[],all=[...log,...rejected];
 const overflow=all.splice(0,Math.max(0,all.length-500));
 // Immutable pages preserve every rejected event without rewriting the whole
 // history on each replay. Never discard an unsent or rejected event.
 for(let i=0;i<overflow.length;i+=250){const key='kpi_rejected_archive_'+crypto.randomUUID();await browser.storage.local.set({[key]:overflow.slice(i,i+250)})}
 update.kpi_rejected_events=all;update.kpi_rejected_event_count=count+rejected.length;
}
function flushQueuedEvents(deviceToken){
 if(flushEventsFlight)return flushEventsFlight;
 flushEventsFlight=(async()=>{
  const snapshot=await withQueueLock(async()=>{const q=(await browser.storage.local.get(QUEUE))[QUEUE]||[];let changed=false;for(const e of q)if(!e._queueId){e._queueId=crypto.randomUUID();changed=true}if(changed)await browser.storage.local.set({[QUEUE]:q});return q});
  const done=new Set(),rejected=[],retry=new Map();
  for(const event of snapshot.slice(0,25)){if(!event._sessionToken||event._retryAt>Date.now())continue;if(event.payload?.eventClock?.method==='unsynchronized'){rejected.push({...event,_reason:'clock_unsynchronized',_rejectedAt:new Date().toISOString()});done.add(event._queueId);continue}try{const r=await deliverEvent(deviceToken,event,event._sessionToken);if(r.ok)done.add(event._queueId);else if([400,401,403,409].includes(r.status)){const reason=await r.text();if(r.status===409&&event.eventType==='break_end'&&reason.includes('break_start_missing')&&(event._retryCount||0)<3){retry.set(event._queueId,{_retryCount:(event._retryCount||0)+1,_retryAt:Date.now()+2000});continue}rejected.push({...event,_reason:reason,_rejectedAt:new Date().toISOString()});done.add(event._queueId)}else break}catch{break}}
  return withQueueLock(async()=>{const current=(await browser.storage.local.get(QUEUE))[QUEUE]||[],ids=new Set(current.map(e=>e._queueId)),newRejected=rejected.filter(e=>ids.has(e._queueId)),left=current.filter(e=>!done.has(e._queueId)).map(e=>retry.has(e._queueId)?{...e,...retry.get(e._queueId)}:e);let count=Number((await browser.storage.local.get('kpi_rejected_event_count')).kpi_rejected_event_count)||0;if(done.size||retry.size){const update={[QUEUE]:left};if(newRejected.length){await preserveRejected(update,newRejected,count);count=update.kpi_rejected_event_count}await browser.storage.local.set(update);rememberRejected(newRejected)}return {pending:left.length,rejected:count,rejectedNow:newRejected.length}});
 })().finally(()=>{flushEventsFlight=null});return flushEventsFlight;
}
let busy=false,liveBusy=false,status={message:'موصل الإدارة غير مفعّل'};
browser.browserAction?.onClicked?.addListener(()=>browser.tabs.create({url:browser.runtime.getURL('collector.html')}));
let collectorAuthFlight=null;
let collectorSetupFlight=null;
let collectorEpoch=0;
let collectorStateLock=Promise.resolve();
const withCollectorState=fn=>{const job=collectorStateLock.then(fn,fn);collectorStateLock=job.catch(()=>{});return job};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const daysBefore=(value,days)=>{const [y,m,d]=value.split('-').map(Number);return new Date(Date.UTC(y,m-1,d-days,12)).toISOString().slice(0,10)};
const trustedAdminPage=value=>{try{const u=new URL(value);return u.origin==='https://marsad-kpi-live.karim87nu.chatgpt.site'&&/^\/admin(?:\/|$)/.test(u.pathname)}catch{return false}};
const config=async()=> (await browser.storage.local.get('historyCollector')).historyCollector;
async function request(url,options={}){
 const started=collectorClock?.monotonic();
 const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);
 try{const r=await fetch(url,{...options,signal:c.signal,cache:'no-store'}),body=await r.text();if(String(url).startsWith(API+'/')&&collectorClock&&!collectorClock.synced)collectorClock.observe(r.headers?.get('date'),started);return{ok:r.ok,status:r.status,url:r.url,headers:r.headers,text:async()=>body,json:async()=>JSON.parse(body)}}
 catch(error){if(c.signal.aborted){const failure=Error(String(url).startsWith(ROOT)?'انتهت مهلة الاتصال بأرابيكس؛ ستُعاد المحاولة تلقائيًا':'انتهت مهلة الاتصال بمرصد الأداء؛ ستُعاد المحاولة تلقائيًا');failure.name='TimeoutError';throw failure}throw error}
 finally{clearTimeout(t)}
}
async function collectorAction(body,headers={}){const r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),d=await r.json();if(!r.ok){const error=Error(d.error||'تعذر تجديد ربط الموصل');error.status=r.status;throw error}return d}
async function ensureCollectorAccess(force=false){
 if(collectorAuthFlight)return collectorAuthFlight;
 const epoch=collectorEpoch;
 collectorAuthFlight=(async()=>{
  const cfg=await config();if(!cfg?.enabled)throw Error('موصل الإدارة متوقف');
  const exp=Number(String(cfg.token||'').split('.')[0]);if(!force&&Number.isFinite(exp)&&exp>Date.now()+60*60*1000&&cfg.refreshToken)return cfg;
  let d;
  if(cfg.refreshToken)d=await collectorAction({action:'refresh',refreshToken:cfg.refreshToken});
  else if(cfg.token)d=await collectorAction({action:'upgrade'},{'x-history-token':cfg.token});
  else throw Error('افتح موصل الإدارة وفعّله مرة واحدة');
  return withCollectorState(async()=>{const current=await config();if(epoch!==collectorEpoch||!current?.enabled||current.token!==cfg.token||current.refreshToken!==cfg.refreshToken)throw Error('تغير ربط موصل الإدارة؛ ستُراجع الحالة الحالية في المحاولة التالية');
   const next={...current,token:d.token,...d.refreshToken?{refreshToken:d.refreshToken}:{}};
   await browser.storage.local.set({historyCollector:next});return next;
  });
 })().finally(()=>{collectorAuthFlight=null});
 return collectorAuthFlight;
}
async function activateCollectorFromAdmin(adminSession,resume=false){
 if(collectorSetupFlight)return collectorSetupFlight;
 const epoch=collectorEpoch;
 collectorSetupFlight=(async()=>{
  if((await browser.storage.local.get('historyCollectorPaused')).historyCollectorPaused&&!resume)return{ok:true,paused:true};
  const existing=await config();
  if(existing?.enabled&&(existing.token||existing.refreshToken)){try{await ensureCollectorAccess();if(epoch!==collectorEpoch)return{ok:true,paused:true};status={...status,message:'المزامنة التلقائية مفعّلة'};return{ok:true,already:true}}catch(error){if(![401,403].includes(error.status))throw error}}
  const startDate=daysBefore(today(),13);
  const d=await collectorAction({action:'token'},{'x-admin-password':adminSession});
  const installed=await withCollectorState(async()=>{if(epoch!==collectorEpoch)return false;await browser.storage.local.set({historyCollector:{...existing,enabled:true,token:d.token,refreshToken:d.refreshToken,startDate:existing?.startDate||startDate,nextDate:existing?.nextDate||startDate},historyCollectorPaused:false});return true});
  if(!installed){if(d.refreshToken)try{await collectorAction({action:'revoke',refreshToken:d.refreshToken})}catch{}return{ok:true,paused:true}}
  status={...status,message:'تم تفعيل المزامنة التلقائية واستكمال آخر 14 يومًا'};collectHistory();collectLive();return{ok:true}
 })().catch(error=>{status={...status,message:'تعذر تفعيل المزامنة التلقائية: '+(error.message||'تحقق من صلاحية حساب الإدارة')};throw error}).finally(()=>{collectorSetupFlight=null});
 return collectorSetupFlight;
}
async function resumeCollector(){
 const current=await config();let ready=false;
 if(current?.enabled&&(current.token||current.refreshToken))try{await ensureCollectorAccess();ready=true}catch(error){if(![401,403].includes(error.status))throw error}
 if(!ready){
  const tabs=await browser.tabs.query({url:'https://marsad-kpi-live.karim87nu.chatgpt.site/admin*'});let restored=false;
  for(const tab of tabs){if(!trustedAdminPage(tab.url))continue;let timer;try{const result=await Promise.race([browser.tabs.sendMessage(tab.id,{type:'COLLECTOR_RESUME_ADMIN'}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),10000)})]);if(result?.ok&&!result.paused){restored=true;break}}catch{}finally{clearTimeout(timer)}}
  if(!restored)throw Error('تعذر استئناف الربط. يلزم وجود صفحة الإدارة مسجّل دخولها في نفس Firefox؛ لن يتم طلب أو حفظ الباسورد هنا.');
 }
 await ensureCollectorAccess();collectHistory();return collectLive();
}
async function post(body){
 let cfg=await ensureCollectorAccess(),r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json','x-history-token':cfg.token},body:JSON.stringify(body)});
 if(r.status===401){cfg=await ensureCollectorAccess(true);r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json','x-history-token':cfg.token},body:JSON.stringify(body)})}
 const d=await r.json();if(!r.ok){const error=Error(r.status===401?'تعذر تجديد ربط الموصل؛ افتح إعداد الموصل وأعد ربطه مرة واحدة':d.error||'تعذر حفظ السجل');error.status=r.status;error.code=d.error;throw error}return d
}
let sourceFlight=null;
async function source(path,options={}){
 // A history request must not overlap our own live request on the same PHP
 // session. This does not serialize or intercept the native page's requests.
 const epoch=collectorEpoch;while(sourceFlight)await sourceFlight.catch(()=>{});
 if(epoch!==collectorEpoch)throw Error('تم إيقاف المزامنة');
 const flight=(async()=>{const r=await request(ROOT+path,{...options,credentials:'include'}),html=await r.text();if(!r.ok||/login\.php/i.test(r.url)||/<input[^>]+type=["']password/i.test(html))throw Error('سجل دخول إدارة أرابيكس مرة واحدة ثم أعد المحاولة');return html})();
 sourceFlight=flight;try{return await flight}finally{if(sourceFlight===flight)sourceFlight=null}
}
let nativeCollector=null,nativeClockFlight=null,nativeClockRetry=-Infinity;
async function ensureNativeClock(){
 if(collectorClock?.synced)return true;if(nativeClockFlight)return nativeClockFlight;
 if(!collectorClock||collectorClock.monotonic()<nativeClockRetry)return false;
 nativeClockFlight=request(API+'/api/employees/list').then(()=>collectorClock.synced).catch(()=>false).finally(()=>{nativeClockRetry=collectorClock.monotonic()+30000;nativeClockFlight=null});return nativeClockFlight;
}
function nativeCapture(){
 if(!nativeCollector&&collectorClock&&globalThis.createNativeLiveCapture)nativeCollector=globalThis.createNativeLiveCapture({clock:collectorClock,ensureClock:ensureNativeClock,config,epoch:()=>collectorEpoch,storage:browser.storage.local,locked:withQueueLock,post,onStatus:patch=>{status={...status,...patch}}});
 return nativeCollector;
}
function liveRows(html){
 const doc=new DOMParser().parseFromString('<table><tbody>'+html+'</tbody></table>','text/html'),rows=Array.from(doc.querySelectorAll('tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.textContent.trim())).filter(r=>r.length===11);
 if(html.trim()&&!rows.length)throw Error('رد اللايف غير معروف؛ اللقطة السابقة لم تُحدّث');
 return rows;
}
let nativeParsedCache=null;
function cachedLiveRows(html){
 const rows=nativeParsedCache?.epoch===collectorEpoch&&nativeParsedCache.html===html?nativeParsedCache.rows:liveRows(html);
 nativeParsedCache={epoch:collectorEpoch,html,rows};return rows;
}
async function ingestNativeLive(message,sender){
 const html=message.html;
 let u;try{u=new URL(sender.url||'')}catch{return{ok:false}}
 if(!sender.tab||u.hostname!=='41.38.207.218'||u.port!=='11594'||u.pathname!=='/themes/arabicssReportsInclude/dark/0004_inbound_calls.php'||typeof html!=='string'||html.length>1000000)return{ok:false};
 const runEpoch=collectorEpoch,cfg=await config();if(!cfg?.enabled){nativeParsedCache=null;return{ok:false}}
 try{
  // One bounded exact-response cache. Changed HTML is always parsed; even an
  // unchanged response still passes sequence, persistence and freshness checks.
  const rows=cachedLiveRows(html);
  return await nativeCapture()?.ingest(rows,{pageId:message.pageId,sequence:message.sequence,tabId:sender.tab.id})||{ok:false,error:'native_capture_unavailable'}
 }catch(e){return{ok:false,error:e.message||'invalid_native_report'}}
}
async function collectHistory(){
 if(busy)return;const epoch=collectorEpoch,cfg=await config();if(busy||!cfg?.enabled)return;busy=true;
 try{let date=cfg.nextDate||cfg.startDate;const end=today();
 for(let step=0;step<14&&date<=end;step++){
 const [y,m,d]=date.split('-'),v=m+'/'+d+'/'+y,html=await source('0002_inbound_calls.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({start_date:v,end_date:v}).toString()});
 if(epoch!==collectorEpoch)return;
 const doc=new DOMParser().parseFromString(html,'text/html'),table=doc.querySelector('#example23');if(!table)throw Error('لم يتم التعرف على جدول السجل');
 const header=Array.from(table.querySelectorAll('thead th')).map(c=>c.textContent.trim()),rows=Array.from(table.querySelectorAll('tbody tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.textContent.trim())).filter(r=>r.length===10);
 const label=Array.from(doc.querySelectorAll('h5')).find(e=>e.textContent.trim()==='All Inbound Calls'),count=Number(label?.previousElementSibling?.textContent.trim());
 if(!label||!Number.isInteger(count)||count!==rows.length)throw Error('السجل ناقص؛ لم تُحسب الفترة');
 const di=header.indexOf('Call Date');if(di<0||rows.some(r=>r[di]!==date))throw Error('التاريخ الذي أعاده أرابيكس لا يطابق المطلوب');
 await post({rows:[header,...rows],expectedCount:count,reportDate:date});
 if(epoch!==collectorEpoch)return;
 status={...status,message:'تم استكمال سجل '+date+' ('+rows.length+' مكالمة)',lastHistory:new Date().toISOString()};
 const current=await config();if(!current?.enabled||current.token!==cfg.token)break;
 const done=date===end;date=done?date:new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 await withCollectorState(async()=>{const latest=await config();if(epoch===collectorEpoch&&latest?.enabled)await browser.storage.local.set({historyCollector:{...latest,nextDate:date}})});if(done)break;
 }
 }catch(e){if(epoch===collectorEpoch)status={...status,message:e.message||'تعذر سحب السجل؛ راجع الاتصال وشهادة أرابيكس'}}finally{busy=false}
}
const directLivePageId=crypto.randomUUID();let directLiveSequence=0;
async function collectLive(){
 if(liveBusy)return{ok:true,pending:true};const epoch=collectorEpoch,cfg=await config();if(liveBusy)return{ok:true,pending:true};if(!cfg?.enabled)return{ok:false,error:'موصل الإدارة متوقف'};liveBusy=true;
 try{const passive=nativeCapture();if(passive){
  // Native event delivery is supplemental. Neither page activity, a queued
  // snapshot nor an ACK is allowed to disable the independent live reader.
  passive.flush().catch(()=>{});
 }
 const html=await source('get_inbound_calls_real_time.php'),rows=cachedLiveRows(html);
 if(epoch!==collectorEpoch)return{ok:false,error:'تم إيقاف المزامنة'};
 const capture=nativeCapture();if(!capture)throw Error('تعذر تجهيز الحفظ المحلي للايف');
 // Save before delivery. A slow upload must not stall subsequent source reads.
 // The shared outbox deduplicates ticking timers, preserves transitions and
 // retries the original capture ID instead of inventing a new event.
 return await capture.ingest(rows,{pageId:directLivePageId,sequence:++directLiveSequence,tabId:'direct',waitForDelivery:false});
 }catch(e){if(epoch!==collectorEpoch)return{ok:false,error:'تم إيقاف المزامنة'};status={...status,liveError:e.message||'تعذر سحب اللايف'};return{ok:false,error:status.liveError}}finally{liveBusy=false}
}
browser.runtime.onMessage.addListener(async(message,sender)=>{
 // Retired report-page bridge messages may survive an update until refresh.
 // Ignore them: direct polling is the sole source of new report snapshots.
 if(message?.type==='NATIVE_REPORT_LIVE')return{ok:false,ignored:true};
 if(message?.type==='EMPLOYEE_ALERT'){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  await startupCleanup;
  return withQueueLock(async()=>{
   const entry=((await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{})[sender.tab.id];
   if(!entry||entry.pendingClose||entry.token!==message.token)return {ok:false};
   const seconds=Math.max(60,Number(entry.state?.breakAllowedSeconds)||900),duration=(Math.floor(seconds/60)+' دقيقة'+(seconds%60?' و'+seconds%60+' ثانية':''));
   const kinds={call_long:['مكالمتك تجاوزت 4 دقائق','راجع احتياج العميل واستكمل خدمته؛ التنبيه لا ينهي المكالمة.'],break_warning:['باقي دقيقة على نهاية البريك','المدة المتاحة لهذا البريك: '+duration+'. استعد للعودة لاستقبال المكالمات.'],break_limit:['انتهت مدة البريك','انتهت المدة المتاحة: '+duration+'. ارجع لاستقبال المكالمات.'],break_grace:['بدأ سماح البريك','الزيادة عن 15 دقيقة تُخصم من البريك الثاني؛ إجمالي المتاح لهذا البريك: '+duration+'.']};
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
  return closeTracked(sender.tab.id,message.reason,message.token);
 }
 if(['REGISTER_SESSION','UNREGISTER_SESSION'].includes(message?.type)){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  await startupCleanup;
  return withQueueLock(async()=>{
   const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};
   if(message.type==='REGISTER_SESSION'){
    if(!message.token||!message.deviceToken)throw Error('invalid_session');
    if(entries[sender.tab.id]?.pendingClose&&entries[sender.tab.id].token===message.token)return {ok:false,closing:true};
    if(Object.entries(entries).some(([id,e])=>Number(id)!==sender.tab.id&&e.token===message.token&&!e.pendingClose))return {ok:false,duplicate:true};
    if(entries[sender.tab.id]?.pendingClose&&entries[sender.tab.id].token!==message.token){entries['pending-'+crypto.randomUUID()]=entries[sender.tab.id];delete entries[sender.tab.id]}
    const previous=entries[sender.tab.id]?.token===message.token?entries[sender.tab.id]:{};
    entries[sender.tab.id]={...previous,token:message.token,deviceToken:message.deviceToken,employee:message.employee||previous.employee,version:message.version||previous.version,state:message.state||previous.state,pendingClose:false};
   }else if(entries[sender.tab.id]?.token===message.token)delete entries[sender.tab.id];
   await browser.storage.local.set({[TAB_SESSIONS]:entries});return {ok:true};
  });
 }
 if(['QUEUE_EVENT','FLUSH_EVENTS','ACK_EVENT','REJECT_EVENT'].includes(message?.type)){
  if(!sender.tab||new URL(sender.url||'').hostname!=='41.38.207.218')throw Error('invalid_sender');
  if(message.type==='FLUSH_EVENTS')return flushQueuedEvents(message.deviceToken);
  if(message.type==='ACK_EVENT'||message.type==='REJECT_EVENT')return withQueueLock(async()=>{
   const q=(await browser.storage.local.get(QUEUE))[QUEUE]||[],matching=q.filter(e=>e.eventKey===message.eventKey&&e._sessionToken===message.token);
   if(!matching.length)return{ok:true};const update={[QUEUE]:q.filter(e=>!matching.includes(e))};
   if(message.type==='REJECT_EVENT'){const count=Number((await browser.storage.local.get('kpi_rejected_event_count')).kpi_rejected_event_count)||0;await preserveRejected(update,matching.map(e=>({...e,_reason:String(message.reason||'rejected').slice(0,2000),_rejectedAt:new Date().toISOString()})),count)}
   await browser.storage.local.set(update);if(message.type==='REJECT_EVENT')rememberRejected(matching.map(e=>({...e,_reason:message.reason})));return{ok:true};
  });
  return withQueueLock(async()=>{
   const q=(await browser.storage.local.get(QUEUE))[QUEUE]||[];
   if(terminalEvents.has(outcomeKey({...message.event,_sessionToken:message.token})))return{ok:true,terminal:true};
   const existing=message.event?.eventKey&&q.find(e=>e.eventKey===message.event.eventKey&&e._sessionToken===message.token);
   if(existing){if(message.replaceUnverified&&existing.payload?.eventClock?.method==='unsynchronized'){Object.assign(existing,message.event);await browser.storage.local.set({[QUEUE]:q})}return {ok:true,duplicate:true,pending:q.length}}
   q.push({...message.event,_sessionToken:message.token,_queueId:crypto.randomUUID()});await browser.storage.local.set({[QUEUE]:q});return {ok:true,pending:q.length}
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
  return activateCollectorFromAdmin(message.token,message.resume===true);
 }
 if(String(message?.type||'').startsWith('COLLECTOR_')){
 if(sender.url!==browser.runtime.getURL('collector.html'))throw Error('invalid_sender');
 if(message.type==='COLLECTOR_STATUS'){const c=await config();if(c?.enabled&&status.message==='موصل الإدارة غير مفعّل')status={...status,message:'المزامنة التلقائية مفعّلة'};return{...status,config:c?{enabled:c.enabled,startDate:c.startDate,nextDate:c.nextDate}:null}}
 if(message.type==='COLLECTOR_STOP'){collectorEpoch++;const c=await withCollectorState(async()=>{await browser.storage.local.set({historyCollectorPaused:true});const c=await config();await browser.storage.local.remove('historyCollector');return c});if(c?.refreshToken)try{await collectorAction({action:'revoke',refreshToken:c.refreshToken})}catch{}status={message:'موصل الإدارة متوقف باختيارك — اضغط مزامنة الآن لاستئنافه'};return{ok:true}}
 if(message.type==='COLLECTOR_SYNC'){try{return await resumeCollector()}catch(error){status={...status,message:error.message};return{ok:false,error:error.message}}}
 return;
 }
 if(message?.type!=='KPI_API')return;
 if(!sender.url||new URL(sender.url).hostname!=='41.38.207.218')throw Error('invalid_sender');
 const path=String(message.path||'');if(!/^\/api\/(employees\/list(?:\?.*)?|session\/(?:start|end)|events|messages|break-requests)$/.test(path))throw Error('invalid_path');
 const r=path==='/api/events'&&message.method==='POST'?await deliverEvent(message.headers?.['x-device-token'],JSON.parse(message.body||'{}'),message.headers?.['x-employee-session']):await request(API+path,{method:message.method||'GET',headers:message.headers||{},body:message.body});return{status:r.status,ok:r.ok,serverDate:r.fromCache?null:r.headers?.get('date')||null,body:await r.text()}
});
setInterval(collectHistory,300000);setInterval(collectLive,5000);collectLive();collectHistory();
setInterval(()=>config().then(c=>c?.enabled?ensureCollectorAccess():null).catch(e=>{status={...status,liveError:e.message||'تعذر تجديد ربط الموصل'}}),5*60*1000);
setInterval(()=>retryPendingClosures().catch(()=>{}),10000);

